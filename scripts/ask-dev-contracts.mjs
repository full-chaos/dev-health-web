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
const SOURCE_COMMIT = "2963df821301c9d052ac83e8c8300ee5966b9eb4";
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

const MODES = Object.freeze(["generate", "check", "check-currency"]);

function parseArguments(argumentsList) {
    const [mode, ...rest] = argumentsList;
    if (!MODES.includes(mode)) throw new Error(`use ${MODES.join(", ")}`);
    let source;
    let pinned;
    let current;
    let allowWrite = false;
    for (let index = 0; index < rest.length; index += 1) {
        const argument = rest[index];
        if (argument === "--allow-write") {
            allowWrite = true;
            continue;
        }
        if (argument === "--source" || argument === "--pinned" || argument === "--current") {
            const value = rest[index + 1];
            if (value === undefined) throw new Error(`${argument} requires a value`);
            if (argument === "--source") source = value;
            else if (argument === "--pinned") pinned = value;
            else current = value;
            index += 1;
            continue;
        }
        throw new Error(`unknown argument: ${argument}`);
    }
    return {
        allowWrite,
        current: current ?? process.env.ASK_DEV_OPS_MAIN_ROOT,
        mode,
        pinned: pinned ?? process.env.ASK_DEV_OPS_ROOT,
        source: source ?? process.env.ASK_DEV_OPS_ROOT,
    };
}

/**
 * Every regular-file blob under `SOURCE_PREFIX` at `ref` in the git
 * repository rooted at `root`, read straight from git's object database
 * (never the worktree's files, which may not even be checked out to `ref`).
 * Shared by the pinned-commit reader (`sourceFiles`, always `SOURCE_COMMIT`)
 * and the currency guard (`check-currency`, an arbitrary ops-main `ref`) so
 * the two cannot read the consumed surface two different ways.
 */
function filesUnderPrefix(root, ref) {
    const listing = command(
        "git",
        ["ls-tree", "-r", "-z", "--name-only", ref, "--", SOURCE_PREFIX],
        root,
    );
    const sourcePaths = listing.split("\0").filter(Boolean).sort();
    return sourcePaths.map((sourcePath) => {
        if (!sourcePath.startsWith(SOURCE_PREFIX) || sourcePath.includes("..")) {
            throw new Error(`unsafe source path: ${sourcePath}`);
        }
        const entry = command("git", ["ls-tree", ref, "--", sourcePath], root).trim();
        if (!entry.startsWith("100644 blob "))
            throw new Error(`source is not a regular blob: ${sourcePath}`);
        return {
            contents: command("git", ["show", `${ref}:${sourcePath}`], root),
            path: sourcePath.slice(SOURCE_PREFIX.length),
        };
    });
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
    const files = filesUnderPrefix(root, SOURCE_COMMIT);
    if (files.length === 0) throw new Error("pinned source has no Ask Dev artifacts");
    if (command("git", ["rev-parse", "HEAD"], root).trim() !== SOURCE_COMMIT) {
        throw new Error("source HEAD changed while reading contracts");
    }
    return files;
}

/**
 * A worktree root, validated as clean -- but, unlike `resolveSourceRoot`,
 * at WHATEVER commit it happens to be checked out to, never a fixed pin.
 * Shared by both sides of the currency guard: the "pinned" root's own
 * exact-`SOURCE_COMMIT` requirement is already enforced by the `check` step
 * that always runs immediately before `check-currency` in `run_quality()`
 * (`ci/run_tests.sh`), so re-asserting it here would only duplicate that
 * check, never strengthen it -- and re-deriving it independently here is
 * what makes the comparison itself testable against two arbitrary synthetic
 * repositories, not only against the one real pinned commit.
 */
function resolveCleanGitRoot(root) {
    const resolved = fs.realpathSync.native(root);
    const gitRoot = fs.realpathSync.native(
        command("git", ["rev-parse", "--show-toplevel"], resolved).trim(),
    );
    if (resolved !== gitRoot) throw new Error("root must be a Git worktree root");
    if (command("git", ["status", "--porcelain"], resolved).trim() !== "") {
        throw new Error("root worktree must be clean");
    }
    return resolved;
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

/**
 * CHAOS-3511. The pre-existing `check` mode is a CONSISTENCY guard: it pins
 * web's generated artifacts to exactly `SOURCE_COMMIT` and fails if either
 * drifted from the other -- but says nothing about whether `SOURCE_COMMIT`
 * itself is still current. This is the CURRENCY guard: it compares the
 * consumed surface (`SOURCE_PREFIX`, `contracts/ask-dev/v1/`) at the pinned
 * commit against the SAME surface at `currentRoot`'s checked-out ops main,
 * by content, never by commit-count or calendar age -- the "guard the thing
 * that actually matters, not the calendar" precedent CHAOS-3488 set for the
 * ops-side acceptance-world fingerprint.
 *
 * `currentRoot` is read independently of `pinnedRoot` (no shared git object
 * database is assumed -- CI checks the two commits out into two separate
 * clones), so this compares file CONTENTS directly rather than running
 * `git diff` across two commits that might not even be in one repository.
 * v2-only churn is invisible by construction: `filesUnderPrefix` never
 * leaves `SOURCE_PREFIX`, and web does not consume dev_answer.v2 today.
 */
function currencyDrift(pinnedRootInput, currentRootInput) {
    const pinned = resolveCleanGitRoot(pinnedRootInput);
    const current = resolveCleanGitRoot(currentRootInput);
    const pinnedSha = command("git", ["rev-parse", "HEAD"], pinned).trim();
    const currentSha = command("git", ["rev-parse", "HEAD"], current).trim();

    const pinnedByPath = new Map(
        filesUnderPrefix(pinned, pinnedSha).map((file) => [file.path, file.contents]),
    );
    const currentByPath = new Map(
        filesUnderPrefix(current, currentSha).map((file) => [file.path, file.contents]),
    );
    if (pinnedByPath.size === 0) throw new Error("pinned source has no Ask Dev artifacts");
    if (currentByPath.size === 0) throw new Error("ops main has no Ask Dev artifacts");

    const added = [];
    const removed = [];
    const changed = [];
    for (const filePath of new Set([...pinnedByPath.keys(), ...currentByPath.keys()])) {
        const before = pinnedByPath.get(filePath);
        const after = currentByPath.get(filePath);
        if (before === undefined) added.push(filePath);
        else if (after === undefined) removed.push(filePath);
        else if (before !== after) changed.push(filePath);
    }
    return {
        added: added.sort(),
        changed: changed.sort(),
        currentSha,
        pinnedSha,
        removed: removed.sort(),
    };
}

function assertCurrentWithMain(pinnedRoot, currentRootInput) {
    const { added, changed, currentSha, pinnedSha, removed } = currencyDrift(
        pinnedRoot,
        currentRootInput,
    );
    const drift = [
        ...added.map((relativePath) => `added: ${relativePath}`),
        ...removed.map((relativePath) => `removed: ${relativePath}`),
        ...changed.map((relativePath) => `changed: ${relativePath}`),
    ];
    if (drift.length === 0) {
        process.stdout.write(
            `Ask Dev contract pin ${pinnedSha} is current with ops main (${currentSha}).\n`,
        );
        return;
    }
    throw new Error(
        [
            `contract pin ${pinnedSha} is stale against ops main ${currentSha} -- ` +
                `${SOURCE_PREFIX} drifted:`,
            ...drift.map((line) => `  ${line}`),
            "regenerate: pnpm ask-dev:contracts:generate --allow-write --source <ops checkout " +
                "at main>, then update SOURCE_COMMIT in scripts/ask-dev-contracts.mjs and the " +
                "pinned ref in .github/workflows/tests.yml",
        ].join("\n"),
    );
}

async function main() {
    const { allowWrite, current, mode, pinned, source } = parseArguments(process.argv.slice(2));
    if (mode === "generate") {
        if (!allowWrite || source === undefined)
            throw new Error("generate requires --source and --allow-write");
        write(await expected(sourceFiles(path.resolve(source))));
        process.stdout.write("Generated Ask Dev schemas, examples, and TypeScript.\n");
        return;
    }
    if (mode === "check-currency") {
        if (pinned === undefined || current === undefined)
            throw new Error("check-currency requires --pinned and --current");
        assertCurrentWithMain(path.resolve(pinned), path.resolve(current));
        return;
    }
    const files = source === undefined ? localFiles() : sourceFiles(path.resolve(source));
    assertCurrent(await expected(files));
    process.stdout.write("Ask Dev contracts are current.\n");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unexpected failure"));
