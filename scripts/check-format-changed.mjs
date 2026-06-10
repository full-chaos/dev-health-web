#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const prettierManagedPath =
    /(?:^\.prettier(?:rc|ignore)?$|\.(?:ts|tsx|js|mjs|cjs|jsx|json|md|css|ya?ml)$)/;

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        encoding: "utf8",
        stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
        ...options,
    });

    if (result.status !== 0) {
        const stderr = result.stderr?.trim();
        const stdout = result.stdout?.trim();
        throw new Error(stderr || stdout || `${command} ${args.join(" ")} failed`);
    }

    return result.stdout.trim();
}

function git(args) {
    return run("git", args);
}

function detectBaseRef() {
    if (process.env.GITHUB_BASE_REF) {
        const remoteRef = `origin/${process.env.GITHUB_BASE_REF}`;
        spawnSync(
            "git",
            ["fetch", "--no-tags", "--depth=100", "origin", process.env.GITHUB_BASE_REF],
            {
                stdio: "inherit",
            },
        );
        return git(["merge-base", "HEAD", remoteRef]);
    }

    if (process.env.GITHUB_EVENT_BEFORE && !/^0+$/.test(process.env.GITHUB_EVENT_BEFORE)) {
        return process.env.GITHUB_EVENT_BEFORE;
    }

    const upstream = spawnSync(
        "git",
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    if (upstream.status === 0 && upstream.stdout.trim()) {
        return git(["merge-base", "HEAD", upstream.stdout.trim()]);
    }

    return git(["rev-parse", "HEAD~1"]);
}

const baseRef = detectBaseRef();
const diffRange = process.env.CI ? `${baseRef}...HEAD` : baseRef;
const trackedChanges = git(["diff", "--name-only", "--diff-filter=ACMRT", diffRange]);
const untrackedChanges = process.env.CI ? "" : git(["ls-files", "--others", "--exclude-standard"]);
const changedFiles = `${trackedChanges}\n${untrackedChanges}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file, index, files) => files.indexOf(file) === index)
    .filter((file) => prettierManagedPath.test(file));

if (changedFiles.length === 0) {
    console.log("No changed Prettier-managed files to check.");
    process.exit(0);
}

console.log(`Checking ${changedFiles.length} changed Prettier-managed file(s).`);
const prettier = spawnSync("pnpm", ["exec", "prettier", "--check", ...changedFiles], {
    stdio: "inherit",
});

process.exit(prettier.status ?? 1);
