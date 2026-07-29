#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "json-schema-to-typescript";
import { format } from "prettier";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = path.join(ROOT, "src/lib/dev/contracts");
const GENERATED_PATH = path.join(ROOT, "src/lib/dev/generated.ts");
const SOURCE_COMMIT = "f8f541c35f971b19e26ce8c14f9b52d0801cc8df";
const SOURCE_PREFIX = "contracts/ask-dev/v1/";
const PRETTIER_OPTIONS = Object.freeze({
    parser: "typescript",
    printWidth: 100,
    semi: true,
    singleQuote: false,
    tabWidth: 4,
    trailingComma: "all",
    useTabs: false,
});

function fail(message) {
    process.stderr.write(`Ask Dev contract sync failed: ${message}\n`);
    process.exitCode = 1;
}

function command(commandName, args, cwd) {
    const result = spawnSync(commandName, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) throw new Error(`${commandName} command failed`);
    return result.stdout;
}

function sha256(contents) {
    return createHash("sha256").update(contents).digest("hex");
}

function stableJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArguments(argumentsList) {
    const [mode, ...rest] = argumentsList;
    if (mode !== "generate" && mode !== "check") throw new Error("use generate or check");
    let source;
    let allowWrite = false;
    for (let index = 0; index < rest.length; index += 1) {
        const argument = rest[index];
        if (argument === "--allow-write") {
            allowWrite = true;
            continue;
        }
        if (argument !== "--source") throw new Error(`unknown argument: ${argument}`);
        source = rest[index + 1];
        if (source === undefined) throw new Error("--source requires a value");
        index += 1;
    }
    return { allowWrite, mode, source: source ?? process.env.ASK_DEV_OPS_ROOT };
}

function resolveSourceRoot(sourceRoot) {
    const resolved = fs.realpathSync.native(sourceRoot);
    const gitRoot = fs.realpathSync.native(
        command("git", ["rev-parse", "--show-toplevel"], resolved).trim(),
    );
    if (resolved !== gitRoot) throw new Error("source must be a Git worktree root");
    const head = command("git", ["rev-parse", "HEAD"], resolved).trim();
    if (head !== SOURCE_COMMIT) throw new Error(`source HEAD must equal ${SOURCE_COMMIT}`);
    if (command("git", ["status", "--porcelain"], resolved).trim() !== "") {
        throw new Error("source worktree must be clean");
    }
    return resolved;
}

function sourceFiles(sourceRoot) {
    const root = resolveSourceRoot(sourceRoot);
    const listing = command(
        "git",
        ["ls-tree", "-r", "-z", "--name-only", SOURCE_COMMIT, "--", SOURCE_PREFIX],
        root,
    );
    const sourcePaths = listing.split("\0").filter(Boolean).sort();
    if (sourcePaths.length === 0) throw new Error("pinned source has no Ask Dev artifacts");
    const files = sourcePaths.map((sourcePath) => {
        if (!sourcePath.startsWith(SOURCE_PREFIX) || sourcePath.includes("..")) {
            throw new Error(`unsafe source path: ${sourcePath}`);
        }
        const entry = command("git", ["ls-tree", SOURCE_COMMIT, "--", sourcePath], root).trim();
        if (!entry.startsWith("100644 blob "))
            throw new Error(`source is not a regular blob: ${sourcePath}`);
        return {
            contents: command("git", ["show", `${SOURCE_COMMIT}:${sourcePath}`], root),
            path: sourcePath.slice(SOURCE_PREFIX.length),
        };
    });
    if (command("git", ["rev-parse", "HEAD"], root).trim() !== SOURCE_COMMIT) {
        throw new Error("source HEAD changed while reading contracts");
    }
    return files;
}

function typeName(schemaPath) {
    return path
        .basename(schemaPath, ".schema.json")
        .split(/[^A-Za-z0-9]+/u)
        .filter(Boolean)
        .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
        .join("");
}

async function generatedTypes(files) {
    const schemas = files
        .filter((file) => file.path.startsWith("schemas/"))
        .sort((left, right) => left.path.localeCompare(right.path));
    const declarations = [];
    for (const schema of schemas) {
        const schemaDocument = JSON.parse(schema.contents);
        const rootType =
            typeof schemaDocument.title === "string" ? schemaDocument.title : typeName(schema.path);
        const namespace = `${rootType}Contract`;
        const declaration = await compile(schemaDocument, rootType, {
            bannerComment: "",
            cwd: ARTIFACT_ROOT,
            declareExternallyReferenced: true,
            format: false,
            strictIndexSignatures: true,
            unknownAny: false,
        });
        declarations.push(
            `export namespace ${namespace} {\n${declaration}\n}\nexport type ${rootType} = ${namespace}.${rootType};`,
        );
    }
    const banner = `/* eslint-disable @typescript-eslint/no-namespace */\n// Generated from full-chaos/dev-health-ops ${SOURCE_COMMIT}. Do not edit.\n`;
    return format(
        `${banner}${declarations.join("\n").replace(/\bany\b/gu, "unknown")}`,
        PRETTIER_OPTIONS,
    );
}

async function expected(files) {
    return {
        artifacts: Object.fromEntries(files.map((file) => [file.path, file.contents])),
        generated: await generatedTypes(files),
        source: stableJson({
            schema_version: "ask_dev_web_contract_source.v1",
            source_commit: SOURCE_COMMIT,
            files: files.map((file) => ({ path: file.path, sha256: sha256(file.contents) })),
        }),
    };
}

function localFiles() {
    const sourcePath = path.join(ARTIFACT_ROOT, "source.json");
    const provenance = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    if (provenance.source_commit !== SOURCE_COMMIT) throw new Error("source commit drifted");
    if (!Array.isArray(provenance.files) || provenance.files.length === 0) {
        throw new Error("source manifest has no files");
    }
    return provenance.files.map((entry) => {
        if (typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
            throw new Error("invalid source manifest entry");
        }
        const destination = path.resolve(ARTIFACT_ROOT, entry.path);
        if (!destination.startsWith(`${ARTIFACT_ROOT}${path.sep}`))
            throw new Error("unsafe artifact path");
        const contents = fs.readFileSync(destination, "utf8");
        if (sha256(contents) !== entry.sha256)
            throw new Error(`artifact digest drifted: ${entry.path}`);
        return { contents, path: entry.path };
    });
}

function artifactPaths() {
    if (!fs.existsSync(ARTIFACT_ROOT)) return [];
    return fs
        .readdirSync(ARTIFACT_ROOT, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(ARTIFACT_ROOT, path.join(entry.parentPath, entry.name)))
        .filter((entry) => entry !== "source.json")
        .sort();
}

function write(result) {
    fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
    const expectedPaths = new Set(Object.keys(result.artifacts));
    for (const stale of artifactPaths()) {
        if (!expectedPaths.has(stale)) fs.rmSync(path.join(ARTIFACT_ROOT, stale));
    }
    for (const [relativePath, contents] of Object.entries(result.artifacts)) {
        const destination = path.join(ARTIFACT_ROOT, relativePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, contents, "utf8");
    }
    fs.writeFileSync(path.join(ARTIFACT_ROOT, "source.json"), result.source, "utf8");
    fs.mkdirSync(path.dirname(GENERATED_PATH), { recursive: true });
    fs.writeFileSync(GENERATED_PATH, result.generated, "utf8");
}

function assertCurrent(result) {
    const expectedPaths = Object.keys(result.artifacts).sort();
    if (JSON.stringify(artifactPaths()) !== JSON.stringify(expectedPaths)) {
        throw new Error("artifact file set drifted");
    }
    for (const [relativePath, contents] of Object.entries(result.artifacts)) {
        if (fs.readFileSync(path.join(ARTIFACT_ROOT, relativePath), "utf8") !== contents) {
            throw new Error(`artifact contents drifted: ${relativePath}`);
        }
    }
    if (fs.readFileSync(path.join(ARTIFACT_ROOT, "source.json"), "utf8") !== result.source) {
        throw new Error("source manifest drifted");
    }
    if (fs.readFileSync(GENERATED_PATH, "utf8") !== result.generated) {
        throw new Error("generated TypeScript drifted");
    }
}

async function main() {
    const { allowWrite, mode, source } = parseArguments(process.argv.slice(2));
    if (mode === "generate") {
        if (!allowWrite || source === undefined)
            throw new Error("generate requires --source and --allow-write");
        write(await expected(sourceFiles(path.resolve(source))));
        process.stdout.write("Generated Ask Dev schemas, examples, and TypeScript.\n");
        return;
    }
    const files = source === undefined ? localFiles() : sourceFiles(path.resolve(source));
    assertCurrent(await expected(files));
    process.stdout.write("Ask Dev contracts are current.\n");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unexpected failure"));
