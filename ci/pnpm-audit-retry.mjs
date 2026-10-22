#!/usr/bin/env node
// Blocking `pnpm audit` with a bounded retry on registry/network errors only.
// A retry happens only when pnpm's own --json output is an error object ({"error":{code,message}})
// with no audit result, and that error's code/message names a network failure. Advisory data,
// unparseable output and every other error fail at once with pnpm's exit code.
import { spawnSync } from "node:child_process";
import { writeSync } from "node:fs";

const NETWORK_CODES =
    /^(ERR_PNPM_AUDIT_BAD_RESPONSE|ERR_PNPM_FETCH_\d+|ERR_PNPM_META_FETCH_FAIL|ERR_PNPM_NO_OFFLINE_META)$/u;
const NETWORK_MESSAGE =
    /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up|network|timed out|request timeout|bad response|\b5\d\d\b/iu;

export function classify(stdout, status) {
    if (status === 0) return "pass";
    let parsed;
    try {
        parsed = JSON.parse(stdout);
    } catch {
        return "fail";
    }
    if (parsed === null || typeof parsed !== "object") return "fail";
    if ("advisories" in parsed || "metadata" in parsed) return "fail";
    const error = parsed.error;
    if (error === null || typeof error !== "object") return "fail";
    if (NETWORK_CODES.test(String(error.code ?? ""))) return "retry";
    return NETWORK_MESSAGE.test(String(error.message ?? "")) ? "retry" : "fail";
}

export function run({ bin, args, attempts, backoffMs, log }) {
    let last = 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const result = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
        const stdout = result.stdout ?? "";
        last = result.status ?? 1;
        const verdict = classify(stdout, result.status);
        if (verdict === "pass" || verdict === "fail") {
            // Human-readable report of the same audit (no second network call needed on a failure).
            writeSync(1, stdout);
            writeSync(2, result.stderr ?? "");
            return last;
        }
        log(
            `audit network error on attempt ${attempt}/${attempts}: ${stdout.trim().slice(0, 300)}`,
        );
        if (attempt < attempts && backoffMs > 0) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, backoffMs * attempt);
        }
    }
    log(`audit failed: registry unreachable after ${attempts} attempts`);
    return last === 0 ? 1 : last;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const attempts = Number(process.env.AUDIT_RETRY_ATTEMPTS ?? 3);
    const backoffMs = Number(process.env.AUDIT_RETRY_BACKOFF_MS ?? 5000);
    const bin = process.env.PNPM_AUDIT_BIN ?? "pnpm";
    process.exitCode = run({
        bin,
        args: ["audit", "--audit-level=high", "--prod", "--json"],
        attempts,
        backoffMs,
        log: (line) => writeSync(2, `==> ${line}\n`),
    });
}
