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
// happen (tool failure). A tool failure is its own named state (`status=error`, its own annotation
// title): never a wrong pin, and never "current". A fetch failure retries MAX_ATTEMPTS-1 more times
// (a transient network error should not page anyone); a broken pin, manifest or package.json
// (ManifestError) is exit 2 at once, since a retry cannot fix it.
// Removing the temp dir is cleanup: a failed removal is a warning and never changes the result.
// Env: ASK_DEV_REMOTE, ASK_DEV_PACKAGE_JSON, ASK_DEV_WEB_MANIFEST, GITHUB_OUTPUT (status/pin/head are
// appended when set), and ASK_DEV_PIN_ENFORCE=false (annotations become ::warning; the exit code is
// unchanged).
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REMOTE = "https://github.com/full-chaos/ask-dev.git";
const SHA_RE = /^[0-9a-f]{40}$/;
export const MAX_ATTEMPTS = 3; // the first try + 2 retries
const BACKOFF_MS = [500, 1500]; // waits before retry 1 and retry 2
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

// A broken pin, manifest or package.json. Retrying cannot fix it, so it is never retried.
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

/** The pin in a package.json's text. A branch, a tag or a short SHA is refused. */
export function pinOf(packageJsonText) {
    let parsed;
    try {
        parsed = JSON.parse(packageJsonText);
    } catch (error) {
        throw new ManifestError(`package.json is not valid JSON: ${firstLine(error)}`);
    }
    const spec = parsed?.dependencies?.[PACKAGE_NAME];
    const match = PIN_RE.exec(String(spec));
    if (match === null) {
        throw new ManifestError(
            `${PACKAGE_NAME} is not pinned to a full commit SHA: ${String(spec)}`,
        );
    }
    return match[1];
}

export function readPin(packageJsonPath) {
    return pinOf(readText(packageJsonPath, "package.json"));
}

export function readSourceCommit(manifestPath) {
    const sha = readJson(manifestPath, "manifest")?.source_commit;
    if (typeof sha !== "string" || !SHA_RE.test(sha)) {
        throw new ManifestError(`manifest source_commit is not a 40-char SHA: ${String(sha)}`);
    }
    return sha;
}

// One measurement in its own temp dir. Cleanup never replaces its result or its error.
function measureOnce({ remote, branch, pin, webContract, paths }) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ask-dev-pin-"));
    try {
        git(tmp, ["init", "-q"]);
        // All of main's commits, for the ancestry check; blobs arrive only when they are read.
        git(tmp, ["fetch", "-q", "--filter=blob:none", remote, branch]);
        const head = git(tmp, ["rev-parse", "FETCH_HEAD"]).trim();
        if (!SHA_RE.test(head)) throw new Error(`ask-dev ${branch} did not resolve to a SHA`);
        git(tmp, ["update-ref", "refs/heads/checked-main", head]);
        // `merge-base --is-ancestor` exits 1 for "not an ancestor". Any other failure (an unknown
        // object is 128) is a git failure, never a verdict: it is fetched for and tried again, then
        // thrown so the measurement is retried.
        const isAncestor = () => {
            try {
                git(tmp, ["merge-base", "--is-ancestor", pin, head]);
                return true;
            } catch (error) {
                if (error?.status === 1) return false;
                throw error;
            }
        };
        let onMain;
        try {
            onMain = isAncestor();
        } catch {
            git(tmp, ["fetch", "-q", "--depth", "1", remote, pin]);
            onMain = isAncestor();
        }
        if (!onMain) {
            // Not in main's history. It must still exist, or the pin itself is broken.
            git(tmp, ["fetch", "-q", "--depth", "1", remote, pin]);
            return { status: "not_on_main", pin, head };
        }
        const pinned = git(tmp, ["show", `${pin}:${ASK_DEV_MANIFEST}`]);
        let manifest;
        try {
            manifest = JSON.parse(pinned);
        } catch {
            throw new ManifestError(`ask-dev ${ASK_DEV_MANIFEST} at ${pin} is not valid JSON`);
        }
        // A manifest with no valid source_commit is a broken input, not a wrong pin: exit 2, no retry.
        const pinContract = manifest?.source_commit;
        if (typeof pinContract !== "string" || !SHA_RE.test(pinContract)) {
            throw new ManifestError(
                `ask-dev ${ASK_DEV_MANIFEST} at ${pin} has no 40-char source_commit: ${pinContract === undefined ? "missing" : JSON.stringify(pinContract)}`,
            );
        }
        if (pinContract !== webContract) {
            return { status: "contract_mismatch", pin, head, pinContract, webContract };
        }
        if (head === pin) return { status: "current", pin, head };
        // NUL-separated, so a path with unusual characters is listed raw and never quoted.
        const changed = git(tmp, [
            "diff",
            "--no-renames",
            "--name-only",
            "-z",
            pin,
            head,
            "--",
            ...paths,
        ])
            .split("\0")
            .filter(Boolean);
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

// `sleep` is the backoff hook (tests pass a fast one).
export function checkPin({
    remote,
    branch = "main",
    pin,
    webContract,
    paths = RENDER_PATHS,
    sleep = sleepSync,
}) {
    return withRetries(() => measureOnce({ remote, branch, pin, webContract, paths }), sleep);
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

// What really happened: a broken input is never retried; a retried failure names the attempts made.
function howItFailed(error) {
    if (error instanceof ManifestError) return "(broken pin or manifest; not retried)";
    const attempts = error instanceof Error ? error.attempts : undefined;
    return attempts === undefined ? "(before any attempt)" : `after ${attempts} attempts`;
}

function firstLine(error) {
    return (error instanceof Error ? error.message : String(error)).split("\n")[0];
}

// One log line. Everything the script prints goes through the same escape as an annotation, so a
// value taken from an input (a package.json spec, a manifest value, an error text) that holds a
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

// Machine-readable result for the workflow (GITHUB_OUTPUT): the status, the pin, ask-dev main.
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

const BUMP = `Bump, in its own PR: pnpm add ${PACKAGE_NAME}@github:full-chaos/ask-dev#<ask-dev main sha>`;

export function main(env = process.env, deps = {}) {
    const remote = env.ASK_DEV_REMOTE ?? DEFAULT_REMOTE;
    const level = env.ASK_DEV_PIN_ENFORCE === "false" ? "warning" : "error";
    let pin = "";
    try {
        // Reading the inputs is retried like the measurement: only a broken input is final.
        const webContract = withRetries(() => {
            pin = readPin(env.ASK_DEV_PACKAGE_JSON ?? path.join(ROOT, "package.json"));
            return readSourceCommit(
                env.ASK_DEV_WEB_MANIFEST ?? path.join(ROOT, "src/lib/acr/contracts/manifest.json"),
            );
        }, deps.sleep);
        const result = checkPin({ remote, pin, webContract, ...deps });
        writeOutputs(env, { status: result.status, pin, head: result.head });
        if (result.status === "current") {
            logOut(`ask-dev pin ${pin} matches ask-dev main ${result.head}.`);
            return 0;
        }
        if (result.status === "not_on_main") {
            logErr(`ask-dev pin ${pin} is NOT a commit of ask-dev main ${result.head}.`);
            logErr(BUMP);
            process.stderr.write(
                annotate(
                    level,
                    "ask-dev pin not on ask-dev main",
                    `pin ${pin} is not a commit of ask-dev main ${result.head}. Pin a commit of main.`,
                ),
            );
            return 1;
        }
        if (result.status === "contract_mismatch") {
            logErr(
                `ask-dev pin ${pin} carries ACR contract ${result.pinContract}; web carries ${result.webContract}.`,
            );
            logErr("Move the ACR pins first, then the render pin.");
            process.stderr.write(
                annotate(
                    level,
                    "ask-dev pin carries another ACR contract",
                    `pin ${pin} carries ACR contract ${result.pinContract}; web carries ${result.webContract}. Move the ACR pins first, then the render pin.`,
                ),
            );
            return 1;
        }
        logErr(`ask-dev pin DRIFT: pin ${pin} vs ask-dev main ${result.head}.`);
        logErr("Changed render files:");
        for (const f of result.changed) logErr(`  ${f}`);
        logErr(BUMP);
        process.stderr.write(
            annotate(
                level,
                "ask-dev pin drift",
                `pin ${pin} differs from ask-dev main ${result.head} in: ${result.changed.join(", ")}. Bump the pin.`,
            ),
        );
        return 1;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeOutputs(env, { status: "error", pin });
        logErr(
            `ask-dev pin check could NOT run (tool failure, not drift) (remote=${remote}): ${message}`,
        );
        process.stderr.write(
            annotate(
                level,
                "ask-dev pin drift: tool failure, not drift",
                `The check could not measure the pin ${howItFailed(error)}: ${firstLine(error)}`,
            ),
        );
        return 2;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.env);
}
