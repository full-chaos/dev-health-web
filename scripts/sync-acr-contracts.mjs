#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    artifactPath,
    assertCurrent,
    currentArtifacts,
    expectedArtifacts,
    readPinnedSourceFiles,
    writeArtifacts,
} from "./acr-contract-artifacts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = path.join(ROOT, "src/lib/acr/contracts");
const SOURCE_COMMIT = "5e11b782ed6a4a13ca8d9530f0fdf5312508f883";
const PRETTIER_OPTIONS = Object.freeze({
    parser: "typescript",
    printWidth: 100,
    semi: true,
    singleQuote: false,
    tabWidth: 4,
    trailingComma: "all",
    useTabs: false,
});
// Todo 4 primary copy order. Dependency closure is appended, never merged into this list.
const PRIMARY_SOURCE_PATHS = [
    "contracts/openapi/acr-v1.json",
    "contracts/jsonschema/v1/capabilities.v1.schema.json",
    "contracts/jsonschema/v1/context_packet.v1.schema.json",
    "contracts/jsonschema/v1/context_packet_item.v1.schema.json",
    "contracts/jsonschema/v1/context_packet_request.v1.schema.json",
    "contracts/jsonschema/v1/error.v1.schema.json",
    "contracts/jsonschema/v1/evidence_ref.v1.schema.json",
    "contracts/jsonschema/v1/expanded_evidence.v1.schema.json",
    "contracts/examples/v1/context_packet.v1.json",
    "contracts/examples/v1/expanded_evidence.v1.json",
];
// The copied OpenAPI document references these response schemas. Keep this closure explicit and ordered.
const DEPENDENCY_CLOSURE_PATHS = [
    "contracts/jsonschema/v1/agent_episode.v1.schema.json",
    "contracts/jsonschema/v1/agent_episode_create.v1.schema.json",
];
const SOURCE_PATHS = [...PRIMARY_SOURCE_PATHS, ...DEPENDENCY_CLOSURE_PATHS];

function fail(message) {
    process.stderr.write(`ACR contract sync failed: ${message}\n`);
    process.exitCode = 1;
}

function parseArguments(argumentsList) {
    const [mode, ...rest] = argumentsList;
    if (mode !== "generate" && mode !== "check") throw new Error("use generate or check");
    let source;
    let expectedCommit;
    let allowWrite = false;
    for (let index = 0; index < rest.length; index += 1) {
        const argument = rest[index];
        if (argument === "--allow-write") {
            allowWrite = true;
            continue;
        }
        const value = rest[index + 1];
        if (argument !== "--source" && argument !== "--expected-commit") {
            throw new Error(`unknown argument: ${argument}`);
        }
        if (value === undefined) throw new Error(`${argument} requires a value`);
        if (argument === "--source") source = value;
        if (argument === "--expected-commit") expectedCommit = value;
        index += 1;
    }
    return { allowWrite, mode, source: source ?? process.env.ACR_ROOT, expectedCommit };
}

function sourceFiles(sourceRoot, expectedCommit) {
    return readPinnedSourceFiles({
        sourceRoot,
        expectedCommit,
        sourceCommit: SOURCE_COMMIT,
        sourcePaths: SOURCE_PATHS,
    });
}

async function main() {
    const { allowWrite, mode, source, expectedCommit } = parseArguments(process.argv.slice(2));
    if (mode === "generate") {
        if (source === undefined) throw new Error("generate requires ACR_ROOT or --source");
        if (!allowWrite) throw new Error("generate requires --allow-write");
        const inputs = sourceFiles(path.resolve(source), expectedCommit);
        const rawArtifacts = Object.fromEntries(
            inputs.map((file) => [artifactPath(file.path), file.contents]),
        );
        for (const directory of ["examples", "openapi", "schemas"]) {
            const directoryPath = path.join(ARTIFACT_ROOT, directory);
            if (!fs.existsSync(directoryPath)) continue;
            for (const entry of fs.readdirSync(directoryPath)) {
                const relativePath = `${directory}/${entry}`;
                if (!Object.hasOwn(rawArtifacts, relativePath)) {
                    fs.rmSync(path.join(directoryPath, entry));
                }
            }
        }
        writeArtifacts(ARTIFACT_ROOT, rawArtifacts);
        writeArtifacts(
            ARTIFACT_ROOT,
            await expectedArtifacts({
                artifactRoot: ARTIFACT_ROOT,
                sourceCommit: SOURCE_COMMIT,
                sourceFiles: inputs,
                prettierOptions: PRETTIER_OPTIONS,
            }),
        );
        process.stdout.write("Generated ACR contract artifacts.\n");
        return;
    }
    if (source === undefined && expectedCommit !== undefined && expectedCommit !== SOURCE_COMMIT) {
        throw new Error(`committed source must equal expected commit ${expectedCommit}`);
    }
    const inputs =
        source === undefined
            ? currentArtifacts(ARTIFACT_ROOT, SOURCE_COMMIT)
            : sourceFiles(path.resolve(source), expectedCommit);
    assertCurrent(
        ARTIFACT_ROOT,
        await expectedArtifacts({
            artifactRoot: ARTIFACT_ROOT,
            sourceCommit: SOURCE_COMMIT,
            sourceFiles: inputs,
            prettierOptions: PRETTIER_OPTIONS,
        }),
    );
    process.stdout.write("ACR contracts are current.\n");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unexpected failure"));
