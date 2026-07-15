import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { compile } from "json-schema-to-typescript";
import { format } from "prettier";

function command(commandName, args, cwd) {
    return execFileSync(commandName, args, { cwd, encoding: "utf8" });
}

function resolveSourceRoot(sourceRoot) {
    let resolvedSourceRoot;
    let gitRoot;
    try {
        resolvedSourceRoot = fs.realpathSync.native(sourceRoot);
        gitRoot = fs.realpathSync.native(
            command("git", ["rev-parse", "--show-toplevel"], resolvedSourceRoot).trim(),
        );
    } catch {
        throw new Error("source must be a Git worktree root");
    }
    if (gitRoot !== resolvedSourceRoot) throw new Error("source must be a Git worktree root");
    return resolvedSourceRoot;
}

function resolveFullRevision(sourceRoot, revision, label) {
    if (!/^[a-f0-9]{40}$/iu.test(revision)) throw new Error(`${label} must be a full Git revision`);
    let resolvedRevision;
    try {
        resolvedRevision = command(
            "git",
            ["rev-parse", "--verify", `${revision}^{commit}`],
            sourceRoot,
        ).trim();
    } catch {
        throw new Error(`${label} is unavailable`);
    }
    if (resolvedRevision !== revision) throw new Error(`${label} must resolve exactly`);
    return resolvedRevision;
}

function copiedContents(sourcePath, contents) {
    if (sourcePath !== "contracts/openapi/acr-v1.json") return contents;
    return contents.replaceAll("../jsonschema/v1/", "../schemas/");
}

export function readPinnedSourceFiles({ sourceRoot, expectedCommit, sourceCommit, sourcePaths }) {
    const verifiedSourceRoot = resolveSourceRoot(sourceRoot);
    const pinnedCommit = resolveFullRevision(
        verifiedSourceRoot,
        sourceCommit,
        "pinned source commit",
    );
    const headCommit = resolveFullRevision(
        verifiedSourceRoot,
        command("git", ["rev-parse", "--verify", "HEAD^{commit}"], verifiedSourceRoot).trim(),
        "source HEAD",
    );
    if (headCommit !== pinnedCommit) throw new Error(`source HEAD must equal ${sourceCommit}`);
    if (
        expectedCommit !== undefined &&
        resolveFullRevision(verifiedSourceRoot, expectedCommit, "expected commit") !== pinnedCommit
    ) {
        throw new Error(`expected commit must equal ${sourceCommit}`);
    }
    if (command("git", ["status", "--porcelain"], verifiedSourceRoot).trim() !== "") {
        throw new Error("source worktree must be clean");
    }
    return sourcePaths.map((file) => ({
        path: file,
        contents: copiedContents(
            file,
            command("git", ["show", `${pinnedCommit}:${file}`], verifiedSourceRoot),
        ),
    }));
}

function stableJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

export function artifactPath(sourcePath) {
    if (sourcePath.startsWith("contracts/openapi/")) return `openapi/${path.basename(sourcePath)}`;
    if (sourcePath.startsWith("contracts/jsonschema/v1/")) {
        return `schemas/${path.basename(sourcePath)}`;
    }
    return `examples/${path.basename(sourcePath)}`;
}

function typeName(schemaPath) {
    return path
        .basename(schemaPath, ".schema.json")
        .split(/[^A-Za-z0-9]+/u)
        .filter(Boolean)
        .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
        .join("");
}

function symbolName(fileName) {
    return fileName
        .replace(/\.v1(?:\.schema)?\.json$/u, "")
        .split("_")
        .map((word, index) =>
            index === 0 ? word : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`,
        )
        .join("");
}

async function dtoModule(schemaFiles, artifactRoot, prettierOptions) {
    const declarations = [];
    for (const schema of schemaFiles) {
        declarations.push(
            await compile(JSON.parse(schema.contents), typeName(schema.path), {
                bannerComment: "",
                cwd: path.join(artifactRoot, "schemas"),
                declareExternallyReferenced: false,
                format: false,
                strictIndexSignatures: true,
                unknownAny: false,
            }),
        );
    }
    return format(declarations.join("\n").replace(/\bany\b/gu, "unknown"), prettierOptions);
}

async function validatorModule(schemaFiles, exampleFiles, prettierOptions) {
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
        `import Ajv2020 from "ajv/dist/2020";\nimport addFormats from "ajv-formats";\n${schemaImports}\n${exampleImports}\n\nexport const acrSchemas = {\n${schemaEntries}\n};\n\nconst acrSchemaFiles = {\n${schemaFileEntries}\n};\n\nexport const acrExamples = [\n${exampleEntries}\n] as const;\n\nconst ajv = new Ajv2020({\n    allErrors: true,\n    strictRequired: false,\n    strictSchema: true,\n    strictTypes: false,\n});\naddFormats(ajv);\nfor (const [schemaName, schema] of Object.entries(acrSchemaFiles)) ajv.addSchema(schema, schemaName);\n\ntype ValidationResult = {\n    readonly valid: boolean;\n    readonly errors: readonly string[];\n};\n\nexport function validateAcrContract(schema: string, value: unknown): ValidationResult {\n    const validator = ajv.getSchema(schema);\n    if (validator === undefined) return { valid: false, errors: ["schema is unavailable"] };\n    if (validator(value)) return { valid: true, errors: [] };\n    return {\n        valid: false,\n        errors: (validator.errors ?? []).map((error) => \`\${error.instancePath} \${error.message ?? error.keyword}\`),\n    };\n}\n`,
        prettierOptions,
    );
}

export async function expectedArtifacts({
    artifactRoot,
    sourceCommit,
    sourceFiles,
    prettierOptions,
}) {
    const schemaFiles = sourceFiles
        .filter((file) => file.path.startsWith("contracts/jsonschema/"))
        .sort((left, right) => left.path.localeCompare(right.path));
    const exampleFiles = sourceFiles.filter((file) => file.path.startsWith("contracts/examples/"));
    const rawArtifacts = Object.fromEntries(
        sourceFiles.map((file) => [artifactPath(file.path), file.contents]),
    );
    const manifest = {
        source_commit: sourceCommit,
        files: sourceFiles.map((file) => ({
            path: artifactPath(file.path),
            sha256: sha256(file.contents),
        })),
    };
    return {
        ...rawArtifacts,
        "manifest.json": stableJson(manifest),
        "../contracts.ts": await validatorModule(schemaFiles, exampleFiles, prettierOptions),
        "../generated.ts": await dtoModule(schemaFiles, artifactRoot, prettierOptions),
    };
}

export function writeArtifacts(artifactRoot, artifacts) {
    for (const [relativePath, contents] of Object.entries(artifacts)) {
        const destination = path.resolve(artifactRoot, relativePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, contents);
    }
}

export function currentArtifacts(artifactRoot, sourceCommit) {
    const manifestPath = path.join(artifactRoot, "manifest.json");
    if (!fs.existsSync(manifestPath)) throw new Error("committed artifacts are missing");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.source_commit !== sourceCommit || !Array.isArray(manifest.files)) {
        throw new Error("manifest is invalid");
    }
    return manifest.files.map((file) => {
        if (typeof file.path !== "string" || typeof file.sha256 !== "string") {
            throw new Error("manifest entry is invalid");
        }
        const contents = fs.readFileSync(path.join(artifactRoot, file.path), "utf8");
        if (sha256(contents) !== file.sha256) throw new Error(`digest drift: ${file.path}`);
        const prefix = file.path.startsWith("schemas/")
            ? "contracts/jsonschema/v1/"
            : file.path.startsWith("openapi/")
              ? "contracts/openapi/"
              : "contracts/examples/v1/";
        return { path: `${prefix}${path.basename(file.path)}`, contents };
    });
}

export function assertCurrent(artifactRoot, artifacts) {
    for (const [relativePath, expected] of Object.entries(artifacts)) {
        const destination = path.resolve(artifactRoot, relativePath);
        if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== expected) {
            throw new Error(`artifact drift: ${relativePath}`);
        }
    }
}
