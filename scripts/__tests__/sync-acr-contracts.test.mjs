import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { isNotLockState } from "./acr-fixture-copy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/sync-acr-contracts.mjs");
const SOURCE = process.env.ACR_ROOT;
const ARTIFACT_ROOT = path.join(ROOT, "src/lib/acr/contracts");
const MUTATED_FIXTURE = path.join(ROOT, "tests/fixtures/acr-contracts-mutated");
const TEMPORARY_PROJECTS = new Set();

function run(args, { cwd = ROOT, script = SCRIPT, environment = {} } = {}) {
    const env = { ...process.env, ...environment };
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete env[key];
    }
    return spawnSync(process.execPath, [script, ...args], {
        cwd,
        encoding: "utf8",
        env,
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
    return paths.map((relativePath) => {
        const filePath = path.resolve(artifactRoot, relativePath);
        return [relativePath, fs.readFileSync(filePath, "utf8")];
    });
}

function committedArtifactSnapshot() {
    return artifactSnapshot(ARTIFACT_ROOT);
}

function createTemporaryProject() {
    const root = fs.mkdtempSync(path.join(ROOT, ".tmp-acr-contracts-"));
    const artifactRoot = path.join(root, "src/lib/acr/contracts");
    const script = path.join(root, "scripts/sync-acr-contracts.mjs");

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

describe("sync-acr-contracts", () => {
    const sourceTest = SOURCE === undefined ? it.skip : it;

    sourceTest("valid pinned ACR source generates byte-identical isolated artifacts twice", () => {
        const project = createTemporaryProject();
        const expectedCommit = JSON.parse(
            fs.readFileSync(path.join(ARTIFACT_ROOT, "manifest.json"), "utf8"),
        ).source_commit;
        const options = {
            cwd: project.root,
            script: project.script,
            environment: { ACR_ROOT: SOURCE },
        };
        const command = ["generate", "--allow-write", "--expected-commit", expectedCommit];

        const first = run(command, options);
        expect(first.status).toBe(0);
        const before = artifactSnapshot(project.artifactRoot);

        const second = run(command, options);
        expect(second.status).toBe(0);

        expect(artifactSnapshot(project.artifactRoot)).toEqual(before);
    });

    sourceTest("generates referenced schemas without relying on pre-existing artifacts", () => {
        const project = createTemporaryProject();
        const expectedCommit = JSON.parse(
            fs.readFileSync(path.join(ARTIFACT_ROOT, "manifest.json"), "utf8"),
        ).source_commit;
        const referencedSchema = path.join(
            project.artifactRoot,
            "schemas/acr_client_credential.v1.schema.json",
        );
        fs.rmSync(referencedSchema);

        const result = run(["generate", "--allow-write", "--expected-commit", expectedCommit], {
            cwd: project.root,
            script: project.script,
            environment: { ACR_ROOT: SOURCE },
        });

        expect(result.status).toBe(0);
        expect(fs.existsSync(referencedSchema)).toBe(true);
    });

    it("checks committed artifacts without requiring the sibling ACR checkout", () => {
        const result = run(["check"], { environment: { ACR_ROOT: undefined } });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain("ACR contracts are current");
    });

    it("records the exact Todo 4 primary order before the explicit OpenAPI schema closure", () => {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(ARTIFACT_ROOT, "manifest.json"), "utf8"),
        );

        expect(manifest.files.map((file) => file.path)).toEqual([
            "openapi/acr-v1.json",
            "schemas/capabilities.v1.schema.json",
            "schemas/context_packet.v1.schema.json",
            "schemas/context_packet_item.v1.schema.json",
            "schemas/context_packet_request.v1.schema.json",
            "schemas/error.v1.schema.json",
            "schemas/evidence_ref.v1.schema.json",
            "schemas/expanded_evidence.v1.schema.json",
            "examples/context_packet.v1.json",
            "examples/expanded_evidence.v1.json",
            "schemas/acr_client_credential.v1.schema.json",
            "schemas/agent_episode.v1.schema.json",
            "schemas/agent_episode_create.v1.schema.json",
            "schemas/context_fabric_common.v1.schema.json",
            "schemas/context_fabric_investigation_request.v1.schema.json",
            "schemas/context_fabric_investigation_result.v1.schema.json",
            "schemas/context_fabric_org_model_config.v1.schema.json",
            "schemas/context_fabric_org_model_config_write_request.v1.schema.json",
            "schemas/credential_revoke_request.v1.schema.json",
            "schemas/credential_revoke_response.v1.schema.json",
            "schemas/credential_rotate_request.v1.schema.json",
            "schemas/credential_rotate_response.v1.schema.json",
            "schemas/device_approval_preview_request.v1.schema.json",
            "schemas/device_approval_preview_response.v1.schema.json",
            "schemas/device_approval_request.v1.schema.json",
            "schemas/device_approval_response.v1.schema.json",
            "schemas/device_authorization_request.v1.schema.json",
            "schemas/device_authorization_response.v1.schema.json",
            "schemas/device_token_request.v1.schema.json",
            "schemas/device_token_response.v1.schema.json",
            "schemas/oauth_device_error.v1.schema.json",
        ]);
    });

    it("rejects an invalid defined ACR_ROOT instead of skipping required mutation tests", () => {
        const result = run(["check"], { environment: { ACR_ROOT: MUTATED_FIXTURE } });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("source must be a Git worktree root");
    });

    it("requires explicit write consent before generation and preserves committed artifacts", () => {
        const before = committedArtifactSnapshot();
        const project = createTemporaryProject();

        const result = run(["generate", "--source", ROOT], {
            cwd: project.root,
            script: project.script,
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("generate requires --allow-write");
        expect(committedArtifactSnapshot()).toEqual(before);
    });

    it("fails an isolated digest mutation without changing committed artifacts", () => {
        const before = committedArtifactSnapshot();
        const project = createTemporaryProject();
        const fixture = path.join(project.artifactRoot, "examples/context_packet.v1.json");
        fs.appendFileSync(fixture, "\n");

        const result = run(["check"], {
            cwd: project.root,
            script: project.script,
            environment: { ACR_ROOT: undefined },
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("digest drift");
        expect(committedArtifactSnapshot()).toEqual(before);
    });

    it("fails an isolated malformed schema without rewriting committed artifacts", () => {
        const before = committedArtifactSnapshot();
        const project = createTemporaryProject();
        const schema = path.join(project.artifactRoot, "schemas/context_packet.v1.schema.json");
        const manifest = path.join(project.artifactRoot, "manifest.json");
        const malformed = "{\n";
        const updatedManifest = JSON.parse(fs.readFileSync(manifest, "utf8"));
        const entry = updatedManifest.files.find(
            (file) => file.path === "schemas/context_packet.v1.schema.json",
        );
        entry.sha256 = sha256(malformed);
        fs.writeFileSync(schema, malformed);
        fs.writeFileSync(manifest, `${JSON.stringify(updatedManifest, null, 2)}\n`);

        const result = run(["check"], {
            cwd: project.root,
            script: project.script,
            environment: { ACR_ROOT: undefined },
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("JSON");
        expect(committedArtifactSnapshot()).toEqual(before);
    });
});
