#!/usr/bin/env node
// Fails when the vendored ACR contract pin has drifted from acr main (CHAOS-11907).
//
// Pin of record: source_commit in src/lib/acr/contracts/manifest.json.
// Drift = the pin differs from acr main AND the acr `contracts/` tree differs between the two.
// A main that moved without touching contracts is not drift.
//
// Exit codes: 0 current · 1 drift · 2 the measurement did not happen (fetch/parse failure).
// A failed fetch must never read as "current".
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REMOTE = "https://github.com/full-chaos/dev-health-acr.git";
// Only the trees web vendors (openapi, jsonschema, examples). mcp/ and auth/ are not vendored.
const VENDORED_TREES = ["contracts/openapi", "contracts/jsonschema", "contracts/examples"];
const SHA_RE = /^[0-9a-f]{40}$/;

function git(cwd, args) {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function readPin(manifestPath) {
    const sha = JSON.parse(fs.readFileSync(manifestPath, "utf8")).source_commit;
    if (typeof sha !== "string" || !SHA_RE.test(sha)) {
        throw new Error(`manifest source_commit is not a 40-char SHA: ${String(sha)}`);
    }
    return sha;
}

export function checkDrift({ remote, branch = "main", pin }) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "acr-pin-drift-"));
    try {
        git(tmp, ["init", "-q"]);
        git(tmp, ["fetch", "-q", "--depth", "1", remote, branch]);
        const head = git(tmp, ["rev-parse", "FETCH_HEAD"]).trim();
        if (!SHA_RE.test(head)) throw new Error(`acr ${branch} did not resolve to a SHA`);
        if (head === pin) return { status: "current", pin, head };
        git(tmp, ["fetch", "-q", "--depth", "1", remote, pin]);
        const changed = git(tmp, ["diff", "--name-only", pin, head, "--", ...VENDORED_TREES])
            .split("\n")
            .filter(Boolean);
        return changed.length === 0
            ? { status: "current", pin, head }
            : { status: "drift", pin, head, changed };
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

function main() {
    const remote = process.env.ACR_REMOTE ?? DEFAULT_REMOTE;
    const manifest =
        process.env.ACR_MANIFEST ?? path.join(ROOT, "src/lib/acr/contracts/manifest.json");
    try {
        const pin = readPin(manifest);
        const result = checkDrift({ remote, pin });
        if (result.status === "current") {
            process.stdout.write(`ACR pin ${pin} matches acr main ${result.head} for contracts/.\n`);
            return 0;
        }
        process.stderr.write(
            `ACR contract pin DRIFT: pin ${pin} vs acr main ${result.head}.\nChanged under vendored contracts/:\n${result.changed.map((f) => `  ${f}`).join("\n")}\nBump: pnpm acr:contracts:generate with ACR_ROOT at the new SHA, and update SOURCE_COMMIT.\n`,
        );
        return 1;
    } catch (error) {
        process.stderr.write(
            `ACR pin drift check could NOT run (remote=${remote}): ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return 2;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
