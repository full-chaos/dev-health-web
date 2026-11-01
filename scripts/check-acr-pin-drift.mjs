#!/usr/bin/env node
// Fails when the vendored ACR contract pin has drifted from acr main (CHAOS-11907).
//
// Pin of record: source_commit in src/lib/acr/contracts/manifest.json.
// Drift = the pin differs from acr main AND at least one VENDORED file (the manifest list) differs
// between the two. A main that moved without touching a vendored file is not drift.
//
// Exit codes: 0 current · 1 drift · 2 the measurement did not happen (tool failure).
// A tool failure is its own named state (`status=error`, its own annotation title): never drift, and
// never "current". A fetch failure retries MAX_ATTEMPTS-1 more times (a transient network error should
// not page anyone); a broken manifest (ManifestError) is exit 2 at once, since a retry cannot fix it.
// Removing the temp dir is cleanup: a failed removal is a warning and never changes the result.
// Env: ACR_REMOTE, ACR_MANIFEST, GITHUB_OUTPUT (status/pin/head are appended when set), and
// ACR_PIN_ENFORCE=false (annotations become ::warning; the exit code is unchanged).
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REMOTE = "https://github.com/full-chaos/dev-health-acr.git";
const SHA_RE = /^[0-9a-f]{40}$/;
export const MAX_ATTEMPTS = 3; // the first try + 2 retries
const BACKOFF_MS = [500, 1500]; // waits before retry 1 and retry 2

// A broken manifest or pin. Retrying cannot fix it, so it is never retried.
export class ManifestError extends Error {}

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function git(cwd, args) {
    return childProcess.execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

export function readPin(manifestPath) {
    const sha = readJson(manifestPath, "manifest")?.source_commit;
    if (typeof sha !== "string" || !SHA_RE.test(sha)) {
        throw new ManifestError(`manifest source_commit is not a 40-char SHA: ${String(sha)}`);
    }
    return sha;
}

// Manifest path -> acr source path (inverse of artifactPath in acr-contract-artifacts.mjs).
export function sourcePathsFromManifest(manifestPath) {
    const { files } = readJson(manifestPath, "manifest") ?? {};
    if (!Array.isArray(files) || files.length === 0)
        throw new ManifestError("manifest lists no files");
    return files.map((entry) => {
        const p = entry?.path;
        if (typeof p !== "string" || p === "")
            throw new ManifestError(`manifest entry has no path: ${JSON.stringify(entry)}`);
        if (p.startsWith("openapi/")) return `contracts/${p}`;
        if (p.startsWith("schemas/")) return `contracts/jsonschema/v1/${p.slice(8)}`;
        if (p.startsWith("examples/")) return `contracts/examples/v1/${p.slice(9)}`;
        throw new ManifestError(`unrecognised manifest path: ${p}`);
    });
}

// One measurement in its own temp dir. Cleanup never replaces its result or its error.
function measureOnce({ remote, branch, pin, paths }) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "acr-pin-drift-"));
    try {
        git(tmp, ["init", "-q"]);
        git(tmp, ["fetch", "-q", "--depth", "1", remote, branch]);
        const head = git(tmp, ["rev-parse", "FETCH_HEAD"]).trim();
        if (!SHA_RE.test(head)) throw new Error(`acr ${branch} did not resolve to a SHA`);
        if (head !== pin) git(tmp, ["fetch", "-q", "--depth", "1", remote, pin]);
        // Compare BLOB ids per path, not `git diff`: a mode-only change is not a content change, and a
        // path that exists at neither commit is a broken manifest, never a silent green.
        // A missing path (ls-tree exits 0 and prints nothing) is NOT a git failure: a failure throws,
        // so it is retried and never reads as "absent" (which would read as drift on one side).
        const blob = (rev, file) => {
            const entry = git(tmp, ["ls-tree", "-z", rev, "--", file]).split("\0")[0];
            if (entry === "") return null;
            // The first tab ends the metadata; a tab inside the path is part of the name.
            const tab = entry.indexOf("\t");
            const meta = entry.slice(0, tab);
            const name = entry.slice(tab + 1);
            const [, type, id] = meta.split(" ");
            // Only a real file counts: a directory/tree entry is never a vendored artifact.
            if (name !== file || type !== "blob" || !SHA_RE.test(id)) return null;
            return id;
        };
        const changed = [];
        for (const file of paths) {
            const atPin = blob(pin, file);
            const atHead = blob(head, file);
            if (atPin === null && atHead === null) {
                throw new ManifestError(`vendored path exists at neither pin nor main: ${file}`);
            }
            if (atPin !== atHead) changed.push(file);
        }
        return changed.length === 0
            ? { status: "current", pin, head }
            : { status: "drift", pin, head, changed };
    } finally {
        // A failed removal of a runner's throwaway dir is harmless: the runner is discarded. Retry a
        // little (ENOTEMPTY is a race with a late writer), then warn; never throw.
        try {
            fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch (error) {
            logErr(
                `warning: could not remove temp dir ${tmp} (result unchanged): ${firstLine(error)}`,
            );
        }
    }
}

// Run `fn` up to MAX_ATTEMPTS times. A ManifestError (a truly broken input) is thrown at once: a
// retry cannot fix it. Any other failure is a tool failure: retried with backoff, and the error
// carries the number of attempts really made. `sleep` is the backoff hook (tests pass a fast one).
function withRetries(fn, sleep = sleepSync) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return fn();
        } catch (error) {
            if (error instanceof ManifestError) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
            lastError.attempts = attempt;
            if (attempt < MAX_ATTEMPTS) {
                logErr(`attempt ${attempt}/${MAX_ATTEMPTS} failed, retrying: ${firstLine(error)}`);
                sleep(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS.at(-1));
            }
        }
    }
    throw lastError;
}

export function checkDrift({ remote, branch = "main", pin, paths, sleep = sleepSync }) {
    if (!Array.isArray(paths) || paths.length === 0)
        throw new ManifestError("no vendored paths to compare");
    return withRetries(() => measureOnce({ remote, branch, pin, paths }), sleep);
}

// What really happened: a broken input is never retried; a retried failure names the attempts made.
function howItFailed(error) {
    if (error instanceof ManifestError) return "(broken manifest or pin; not retried)";
    const attempts = error instanceof Error ? error.attempts : undefined;
    return attempts === undefined ? "(before any attempt)" : `after ${attempts} attempts`;
}

function firstLine(error) {
    return (error instanceof Error ? error.message : String(error)).split("\n")[0];
}

// One log line. Everything the script prints goes through the same escape as an annotation, so a
// value taken from an input (a manifest path, a package.json spec, an error text) that holds a
// newline and `::error` cannot start a workflow command of its own.
function esc(value) {
    return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function logErr(line) {
    process.stderr.write(`${esc(line)}\n`);
}
function logOut(line) {
    process.stdout.write(`${esc(line)}\n`);
}

// GitHub workflow command: one line, with the escapes the runner expects.
function annotate(level, title, message) {
    return `::${level} title=${esc(title)}::${esc(message)}\n`;
}

// Read an input file. Only a truly broken input is a ManifestError (never retried): the file is
// absent (ENOENT) or is not JSON. Any other read error (EIO, ...) is a tool failure and is retried.
function readText(file, what) {
    try {
        return fs.readFileSync(file, "utf8");
    } catch (error) {
        if (error?.code === "ENOENT") throw new ManifestError(`${what} ${file} does not exist`);
        throw error;
    }
}
function readJson(file, what) {
    const text = readText(file, what);
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new ManifestError(`cannot parse ${what} ${file}: ${firstLine(error)}`);
    }
}

// Machine-readable result for the workflow (GITHUB_OUTPUT): status current|drift|error, the pin, acr main.
function writeOutputs(env, fields) {
    if (!env.GITHUB_OUTPUT) return;
    try {
        fs.appendFileSync(
            env.GITHUB_OUTPUT,
            Object.entries(fields)
                .map(([k, v]) => `${k}=${String(v).replace(/[\r\n]+/g, " ")}\n`)
                .join(""),
        );
    } catch (error) {
        logErr(`warning: could not write GITHUB_OUTPUT: ${firstLine(error)}`);
    }
}

export function main(env = process.env, deps = {}) {
    const remote = env.ACR_REMOTE ?? DEFAULT_REMOTE;
    const manifest = env.ACR_MANIFEST ?? path.join(ROOT, "src/lib/acr/contracts/manifest.json");
    const level = env.ACR_PIN_ENFORCE === "false" ? "warning" : "error";
    let pin = "";
    try {
        // Reading the inputs is retried like the measurement: only a broken input is final.
        const paths = withRetries(() => {
            pin = readPin(manifest);
            return sourcePathsFromManifest(manifest);
        }, deps.sleep);
        const result = checkDrift({ remote, pin, paths, ...deps });
        writeOutputs(env, { status: result.status, pin, head: result.head });
        if (result.status === "current") {
            logOut(`ACR pin ${pin} matches acr main ${result.head} for contracts/.`);
            return 0;
        }
        logErr(`ACR contract pin DRIFT: pin ${pin} vs acr main ${result.head}.`);
        logErr("Changed among vendored files:");
        for (const f of result.changed) logErr(`  ${f}`);
        logErr(
            "Bump: pnpm acr:contracts:generate with ACR_ROOT at the new SHA, and update SOURCE_COMMIT.",
        );
        process.stderr.write(
            annotate(
                level,
                "ACR contract pin drift",
                `pin ${pin} differs from acr main ${result.head} in: ${result.changed.join(", ")}. Bump the pin.`,
            ),
        );
        return 1;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeOutputs(env, { status: "error", pin });
        logErr(
            `ACR pin drift check could NOT run (tool failure, not drift) (remote=${remote}): ${message}`,
        );
        process.stderr.write(
            annotate(
                level,
                "ACR pin drift: tool failure, not drift",
                `The check could not measure drift ${howItFailed(error)}: ${firstLine(error)}`,
            ),
        );
        return 2;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.env);
}
