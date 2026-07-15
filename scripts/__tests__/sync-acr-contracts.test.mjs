import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/sync-acr-contracts.mjs");
const SOURCE = process.env.ACR_ROOT;
const ARTIFACT_ROOT = path.join(ROOT, "src/lib/acr/contracts");
const MUTATED_FIXTURE = path.join(ROOT, "tests/fixtures/acr-contracts-mutated");
function run(args, environment = {}) {
    const env = { ...process.env, ...environment };
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete env[key];
    }
    return spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: ROOT,
        encoding: "utf8",
        env,
    });
}

function committedArtifactSnapshot() {
    const manifest = JSON.parse(fs.readFileSync(path.join(ARTIFACT_ROOT, "manifest.json"), "utf8"));
    const paths = [
        "manifest.json",
        "../contracts.ts",
        "../generated.ts",
        ...manifest.files.map((file) => file.path),
    ];
    return paths.map((relativePath) => {
        const filePath = path.resolve(ARTIFACT_ROOT, relativePath);
        return [relativePath, fs.readFileSync(filePath, "utf8")];
    });
}

describe("sync-acr-contracts", () => {
    const sourceTest =
        SOURCE === undefined ||
        !fs.existsSync(path.join(SOURCE, ".git")) ||
        !fs.existsSync(path.join(SOURCE, "contracts"))
            ? it.skip
            : it;
    const artifactMutationTest = SOURCE === undefined ? it : it.skip;

    sourceTest("generates byte-identical artifacts twice from the pinned ACR commit", () => {
        const first = run(["generate"], { ACR_ROOT: SOURCE });
        expect(first.status).toBe(0);
        const before = execFileSync("git", ["diff", "--binary", "--", "src/lib/acr"], {
            cwd: ROOT,
            encoding: "utf8",
        });

        const second = run(["generate"], { ACR_ROOT: SOURCE });
        expect(second.status).toBe(0);
        const after = execFileSync("git", ["diff", "--binary", "--", "src/lib/acr"], {
            cwd: ROOT,
            encoding: "utf8",
        });

        expect(after).toBe(before);
    });

    it("checks committed artifacts without requiring the sibling ACR checkout", () => {
        const result = run(["check"], { ACR_ROOT: undefined });

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
            "schemas/agent_episode.v1.schema.json",
            "schemas/agent_episode_create.v1.schema.json",
        ]);
    });

    it("rejects the tracked mutated source fixture without changing committed artifacts", () => {
        const before = committedArtifactSnapshot();

        const result = run(["check", "--source", MUTATED_FIXTURE]);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("artifact drift");
        expect(committedArtifactSnapshot()).toEqual(before);
    });

    artifactMutationTest("fails a mutated fixture without changing committed artifacts", () => {
        const fixture = path.join(ARTIFACT_ROOT, "examples/context_packet.v1.json");
        const before = fs.readFileSync(fixture, "utf8");
        fs.appendFileSync(fixture, "\n");

        try {
            const result = run(["check"], { ACR_ROOT: undefined });

            expect(result.status).toBe(1);
            expect(result.stderr).toContain("digest drift");
        } finally {
            fs.writeFileSync(fixture, before);
        }

        expect(fs.readFileSync(fixture, "utf8")).toBe(before);
    });

    artifactMutationTest("fails a malformed schema without rewriting committed artifacts", () => {
        const schema = path.join(ARTIFACT_ROOT, "schemas/context_packet.v1.schema.json");
        const manifest = path.join(ARTIFACT_ROOT, "manifest.json");
        const schemaBefore = fs.readFileSync(schema, "utf8");
        const manifestBefore = fs.readFileSync(manifest, "utf8");
        const malformed = "{\n";
        const updatedManifest = JSON.parse(manifestBefore);
        const entry = updatedManifest.files.find(
            (file) => file.path === "schemas/context_packet.v1.schema.json",
        );
        entry.sha256 = execFileSync("shasum", ["-a", "256"], { encoding: "utf8", input: malformed })
            .trim()
            .split(/\s+/u)[0];
        fs.writeFileSync(schema, malformed);
        fs.writeFileSync(manifest, `${JSON.stringify(updatedManifest, null, 2)}\n`);

        try {
            const result = run(["check"], { ACR_ROOT: undefined });

            expect(result.status).toBe(1);
            expect(result.stderr).toContain("JSON");
        } finally {
            fs.writeFileSync(schema, schemaBefore);
            fs.writeFileSync(manifest, manifestBefore);
        }

        expect(fs.readFileSync(schema, "utf8")).toBe(schemaBefore);
        expect(fs.readFileSync(manifest, "utf8")).toBe(manifestBefore);
    });
});
