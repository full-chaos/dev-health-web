import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    acquireArtifactLock,
    currentArtifacts,
    expectedArtifacts,
    stripInterfaceDeclaration,
    writeArtifacts,
} from "../acr-contract-artifacts.mjs";
import { isNotLockState } from "./acr-fixture-copy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/sync-acr-contracts.mjs");
const SOURCE = process.env.ACR_ROOT;
const ARTIFACT_ROOT = path.join(ROOT, "src/lib/acr/contracts");
const TEMPORARY_PROJECTS = new Set();
const TSC_BIN = path.join(ROOT, "node_modules/.bin/tsc");
const CODEGEN_PRETTIER_OPTIONS = Object.freeze({
    parser: "typescript",
    printWidth: 100,
    semi: true,
    singleQuote: false,
    tabWidth: 4,
    trailingComma: "all",
    useTabs: false,
});

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
        // CHAOS-3791: budget grew from 20s alongside SOURCE_PATHS (26 -> 34
        // files after the CHAOS-3784 pin bump added the context-fabric
        // investigation/model-config closure); 16 concurrent subprocesses now
        // each copy/hash more files.
        40_000,
    );
});

function fixtureSchemaFile(basename, schema) {
    return {
        path: `contracts/jsonschema/v1/${basename}`,
        contents: `${JSON.stringify(schema, null, 2)}\n`,
    };
}

async function generatedDts(sourceFiles) {
    const artifacts = await expectedArtifacts({
        sourceCommit: "0000000000000000000000000000000000000000",
        sourceFiles,
        prettierOptions: CODEGEN_PRETTIER_OPTIONS,
    });
    return artifacts["../generated.ts"];
}

function typecheck(source) {
    // Run from outside ROOT (cwd, not just the file's directory) so tsc
    // doesn't detect the repo's tsconfig.json — TS5112 refuses to combine
    // a discovered tsconfig with an explicit file list on the CLI.
    const directory = fs.mkdtempSync(path.join(tmpdir(), "acr-codegen-fixture-"));
    const file = path.join(directory, "fixture.ts");
    fs.writeFileSync(file, source);
    try {
        return spawnSync(TSC_BIN, ["--noEmit", "--strict", "--skipLibCheck", file], {
            cwd: directory,
            encoding: "utf8",
        });
    } finally {
        fs.rmSync(directory, { force: true, recursive: true });
    }
}

describe("ACR contract cross-file $defs codegen", () => {
    // CHAOS-3791: minimal two-file fixture reproducing the CHAOS-3784 pin
    // bump's shape — one file (owner) exposes only $defs, no root type; a
    // second file (consumer) $refs into the owner's $defs by JSON pointer.
    // Every prior cross-file $ref in this repo pointed at another file's
    // ROOT schema; this is the first one that points into a sub-location.
    const ownerSchema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://contracts.fullchaos.dev/acr/v1/fixture_owner.v1.schema.json",
        title: "Fixture Owner",
        $defs: {
            Widget: {
                type: "object",
                additionalProperties: false,
                required: ["name"],
                properties: { name: { type: "string" } },
            },
        },
    };
    const consumerSchema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://contracts.fullchaos.dev/acr/v1/fixture_consumer.v1.schema.json",
        title: "Fixture Consumer",
        type: "object",
        additionalProperties: false,
        required: ["widget"],
        properties: { widget: { $ref: "fixture_owner.v1.schema.json#/$defs/Widget" } },
    };
    const sourceFiles = [
        fixtureSchemaFile("fixture_owner.v1.schema.json", ownerSchema),
        fixtureSchemaFile("fixture_consumer.v1.schema.json", consumerSchema),
    ];

    it("emits a $ref'd $defs type from its owning file exactly once, with no dangling identifiers", async () => {
        const dts = await generatedDts(sourceFiles);

        expect([...dts.matchAll(/\binterface Widget\b/gu)]).toHaveLength(1);

        const result = typecheck(dts);
        expect(result.stdout + result.stderr).not.toMatch(/error TS/u);
        expect(result.status).toBe(0);
    });

    it("stays byte-identical across independent generations", async () => {
        expect(await generatedDts(sourceFiles)).toBe(await generatedDts(sourceFiles));
    });
});

describe("ACR contract cross-file $defs codegen — cross-owner sharing (Codex round 1, F1)", () => {
    // Two SEPARATE owning files, each with its own top-level cross-file-
    // required def, each internally $ref'ing a bare "#/$defs/Utility" name
    // that ALSO exists — with DIFFERENT content — in the other owner. Per-
    // owner independent compiles (the pre-fix design) would each hoist their
    // own "Utility", producing two incompatible `interface Utility` blocks
    // that fail to merge — a real, plausible collision (generic $defs names
    // like "Metadata"/"Id" easily coincide across independently-authored
    // library files), not a contrived one.
    function ownerWith(tag) {
        return {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: `https://contracts.fullchaos.dev/acr/v1/fixture_owner_${tag}.v1.schema.json`,
            title: `Fixture Owner ${tag}`,
            $defs: {
                [`Wrapper${tag.toUpperCase()}`]: {
                    type: "object",
                    additionalProperties: false,
                    required: ["util"],
                    properties: { util: { $ref: "#/$defs/Utility" } },
                },
                Utility: {
                    type: "object",
                    additionalProperties: false,
                    required: ["tag"],
                    properties: { tag: { const: tag } },
                },
            },
        };
    }
    const consumerSchema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://contracts.fullchaos.dev/acr/v1/fixture_collision_consumer.v1.schema.json",
        title: "Fixture Collision Consumer",
        type: "object",
        additionalProperties: false,
        required: ["a", "b"],
        properties: {
            a: { $ref: "fixture_owner_a.v1.schema.json#/$defs/WrapperA" },
            b: { $ref: "fixture_owner_b.v1.schema.json#/$defs/WrapperB" },
        },
    };
    const sourceFiles = [
        fixtureSchemaFile("fixture_owner_a.v1.schema.json", ownerWith("a")),
        fixtureSchemaFile("fixture_owner_b.v1.schema.json", ownerWith("b")),
        fixtureSchemaFile("fixture_collision_consumer.v1.schema.json", consumerSchema),
    ];

    it("fails closed with a clear error instead of emitting two incompatible declarations", async () => {
        // Ambiguous by construction — two owners disagree on what "Utility"
        // means — so there is no correct silent resolution. A clear
        // generate-time error beats either silently picking one owner's
        // definition (wrong for the other) or letting tsc fail downstream
        // with a confusing duplicate-identifier trace.
        await expect(generatedDts(sourceFiles)).rejects.toThrow(/collision/iu);
    });

    // Codex round 2, R2-1: a JSON.stringify comparison is key-order
    // sensitive — two owners that happen to write an identical $defs entry
    // with their object keys in a different order would falsely collide.
    it("merges (not collides on) two owners' identical $defs entries with differently-ordered keys", async () => {
        const ownerE = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "https://contracts.fullchaos.dev/acr/v1/fixture_owner_e.v1.schema.json",
            title: "Fixture Owner E",
            $defs: {
                WrapperE: {
                    type: "object",
                    additionalProperties: false,
                    required: ["shared"],
                    properties: { shared: { $ref: "#/$defs/SharedIdentical" } },
                },
                SharedIdentical: {
                    type: "object",
                    additionalProperties: false,
                    required: ["tag", "note"],
                    properties: { tag: { const: "same" }, note: { type: "string" } },
                },
            },
        };
        const ownerF = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "https://contracts.fullchaos.dev/acr/v1/fixture_owner_f.v1.schema.json",
            title: "Fixture Owner F",
            $defs: {
                WrapperF: {
                    type: "object",
                    additionalProperties: false,
                    required: ["shared"],
                    properties: { shared: { $ref: "#/$defs/SharedIdentical" } },
                },
                // Same content as ownerE's SharedIdentical, keys reordered.
                SharedIdentical: {
                    additionalProperties: false,
                    type: "object",
                    properties: { note: { type: "string" }, tag: { const: "same" } },
                    required: ["tag", "note"],
                },
            },
        };
        const identicalConsumer = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "https://contracts.fullchaos.dev/acr/v1/fixture_identical_consumer.v1.schema.json",
            title: "Fixture Identical Consumer",
            type: "object",
            additionalProperties: false,
            required: ["e", "f"],
            properties: {
                e: { $ref: "fixture_owner_e.v1.schema.json#/$defs/WrapperE" },
                f: { $ref: "fixture_owner_f.v1.schema.json#/$defs/WrapperF" },
            },
        };
        const identicalSourceFiles = [
            fixtureSchemaFile("fixture_owner_e.v1.schema.json", ownerE),
            fixtureSchemaFile("fixture_owner_f.v1.schema.json", ownerF),
            fixtureSchemaFile("fixture_identical_consumer.v1.schema.json", identicalConsumer),
        ];

        const dts = await generatedDts(identicalSourceFiles);

        expect([...dts.matchAll(/\binterface SharedIdentical\b/gu)]).toHaveLength(1);
        const result = typecheck(dts);
        expect(result.stdout + result.stderr).not.toMatch(/error TS/u);
        expect(result.status).toBe(0);
    });
});

describe("ACR contract cross-file $defs codegen — comment-safe stripping (Codex round 1, F2)", () => {
    // A required cross-file $defs entry that's a bare string-literal type
    // (`const`) gets inlined directly into the synthetic bundle wrapper's
    // OWN body as `Token: "a}b"` — nothing to hoist a separate declaration
    // for. That is the exact region a brace-counting strip scans through,
    // and the "}" inside the literal (a real character in the string, not a
    // code brace) must not be mistaken for the interface's closing brace.
    const ownerSchema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://contracts.fullchaos.dev/acr/v1/fixture_braces_owner.v1.schema.json",
        title: "Fixture Braces Owner",
        $defs: {
            Token: { type: "string", const: "a}b" },
        },
    };
    const consumerSchema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://contracts.fullchaos.dev/acr/v1/fixture_braces_consumer.v1.schema.json",
        title: "Fixture Braces Consumer",
        type: "object",
        additionalProperties: false,
        required: ["token"],
        properties: { token: { $ref: "fixture_braces_owner.v1.schema.json#/$defs/Token" } },
    };
    const sourceFiles = [
        fixtureSchemaFile("fixture_braces_owner.v1.schema.json", ownerSchema),
        fixtureSchemaFile("fixture_braces_consumer.v1.schema.json", consumerSchema),
    ];

    it("strips the synthetic wrapper cleanly even with a stray brace in a comment", async () => {
        const dts = await generatedDts(sourceFiles);
        const result = typecheck(dts);
        expect(result.stdout + result.stderr).not.toMatch(/error TS/u);
        expect(result.status).toBe(0);
        // The brace survived intact — proof the strip didn't eat into or
        // truncate the literal type it sits inside of.
        expect(dts).toMatch(/token:\s*"a\}b"/u);
    });

    // Codex round 2, R2-2: getFullStart() includes leading trivia, which can
    // be a PRECEDING declaration's trailing same-line comment (TS attaches a
    // same-line trailing comment to the NEXT token's leading trivia) —
    // stripping by getFullStart() would delete that comment along with the
    // wrapper. Unit-tested directly against stripInterfaceDeclaration since
    // reproducing this exact token shape through the full schema pipeline
    // depends on json-schema-to-typescript's own comment placement, not on
    // anything this repo's schemas control.
    it("removes only the named interface, leaving a preceding trailing comment intact", () => {
        const source = [
            "export interface Previous {} // retained comment",
            "export interface AcrCrossFileDefsBundle {",
            "    Widget: Widget;",
            "}",
            "export interface Widget {",
            "    name: string;",
            "}",
            "",
        ].join("\n");

        const stripped = stripInterfaceDeclaration(source, "AcrCrossFileDefsBundle");

        expect(stripped).toContain("// retained comment");
        expect(stripped).not.toContain("AcrCrossFileDefsBundle");
        expect(stripped).toContain("export interface Widget {");
    });
});
