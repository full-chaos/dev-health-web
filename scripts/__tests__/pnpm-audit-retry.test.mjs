import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { classify } from "../../ci/pnpm-audit-retry.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(ROOT, "ci", "pnpm-audit-retry.mjs");

const NETWORK_ERROR = JSON.stringify({ error: { code: "pnpm", message: "fetch failed" } });
const BAD_RESPONSE = JSON.stringify({
    error: {
        code: "ERR_PNPM_AUDIT_BAD_RESPONSE",
        message: "The audit endpoint responded with 503",
    },
});
const OTHER_ERROR = JSON.stringify({
    error: { code: "ERR_PNPM_AUDIT_NO_LOCKFILE", message: "No pnpm-lock.yaml found" },
});
// An advisory whose title contains network words: it must fail at once, never be retried.
const ADVISORY = JSON.stringify({
    advisories: {
        1: {
            id: 1,
            severity: "high",
            title: "Request timeout fetch failed ETIMEDOUT 503 in left-pad",
        },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } },
});
const CLEAN = JSON.stringify({
    advisories: {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
});

const dirs = [];
afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// A stub "pnpm": step N of `outputs` is printed with exit code `codes[N]`; the last step repeats.
function runWith(outputs, codes, attempts = 3) {
    const dir = mkdtempSync(path.join(tmpdir(), "audit-retry-"));
    dirs.push(dir);
    outputs.forEach((out, i) => writeFileSync(path.join(dir, `out${i}`), out));
    const counter = path.join(dir, "count");
    writeFileSync(counter, "0");
    const bin = path.join(dir, "pnpm");
    writeFileSync(
        bin,
        `#!/bin/sh
n=$(cat "${counter}"); echo $((n + 1)) > "${counter}"
last=${outputs.length - 1}
i=$n; [ "$i" -gt "$last" ] && i=$last
cat "${dir}/out$i"
codes="${codes.join(" ")}"
set -- $codes
shift $i 2>/dev/null
exit "\${1:-1}"
`,
    );
    chmodSync(bin, 0o755);
    const result = spawnSync("node", [SCRIPT], {
        encoding: "utf8",
        env: {
            ...process.env,
            PNPM_AUDIT_BIN: bin,
            AUDIT_RETRY_ATTEMPTS: String(attempts),
            AUDIT_RETRY_BACKOFF_MS: "0",
        },
    });
    return {
        status: result.status,
        calls: Number(readFileSync(counter, "utf8")),
        stderr: result.stderr,
        stdout: result.stdout,
    };
}

describe("pnpm audit retry wrapper", () => {
    it("classifies by pnpm's JSON error fields, never by advisory text", () => {
        expect(classify(CLEAN, 0)).toBe("pass");
        expect(classify(NETWORK_ERROR, 1)).toBe("retry");
        expect(classify(BAD_RESPONSE, 1)).toBe("retry");
        expect(classify(OTHER_ERROR, 1)).toBe("fail");
        expect(classify(ADVISORY, 1)).toBe("fail");
        expect(classify("not json: ETIMEDOUT fetch failed", 1)).toBe("fail");
        expect(classify("", 1)).toBe("fail");
    });

    it("a real advisory fails on the first try, even when its title names a network error", () => {
        const r = runWith([ADVISORY], [1]);
        expect(r.status).toBe(1);
        expect(r.calls).toBe(1);
        expect(r.stdout).toContain("left-pad");
    });

    it("a network error on every attempt fails after exactly N attempts", () => {
        const r = runWith([NETWORK_ERROR], [1], 3);
        expect(r.status).not.toBe(0);
        expect(r.calls).toBe(3);
        expect(r.stderr).toContain("registry unreachable after 3 attempts");
    });

    it("a network error then a clean audit passes", () => {
        const r = runWith([NETWORK_ERROR, CLEAN], [1, 0]);
        expect(r.status).toBe(0);
        expect(r.calls).toBe(2);
    });

    it("a network error then an advisory fails on the advisory, without more retries", () => {
        const r = runWith([NETWORK_ERROR, ADVISORY], [1, 1]);
        expect(r.status).toBe(1);
        expect(r.calls).toBe(2);
    });

    it("a non-network pnpm error fails at once", () => {
        const r = runWith([OTHER_ERROR], [1]);
        expect(r.status).toBe(1);
        expect(r.calls).toBe(1);
    });
});
