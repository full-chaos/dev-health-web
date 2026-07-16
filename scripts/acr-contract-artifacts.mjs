import path from "node:path";
import { compile } from "json-schema-to-typescript";
import { format } from "prettier";

export {
    acquireArtifactLock,
    assertCurrent,
    currentArtifacts,
    readPinnedSourceFiles,
    removeStaleArtifacts,
    writeArtifacts,
} from "./acr-contract-filesystem.mjs";
import { sha256 } from "./acr-contract-filesystem.mjs";

export function artifactPath(sourcePath) {
    if (sourcePath.startsWith("contracts/openapi/")) return `openapi/${path.basename(sourcePath)}`;
    if (sourcePath.startsWith("contracts/jsonschema/v1/")) {
        return `schemas/${path.basename(sourcePath)}`;
    }
    return `examples/${path.basename(sourcePath)}`;
}

function stableJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
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
