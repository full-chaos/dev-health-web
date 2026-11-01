#!/usr/bin/env node
// Fails when web's ask-dev render pin is not where it must be (CHAOS-12393, CHAOS-12378 part C0).
// Modelled on check-acr-pin-drift.mjs.
//
// Pin of record: the SHA of the @full-chaos/ask-dev dependency in package.json, a full commit SHA.
// In order, the pin must:
// - not_on_main: be a commit of ask-dev main, so nobody pins a side branch or a local commit;
// - contract_mismatch: name the same ACR source_commit as web's own contract manifest, because
//   ask-dev's panels take objects web validated against that contract;
// - drift: match ask-dev main in every render path. A main that moved without touching one is not
//   drift.
//
// Exit codes: 0 current · 1 not_on_main, contract_mismatch or drift · 2 the measurement did not
// happen (fetch/parse failure). A failed fetch must never read as "current".
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REMOTE = "https://github.com/full-chaos/ask-dev.git";
const SHA_RE = /^[0-9a-f]{40}$/;
const PIN_RE = /^github:full-chaos\/ask-dev#([0-9a-f]{40})$/;
export const PACKAGE_NAME = "@full-chaos/ask-dev";
/** What web takes from ask-dev: a change under these moves the render, or its package. */
export const RENDER_PATHS = [
    "package.json",
    "src/app/ask-dev.css",
    "src/components",
    "src/contracts",
    "src/lib",
    "src/render",
];
const ASK_DEV_MANIFEST = "src/contracts/manifest.json";

function git(cwd, args) {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** The pin in a package.json's text. A branch, a tag or a short SHA is refused. */
export function pinOf(packageJsonText) {
    const spec = JSON.parse(packageJsonText).dependencies?.[PACKAGE_NAME];
    const match = PIN_RE.exec(String(spec));
    if (match === null) {
        throw new Error(`${PACKAGE_NAME} is not pinned to a full commit SHA: ${String(spec)}`);
    }
    return match[1];
}

export function readPin(packageJsonPath) {
    return pinOf(fs.readFileSync(packageJsonPath, "utf8"));
}

export function readSourceCommit(manifestPath) {
    const sha = JSON.parse(fs.readFileSync(manifestPath, "utf8")).source_commit;
    if (typeof sha !== "string" || !SHA_RE.test(sha)) {
        throw new Error(`manifest source_commit is not a 40-char SHA: ${String(sha)}`);
    }
    return sha;
}

export function checkPin({ remote, branch = "main", pin, webContract, paths = RENDER_PATHS }) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ask-dev-pin-"));
    try {
        git(tmp, ["init", "-q"]);
        // All of main's commits, for the ancestry check; blobs arrive only when they are read.
        git(tmp, ["fetch", "-q", "--filter=blob:none", remote, branch]);
        const head = git(tmp, ["rev-parse", "FETCH_HEAD"]).trim();
        if (!SHA_RE.test(head)) throw new Error(`ask-dev ${branch} did not resolve to a SHA`);
        git(tmp, ["update-ref", "refs/heads/checked-main", head]);
        let onMain = false;
        try {
            git(tmp, ["merge-base", "--is-ancestor", pin, head]);
            onMain = true;
        } catch {
            // Not in main's history. It must still exist, or the pin itself is broken.
            git(tmp, ["fetch", "-q", "--depth", "1", remote, pin]);
        }
        if (!onMain) return { status: "not_on_main", pin, head };
        const manifest = JSON.parse(git(tmp, ["show", `${pin}:${ASK_DEV_MANIFEST}`]));
        if (manifest.source_commit !== webContract) {
            return {
                status: "contract_mismatch",
                pin,
                head,
                pinContract: String(manifest.source_commit),
                webContract,
            };
        }
        if (head === pin) return { status: "current", pin, head };
        const changed = git(tmp, ["diff", "--no-renames", "--name-only", pin, head, "--", ...paths])
            .split("\n")
            .filter(Boolean);
        return changed.length === 0
            ? { status: "current", pin, head }
            : { status: "drift", pin, head, changed };
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

// Machine-readable result for the workflow (GITHUB_OUTPUT): the status, the pin, ask-dev main.
function writeOutputs(fields) {
    if (!process.env.GITHUB_OUTPUT) return;
    fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(fields)
            .map(([key, value]) => `${key}=${value}\n`)
            .join(""),
    );
}

const BUMP = `Bump, in its own PR: pnpm add ${PACKAGE_NAME}@github:full-chaos/ask-dev#<ask-dev main sha>`;

function main() {
    const remote = process.env.ASK_DEV_REMOTE ?? DEFAULT_REMOTE;
    try {
        const pin = readPin(process.env.ASK_DEV_PACKAGE_JSON ?? path.join(ROOT, "package.json"));
        const webContract = readSourceCommit(
            process.env.ASK_DEV_WEB_MANIFEST ??
                path.join(ROOT, "src/lib/acr/contracts/manifest.json"),
        );
        const result = checkPin({ remote, pin, webContract });
        writeOutputs({ status: result.status, pin, head: result.head });
        if (result.status === "current") {
            process.stdout.write(`ask-dev pin ${pin} matches ask-dev main ${result.head}.\n`);
            return 0;
        }
        if (result.status === "not_on_main") {
            process.stderr.write(
                `ask-dev pin ${pin} is NOT a commit of ask-dev main ${result.head}.\n${BUMP}\n`,
            );
            return 1;
        }
        if (result.status === "contract_mismatch") {
            process.stderr.write(
                `ask-dev pin ${pin} carries ACR contract ${result.pinContract}; web carries ${result.webContract}.\nMove the ACR pins first, then the render pin.\n`,
            );
            return 1;
        }
        process.stderr.write(
            `ask-dev pin DRIFT: pin ${pin} vs ask-dev main ${result.head}.\nChanged render files:\n${result.changed.map((f) => `  ${f}`).join("\n")}\n${BUMP}\n`,
        );
        return 1;
    } catch (error) {
        writeOutputs({ status: "error" });
        process.stderr.write(
            `ask-dev pin check could NOT run (remote=${remote}): ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return 2;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
