import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compile } from "json-schema-to-typescript";
import { format } from "prettier";
import ts from "typescript";

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

// Collects every `$ref` string appearing anywhere in a parsed schema, however
// deeply nested (properties, items, allOf, $defs values, ...).
function collectRefs(node, refs) {
    if (Array.isArray(node)) {
        for (const item of node) collectRefs(item, refs);
        return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
        if (key === "$ref" && typeof value === "string") refs.push(value);
        else collectRefs(value, refs);
    }
}

// A same-file ref ("#/$defs/X") is already resolved by compiling that file on
// its own. A whole-file ref ("other.schema.json", no fragment) names a type
// compile() already emits once for that file's own root schema. Only a ref
// that names another file AND points past its root ("other.schema.json#/$defs/X")
// needs help: nothing in the concatenated per-file output declares it.
function parseCrossFileDefRef(ref) {
    const hashIndex = ref.indexOf("#");
    if (hashIndex <= 0) return undefined;
    const file = ref.slice(0, hashIndex);
    const fragment = ref.slice(hashIndex + 1);
    if (!fragment.startsWith("/")) return undefined;
    const segments = fragment.split("/").filter(Boolean);
    if (segments.length === 0) return undefined;
    return { file, fragment: `/${segments.join("/")}`, name: segments[segments.length - 1] };
}

// Finds every cross-file $defs reference among `schemaFiles`, grouped by the
// file that owns the definition, sorted for deterministic output. Each
// (owner, fragment) pair is deduped so a definition referenced from several
// consumer files is still only compiled once.
function crossFileDefRefs(schemaFiles) {
    const owners = new Map(schemaFiles.map((file) => [path.basename(file.path), file]));
    const needed = new Map();
    for (const file of schemaFiles) {
        const refs = [];
        collectRefs(JSON.parse(file.contents), refs);
        for (const ref of refs) {
            const parsed = parseCrossFileDefRef(ref);
            if (parsed === undefined) continue;
            if (!owners.has(parsed.file)) {
                throw new Error(
                    `cross-file $ref "${ref}" in ${file.path} points at ${parsed.file}, which is not among the copied schema files`,
                );
            }
            needed.set(`${parsed.file}${parsed.fragment}`, parsed);
        }
    }
    return [...needed.values()].sort((left, right) =>
        `${left.file}${left.fragment}`.localeCompare(`${right.file}${right.fragment}`),
    );
}

// Removes exactly one top-level `interface <name> { ... }` declaration,
// found by parsing the compiled output as TypeScript (not by counting
// braces, which a `{` inside a generated string literal or comment would
// corrupt) — used to drop the synthetic bundle root after compiling;
// everything it pulled in transitively stays, only the wrapper itself is
// unwanted. Uses getStart(), not getFullStart(): the latter includes
// leading trivia, which can be a PRECEDING declaration's trailing
// same-line comment (TS attaches it to the next token) — that comment
// belongs to output we're keeping, not to the wrapper being removed.
export function stripInterfaceDeclaration(source, name) {
    const sourceFile = ts.createSourceFile("bundle.ts", source, ts.ScriptTarget.Latest, true);
    const target = sourceFile.statements.find(
        (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === name,
    );
    if (target === undefined) {
        throw new Error(`expected a synthetic "${name}" interface in the compiled bundle`);
    }
    return source.slice(0, target.getStart(sourceFile)) + source.slice(target.getEnd());
}

// Order-insensitive structural equality — two $defs objects built from
// independently-authored files that happen to be identical should compare
// equal regardless of which order their keys were written in.
function deepEqual(left, right) {
    if (left === right) return true;
    if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
        return false;
    }
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    if (Array.isArray(left)) {
        return (
            left.length === right.length &&
            left.every((item, index) => deepEqual(item, right[index]))
        );
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
        leftKeys.length === rightKeys.length &&
        leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]))
    );
}

// Inserts `value` at `key`, unless `key` is already present with different
// content — same-file $defs names never collide (they're one map), but two
// DIFFERENT owning files coincidentally sharing a bare $defs key (e.g. both
// defining their own "Metadata") would otherwise silently overwrite one
// with the other, or produce two incompatible `interface Metadata` blocks.
// Fail closed instead: this is a genuine, unrepresentable ambiguity in a
// flat TS module. Genuinely identical content (key order aside) merges
// silently — there's nothing ambiguous about two owners agreeing.
function insertUnique(target, key, value, context) {
    if (key in target && !deepEqual(target[key], value)) {
        throw new Error(`cross-file $defs name collision on "${key}" (${context})`);
    }
    target[key] = value;
}

async function dtoModule(schemaFiles, prettierOptions) {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "acr-contract-types-"));
    try {
        for (const schema of schemaFiles) {
            fs.writeFileSync(path.join(sourceRoot, path.basename(schema.path)), schema.contents, {
                flag: "wx",
            });
        }
        const declarations = [];
        for (const schema of schemaFiles) {
            declarations.push(
                await compile(JSON.parse(schema.contents), typeName(schema.path), {
                    bannerComment: "",
                    cwd: sourceRoot,
                    declareExternallyReferenced: false,
                    format: false,
                    strictIndexSignatures: true,
                    unknownAny: false,
                }),
            );
        }
        const owners = new Map(
            schemaFiles.map((file) => [path.basename(file.path), JSON.parse(file.contents)]),
        );
        const entries = crossFileDefRefs(schemaFiles);
        if (entries.length > 0) {
            // Every owning file's $defs merged into ONE dict, and every needed
            // definition exposed as ONE property, compiled in a SINGLE pass —
            // not one compile per owner. json-schema-to-typescript's own
            // hoisting dedupes a dependency shared across owners within one
            // compile() call; separate per-owner calls can't (a type reachable
            // from two owners would get independently, redundantly declared by
            // each, which either silently duplicates or — if the two owners
            // disagree on that name's shape — breaks the build).
            const mergedDefs = {};
            const neededOwners = [...new Set(entries.map((entry) => entry.file))].sort();
            for (const file of neededOwners) {
                for (const [key, value] of Object.entries(owners.get(file).$defs ?? {})) {
                    insertUnique(mergedDefs, key, value, `$defs in ${file}`);
                }
            }
            // A $ref into the wrapper's own (now-merged) $defs — not the raw
            // resolved definition inlined directly — so compile() reliably
            // hoists a separate named declaration for every target, including
            // bare scalar $defs entries (an inlined scalar has nothing to
            // hoist a name for, and would otherwise leave the consuming
            // file's reference to it dangling).
            const properties = {};
            for (const entry of entries) {
                insertUnique(
                    properties,
                    entry.name,
                    { $ref: `#${entry.fragment}` },
                    `cross-file ref target in ${entry.file}`,
                );
            }
            const bundleName = "AcrCrossFileDefsBundle";
            const wrapper = {
                $schema: owners.get(neededOwners[0]).$schema,
                $defs: mergedDefs,
                type: "object",
                additionalProperties: false,
                required: Object.keys(properties).sort(),
                properties,
            };
            const bundle = await compile(wrapper, bundleName, {
                bannerComment: "",
                cwd: sourceRoot,
                declareExternallyReferenced: true,
                format: false,
                strictIndexSignatures: true,
                unknownAny: false,
            });
            declarations.push(stripInterfaceDeclaration(bundle, bundleName));
        }
        return format(declarations.join("\n").replace(/\bany\b/gu, "unknown"), prettierOptions);
    } finally {
        fs.rmSync(sourceRoot, { force: true, recursive: true });
    }
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

export async function expectedArtifacts({ sourceCommit, sourceFiles, prettierOptions }) {
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
        "../generated.ts": await dtoModule(schemaFiles, prettierOptions),
    };
}
