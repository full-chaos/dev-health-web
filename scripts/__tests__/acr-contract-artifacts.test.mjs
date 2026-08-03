import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    acquireArtifactLock,
    currentArtifacts,
    writeArtifacts,
} from "../acr-contract-artifacts.mjs";
import { isNotLockState } from "./acr-fixture-copy.mjs";

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

function withLease(artifactRoot, operation) {
    const release = acquireArtifactLock(artifactRoot);
    try {
        return operation(release);
    } finally {
        release();
    }
}

function createTemporaryProject() {
    const root = fs.mkdtempSync(path.join(ROOT, ".tmp-acr-contract-security-"));
    const artifactRoot = path.join(root, "src/lib/acr/contracts");
    const script = path.join(root, "scripts/sync-acr-contracts.mjs");
    fs.mkdirSync(path.dirname(artifactRoot), { recursive: true });
    fs.cpSync(ARTIFACT_ROOT, artifactRoot, { recursive: true, filter: isNotLockState });
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

        expect(() =>
            withLease(project.artifactRoot, (lease) =>
                writeArtifacts(lease, { "../escape.txt": "escape" }),
            ),
        ).toThrow("unsafe artifact path");
        expect(fs.existsSync(path.join(project.root, "src/lib/acr/escape.txt"))).toBe(false);
    });

    it("restores the artifact preimage when staging a write fails", () => {
        const project = createTemporaryProject();
        const before = artifactSnapshot(project.artifactRoot);

        expect(() =>
            withLease(project.artifactRoot, (lease) =>
                writeArtifacts(lease, {
                    "examples/context_packet.v1.json": "changed",
                    "schemas/context_packet.v1.schema.json": undefined,
                }),
            ),
        ).toThrow();

        expect(artifactSnapshot(project.artifactRoot)).toEqual(before);
    });

    it("revalidates its owner lease before every artifact transaction mutation", () => {
        const project = createTemporaryProject();
        const lease = () => undefined;
        lease.assert = vi.fn(() => project.artifactRoot);

        writeArtifacts(lease, {
            "examples/context_packet.v1.json": "changed example",
            "schemas/context_packet.v1.schema.json": "changed schema",
        });

        expect(lease.assert).toHaveBeenCalledTimes(9);
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

    it("rejects artifact reads that do not hold an active lease", () => {
        const project = createTemporaryProject();
        const sourceCommit = JSON.parse(
            fs.readFileSync(path.join(project.artifactRoot, "manifest.json"), "utf8"),
        ).source_commit;

        expect(() => currentArtifacts(project.artifactRoot, sourceCommit)).toThrow(
            "active artifact lease",
        );
    });

    it("does not release a lease after another owner replaces its lock", () => {
        const project = createTemporaryProject();
        const lockPath = path.join(project.artifactRoot, ".acr-contract-sync.lock");
        const release = acquireArtifactLock(project.artifactRoot);
        fs.rmSync(lockPath);
        fs.writeFileSync(lockPath, "replacement\n", { mode: 0o600 });

        expect(release).toThrow("active artifact lease was replaced");
        expect(fs.readFileSync(lockPath, "utf8")).toBe("replacement\n");
    });

    // The bound is injected, not mocked (CHAOS-3341). This used to script the
    // process-wide clock with `vi.spyOn(Date, "now").mockReturnValueOnce(0)`,
    // where any other reader between the spy and acquireArtifactLock's first
    // reading consumes the once-value and pushes the deadline permanently out
    // of reach — and since the wait loop is synchronous, the resulting hang
    // cannot be cut short by a test timeout. A real 50ms bound against the
    // real clock cannot be stolen, still crosses the deadline through the
    // genuine wait-and-recheck loop, and leaves no global to restore.
    it("bounds a live-owner wait without leaking a failed contender lock file", () => {
        const project = createTemporaryProject();
        const release = acquireArtifactLock(project.artifactRoot);

        try {
            expect(() => acquireArtifactLock(project.artifactRoot, { timeoutMillis: 50 })).toThrow(
                "artifact generation lock timed out",
            );
        } finally {
            release();
        }

        const leftovers = fs
            .readdirSync(project.artifactRoot)
            .filter(
                (entry) => entry.startsWith(".acr-contract-sync.lock.") && entry.endsWith(".tmp"),
            );
        expect(leftovers).toEqual([]);
    });

    // CHAOS-3341 regression guard, and the deterministic form of the flake
    // that motivated it. The committed artifact root is a live lock directory
    // during a unit run — sync-acr-contracts.test.mjs shells the real sync
    // script at it from a parallel worker — so an isolated fixture must never
    // inherit whatever lock state is in flight when it is copied. Planting the
    // exact contender temp file that used to be copied in makes that failure
    // reproducible on demand: without the copy filter the fixture below
    // contains it, and the leftover assertion in the timeout test above then
    // fails on a file no test ever wrote.
    //
    // The plant goes into the real artifact root, so cleanup is armed BEFORE
    // the write: a write that fails partway (ENOSPC, EIO) still leaves the
    // file, and an uncleaned lock-family file in a tracked directory dirties
    // the checkout — which the new copy filter would then hide from every
    // later fixture assertion.
    it("keeps a planted contender lock out of an isolated fixture copy", () => {
        const planted = path.join(ARTIFACT_ROOT, `.acr-contract-sync.lock.${randomUUID()}.tmp`);

        try {
            fs.writeFileSync(planted, "contender\n", { mode: 0o600 });
            const project = createTemporaryProject();

            expect(
                fs
                    .readdirSync(project.artifactRoot)
                    .filter((entry) => entry.startsWith(".acr-contract-sync.lock")),
            ).toEqual([]);
        } finally {
            fs.rmSync(planted, { force: true });
        }
    });

    it("recovers a lock only after proving its owner process is dead", () => {
        const project = createTemporaryProject();
        const lockPath = path.join(project.artifactRoot, ".acr-contract-sync.lock");
        fs.writeFileSync(
            lockPath,
            `${JSON.stringify({
                acquired_at: Date.now(),
                host_hash: sha256(hostname()),
                owner_token: randomUUID(),
                pid: 2_147_483_647,
                process_start: "dead process",
                schema_version: "acr_contract_lock.v1",
            })}\n`,
            { mode: 0o600 },
        );

        const release = acquireArtifactLock(project.artifactRoot);

        expect(fs.existsSync(lockPath)).toBe(true);
        release();
        expect(fs.existsSync(lockPath)).toBe(false);
        expect(fs.existsSync(`${lockPath}.recovery`)).toBe(false);

        fs.writeFileSync(
            `${lockPath}.recovery`,
            `${JSON.stringify({
                acquired_at: Date.now(),
                host_hash: sha256(hostname()),
                owner_token: randomUUID(),
                pid: 2_147_483_647,
                process_start: "dead recovery process",
                schema_version: "acr_contract_lock.v1",
            })}\n`,
            { mode: 0o600 },
        );

        const recovered = acquireArtifactLock(project.artifactRoot);

        recovered();
        expect(fs.existsSync(`${lockPath}.recovery`)).toBe(false);
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

    sourceTest("rejects an untracked file in a pinned source checkout", () => {
        const project = createTemporaryProject();
        const sourceClone = path.join(project.root, "untracked-source");
        const commit = JSON.parse(
            fs.readFileSync(path.join(ARTIFACT_ROOT, "manifest.json"), "utf8"),
        ).source_commit;
        execFileSync("git", ["clone", "--no-checkout", SOURCE, sourceClone]);
        execFileSync("git", ["checkout", "--detach", commit], { cwd: sourceClone });
        fs.writeFileSync(path.join(sourceClone, "unexpected-source-input"), "untracked\n");

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

    sourceTest(
        "keeps readers parseable during concurrent isolated generation",
        async () => {
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
        },
        20_000,
    );
});
