#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";
import { format } from "prettier";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = path.join(ROOT, "src/lib/acr/contracts");
const DTO_PATH = path.join(ROOT, "src/lib/acr/generated.ts");
const VALIDATOR_PATH = path.join(ROOT, "src/lib/acr/contracts.ts");
const SOURCE_COMMIT = "11c44ef812f9f9ae71a044d64f00ebae1ea1602f";
const PRETTIER_OPTIONS = Object.freeze({
    parser: "typescript",
    printWidth: 100,
    semi: true,
    singleQuote: false,
    tabWidth: 4,
    trailingComma: "all",
    useTabs: false,
});
const SOURCE_DIRECTORIES = ["contracts/examples/v1", "contracts/jsonschema/v1"];

function command(commandName, args, cwd) {
    return execFileSync(commandName, args, { cwd, encoding: "utf8" });
}

function fail(message) {
    process.stderr.write(`ACR contract sync failed: ${message}\n`);
    process.exitCode = 1;
}

function parseArguments(argumentsList) {
    const [mode, ...rest] = argumentsList;
    if (mode !== "generate" && mode !== "check") throw new Error("use generate or check");
    let source;
    for (let index = 0; index < rest.length; index += 1) {
        if (rest[index] !== "--source") throw new Error(`unknown argument: ${rest[index]}`);
        source = rest[index + 1];
        if (source === undefined) throw new Error("--source requires a path");
        index += 1;
    }
    return { mode, source: source ?? process.env.ACR_ROOT };
}

function stableJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

function filesAtPinnedCommit(sourceRoot) {
    const commit = command("git", ["rev-parse", "HEAD"], sourceRoot).trim();
    if (commit !== SOURCE_COMMIT) throw new Error(`source HEAD must equal ${SOURCE_COMMIT}`);
    if (command("git", ["status", "--porcelain"], sourceRoot).trim() !== "") {
        throw new Error("source worktree must be clean");
    }
    const files = command(
        "git",
        ["ls-tree", "-r", "--name-only", SOURCE_COMMIT, ...SOURCE_DIRECTORIES],
        sourceRoot,
    )
        .split("\n")
        .filter(Boolean)
        .filter((file) => file.endsWith(".json"))
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    if (files.length === 0) throw new Error("pinned source contains no contract JSON files");
    return files.map((file) => ({
        path: file,
        contents: command("git", ["show", `${SOURCE_COMMIT}:${file}`], sourceRoot),
    }));
}

function artifactPath(sourcePath) {
    if (sourcePath.startsWith("contracts/jsonschema/v1/")) {
        return `schemas/${path.basename(sourcePath)}`;
    }
    return `examples/${path.basename(sourcePath)}`;
}

function typeName(schemaPath) {
    const words = path
        .basename(schemaPath, ".schema.json")
        .split(/[^A-Za-z0-9]+/u)
        .filter(Boolean)
        .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`);
    return words.join("");
}

function symbolName(fileName) {
    const words = fileName
        .replace(/\.v1(?:\.schema)?\.json$/u, "")
        .split("_")
        .map((word, index) =>
            index === 0 ? word : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`,
        );
    return words.join("");
}

async function dtoModule(schemaFiles) {
    const declarations = [];
    for (const schema of schemaFiles) {
        declarations.push(
            await compile(JSON.parse(schema.contents), typeName(schema.path), {
                bannerComment: "",
                cwd: path.join(ARTIFACT_ROOT, "schemas"),
                declareExternallyReferenced: false,
                format: false,
                strictIndexSignatures: true,
                unknownAny: false,
            }),
        );
    }
    return format(declarations.join("\n").replace(/\bany\b/gu, "unknown"), PRETTIER_OPTIONS);
}

async function validatorModule(schemaFiles, exampleFiles) {
    const schemaImports = schemaFiles
        .map(
            (file) =>
                `import ${symbolName(path.basename(file.path))}Schema from "./contracts/schemas/${path.basename(file.path)}";`,
        )
        .join("\n");
    const exampleImports = exampleFiles
        .map(
            (file) =>
                `import ${symbolName(path.basename(file.path))}Example from "./contracts/examples/${path.basename(file.path)}";`,
        )
        .join("\n");
    const schemaEntries = schemaFiles
        .map(
            (file) =>
                `    ${symbolName(path.basename(file.path))}: ${symbolName(path.basename(file.path))}Schema,`,
        )
        .join("\n");
    const schemaFileEntries = schemaFiles
        .map(
            (file) =>
                `    "${path.basename(file.path)}": ${symbolName(path.basename(file.path))}Schema,`,
        )
        .join("\n");
    const exampleEntries = exampleFiles
        .map((file) => {
            const schema = file.path.replace("contracts/examples/v1/", "").replace("_full", "");
            const schemaFile = schema.replace(/\.json$/u, ".schema.json");
            return `    { schema: "${schemaFile}", value: ${symbolName(path.basename(file.path))}Example },`;
        })
        .join("\n");
    return format(
        `import Ajv2020 from "ajv/dist/2020";\nimport addFormats from "ajv-formats";\n${schemaImports}\n${exampleImports}\n\nexport const acrSchemas = {\n${schemaEntries}\n};\n\nconst acrSchemaFiles = {\n${schemaFileEntries}\n};\n\nexport const acrExamples = [\n${exampleEntries}\n] as const;\n\nconst ajv = new Ajv2020({\n    allErrors: true,\n    strictRequired: false,\n    strictSchema: true,\n    strictTypes: false,\n});\naddFormats(ajv);\nfor (const [schemaName, schema] of Object.entries(acrSchemaFiles)) ajv.addSchema(schema, schemaName);\n\ntype ValidationResult = {\n    readonly valid: boolean;\n    readonly errors: readonly string[];\n};\n\nexport function validateAcrContract(schema: string, value: unknown): ValidationResult {\n    const validator = ajv.getSchema(schema);\n    if (validator === undefined) return { valid: false, errors: [\"schema is unavailable\"] };\n    if (validator(value)) return { valid: true, errors: [] };\n    return {\n        valid: false,\n        errors: (validator.errors ?? []).map((error) => \`\${error.instancePath} \${error.message ?? error.keyword}\`),\n    };\n}\n`,
        PRETTIER_OPTIONS,
    );
}

async function expectedArtifacts(sourceFiles) {
    const schemaFiles = sourceFiles.filter((file) => file.path.startsWith("contracts/jsonschema/"));
    const exampleFiles = sourceFiles.filter((file) => file.path.startsWith("contracts/examples/"));
    const rawArtifacts = Object.fromEntries(
        sourceFiles.map((file) => [artifactPath(file.path), file.contents]),
    );
    const manifest = {
        source_commit: SOURCE_COMMIT,
        files: sourceFiles.map((file) => ({
            path: artifactPath(file.path),
            sha256: sha256(file.contents),
        })),
    };
    return {
        ...rawArtifacts,
        "manifest.json": stableJson(manifest),
        "../contracts.ts": await validatorModule(schemaFiles, exampleFiles),
        "../generated.ts": await dtoModule(schemaFiles),
    };
}

function writeArtifacts(artifacts) {
    for (const [relativePath, contents] of Object.entries(artifacts)) {
        const destination = path.resolve(ARTIFACT_ROOT, relativePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, contents);
    }
}

function currentArtifacts() {
    const manifestPath = path.join(ARTIFACT_ROOT, "manifest.json");
    if (!fs.existsSync(manifestPath)) throw new Error("committed artifacts are missing");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.source_commit !== SOURCE_COMMIT || !Array.isArray(manifest.files)) {
        throw new Error("manifest is invalid");
    }
    return manifest.files.map((file) => {
        if (typeof file.path !== "string" || typeof file.sha256 !== "string")
            throw new Error("manifest entry is invalid");
        const contents = fs.readFileSync(path.join(ARTIFACT_ROOT, file.path), "utf8");
        if (sha256(contents) !== file.sha256) throw new Error(`digest drift: ${file.path}`);
        const prefix = file.path.startsWith("schemas/")
            ? "contracts/jsonschema/v1/"
            : "contracts/examples/v1/";
        return { path: `${prefix}${path.basename(file.path)}`, contents };
    });
}

function assertCurrent(artifacts) {
    for (const [relativePath, expected] of Object.entries(artifacts)) {
        const destination = path.resolve(ARTIFACT_ROOT, relativePath);
        if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== expected) {
            throw new Error(`artifact drift: ${relativePath}`);
        }
    }
}

async function main() {
    const { mode, source } = parseArguments(process.argv.slice(2));
    if (mode === "generate") {
        if (source === undefined) throw new Error("generate requires ACR_ROOT or --source");
        const sourceFiles = filesAtPinnedCommit(path.resolve(source));
        writeArtifacts(
            Object.fromEntries(sourceFiles.map((file) => [artifactPath(file.path), file.contents])),
        );
        writeArtifacts(await expectedArtifacts(sourceFiles));
        process.stdout.write("Generated ACR contract artifacts.\n");
        return;
    }
    const inputs =
        source === undefined ? currentArtifacts() : filesAtPinnedCommit(path.resolve(source));
    assertCurrent(await expectedArtifacts(inputs));
    process.stdout.write("ACR contracts are current.\n");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unexpected failure"));
