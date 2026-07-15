import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { writeArtifacts } from "../acr-contract-artifacts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/sync-acr-contracts.mjs");
const SOURCE = process.env.ACR_ROOT;
const ARTIFACT_ROOT = path.join(ROOT, "src/lib/acr/contracts");
const TEMPORARY_PROJECTS = new Set();

function run(project, args, environment = {}) {
    return spawnSync(process.execPath, [project.script, ...args], {
        cwd: project.root,
        encoding: "utf8",
        env: { ...process.env, ...environment, ACR_ROOT: undefined },
    });
}

function runAsync(project, args, environment = {}) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [project.script, ...args], {
            cwd: project.root,
            env: { ...process.env, ...environment, ACR_ROOT: undefined },
            stdio: "ignore",
        });
        child.once("exit", (status) => resolve(status));
    });
}

function artifactSnapshot(artifactRoot) {
    const manifest = JSON.parse(fs.readFileSync(path.join(artifactRoot, "manifest.json"), "utf8"));
    const paths = [
        "manifest.json",
        "../contracts.ts",
        "../generated.ts",
        ...manifest.files.map((file) => file.path),
    ];
    return paths.map((relativePath) => [
        relativePath,
        fs.readFileSync(path.resolve(artifactRoot, relativePath), "utf8"),
    ]);
}

function createTemporaryProject() {
    const root = fs.mkdtempSync(path.join(ROOT, ".tmp-acr-contract-security-"));
    const artifactRoot = path.join(root, "src/lib/acr/contracts");
    const script = path.join(root, "scripts/sync-acr-contracts.mjs");
    fs.cpSync(ARTIFACT_ROOT, artifactRoot, { recursive: true });
    fs.rmSync(path.join(artifactRoot, ".acr-contract-sync.lock"), { force: true });
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(SCRIPT, script);
    fs.copyFileSync(
        path.join(ROOT, "scripts/acr-contract-artifacts.mjs"),
        path.join(root, "scripts/acr-contract-artifacts.mjs"),
    );
    fs.copyFileSync(
        path.join(ROOT, "scripts/acr-contract-filesystem.mjs"),
        path.join(root, "scripts/acr-contract-filesystem.mjs"),
    );
    fs.copyFileSync(
        path.join(ROOT, "src/lib/acr/contracts.ts"),
        path.join(root, "src/lib/acr/contracts.ts"),
    );
    fs.copyFileSync(
        path.join(ROOT, "src/lib/acr/generated.ts"),
        path.join(root, "src/lib/acr/generated.ts"),
    );
    TEMPORARY_PROJECTS.add(root);
    return { artifactRoot, root, script };
}

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

afterEach(() => {
    for (const projectRoot of TEMPORARY_PROJECTS) {
        fs.rmSync(projectRoot, { force: true, recursive: true });
    }
    TEMPORARY_PROJECTS.clear();
});

describe("ACR contract artifact filesystem boundaries", () => {
    it("rejects a symlinked Git source root", () => {
        const project = createTemporaryProject();
        const sourceLink = path.join(project.root, "source-link");
        fs.symlinkSync(ROOT, sourceLink);

        const result = run(project, ["check", "--source", sourceLink]);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("source must be a Git worktree root");
    });

    it("rejects artifact path traversal before writing outside the artifact allowlist", () => {
        const project = createTemporaryProject();

        expect(() => writeArtifacts(project.artifactRoot, { "../escape.txt": "escape" })).toThrow(
            "unsafe artifact path",
        );
        expect(fs.existsSync(path.join(project.root, "src/lib/acr/escape.txt"))).toBe(false);
    });

    it("restores the artifact preimage when staging a write fails", () => {
        const project = createTemporaryProject();
        const before = artifactSnapshot(project.artifactRoot);

        expect(() =>
            writeArtifacts(project.artifactRoot, {
                "examples/context_packet.v1.json": "changed",
                "schemas/context_packet.v1.schema.json": undefined,
            }),
        ).toThrow();

        expect(artifactSnapshot(project.artifactRoot)).toEqual(before);
    });

    it("rejects symlinked artifact directories instead of reading through them", () => {
        const project = createTemporaryProject();
        const schemaDirectory = path.join(project.artifactRoot, "schemas");
        const outside = path.join(project.root, "outside");
        fs.mkdirSync(outside);
        fs.rmSync(schemaDirectory, { force: true, recursive: true });
        fs.symlinkSync(outside, schemaDirectory);

        const result = run(project, ["check"]);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("unsafe artifact path");
    });

    it("rejects manifest path traversal before reading outside the artifact allowlist", () => {
        const project = createTemporaryProject();
        const manifestPath = path.join(project.artifactRoot, "manifest.json");
        const outsidePath = path.join(project.root, "outside.json");
        const contents = "{}\n";
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        fs.writeFileSync(outsidePath, contents);
        manifest.files[0] = { path: "../outside.json", sha256: sha256(contents) };
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

        const result = run(project, ["check"]);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("unsafe artifact path");
    });

    it("reclaims a stale lock owned by a dead process before checking artifacts", () => {
        const project = createTemporaryProject();
        const lockPath = path.join(project.artifactRoot, ".acr-contract-sync.lock");
        fs.writeFileSync(
            lockPath,
            `${JSON.stringify({ created_at: Date.now() - 10 * 60_000, pid: 999_999_999 })}\n`,
            { mode: 0o600 },
        );

        const result = run(project, ["check"]);

        expect(result.status).toBe(0);
        expect(fs.existsSync(lockPath)).toBe(false);
    });

    const sourceTest = SOURCE === undefined ? it.skip : it;

    sourceTest("rejects a dirty tracked pinned source checkout", () => {
        const project = createTemporaryProject();
        const sourceClone = path.join(project.root, "dirty-source");
        const commit = JSON.parse(
            fs.readFileSync(path.join(ARTIFACT_ROOT, "manifest.json"), "utf8"),
        ).source_commit;
        execFileSync("git", ["clone", "--no-checkout", SOURCE, sourceClone]);
        execFileSync("git", ["checkout", "--detach", commit], { cwd: sourceClone });
        fs.appendFileSync(path.join(sourceClone, "contracts/openapi/acr-v1.json"), "\n");

        const result = run(project, ["check", "--source", sourceClone]);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("source worktree must be clean");
    });

    sourceTest("rejects a full Git revision that differs from the pinned source", () => {
        const project = createTemporaryProject();
        const alternateCommit = execFileSync("git", ["rev-parse", "HEAD^"], {
            cwd: SOURCE,
            encoding: "utf8",
        }).trim();

        const result = run(project, [
            "check",
            "--source",
            SOURCE,
            "--expected-commit",
            alternateCommit,
        ]);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("expected commit must equal");
    });

    sourceTest("keeps readers parseable during concurrent isolated generation", async () => {
        const project = createTemporaryProject();
        const commit = JSON.parse(
            fs.readFileSync(path.join(ARTIFACT_ROOT, "manifest.json"), "utf8"),
        ).source_commit;
        const generate = [
            "generate",
            "--allow-write",
            "--source",
            SOURCE,
            "--expected-commit",
            commit,
        ];

        const statuses = await Promise.all([
            ...Array.from({ length: 4 }, () => runAsync(project, generate)),
            ...Array.from({ length: 12 }, () => runAsync(project, ["check"])),
        ]);

        expect(statuses).toEqual(Array(statuses.length).fill(0));
    });
});
