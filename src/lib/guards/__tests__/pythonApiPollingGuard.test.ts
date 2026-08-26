import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * CHAOS-4318 — no timer-driven polling against the Python API.
 *
 * The Python API replicas are a scarce resource (per-replica metrics
 * semaphore; see CHAOS-4317/CHAOS-4316). Every browser tab that re-polls
 * sync/job progress on a timer adds request + thread load on exactly those
 * replicas, so live-progress views were moved to fetch-on-mount/navigation
 * plus an explicit Refresh control (SyncRunDetailLive, SyncProgressBar,
 * BackfillStatus, BackfillOperations, CustomerPushBatchDetailLive).
 *
 * This guard statically scans `src/` for the shapes that would reintroduce
 * timer-driven fetching:
 *   - urql `pollInterval:` / SWR or react-query `refetchInterval:`
 *   - `setInterval(...)` outside the small, named, non-fetching allowlist
 *   - `new EventSource(...)` / `new WebSocket(...)` reconnect-loop patterns
 *
 * Reinstate only against the Go API (tracked under Wave 3), never the Python
 * one — and add the file to SETINTERVAL_ALLOWLIST only for a genuinely
 * non-fetching timer (a local display clock, a client-side batch flush),
 * with a comment explaining why it isn't Python API polling.
 */

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../../../..");
const srcRoot = resolve(webRoot, "src");

/**
 * Files allowed to call `setInterval` because the callback never fetches the
 * Python API — a local UI clock tick, or a client-side telemetry batch
 * flush. Empty for anything that touches sync/job/backfill/customer-push
 * progress: those must fetch on mount/navigation + explicit Refresh only.
 */
const SETINTERVAL_ALLOWLIST = new Set<string>([
    // 1s local elapsed-time display tick — no fetch, purely `setNow(Date.now())`.
    "src/components/admin/sync/SyncProgressBar.tsx",
    // Batches outbound client telemetry events to the telemetry adapter, not
    // a Python API progress read.
    "src/lib/telemetry/queue.ts",
]);

const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$/;
const SOURCE_FILE_PATTERN = /\.[jt]sx?$/;

function listSourceFiles(dir: string): string[] {
    const entries = readdirSync(dir, { recursive: true }) as string[];
    const files: string[] = [];
    for (const entry of entries) {
        const abs = join(dir, entry);
        if (!statSync(abs).isFile()) continue;
        if (!SOURCE_FILE_PATTERN.test(abs)) continue;
        if (TEST_FILE_PATTERN.test(abs)) continue;
        files.push(abs);
    }
    return files;
}

interface Violation {
    file: string;
    reason: string;
}

const POLL_OPTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
    {
        pattern: /\bpollInterval\s*:/,
        reason: "urql pollInterval — re-executes a query on a timer",
    },
    {
        pattern: /\brefetchInterval\s*:/,
        reason: "SWR/react-query refetchInterval — re-fetches on a timer",
    },
];

const RECONNECT_LOOP_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
    { pattern: /\bnew\s+EventSource\s*\(/, reason: "EventSource — SSE reconnect loop" },
    { pattern: /\bnew\s+WebSocket\s*\(/, reason: "WebSocket — reconnect loop" },
];

const SET_INTERVAL_PATTERN = /\bsetInterval\s*\(/;

describe("no timer-driven polling against the Python API (CHAOS-4318)", () => {
    const files = listSourceFiles(srcRoot);
    expect(files.length).toBeGreaterThan(0);

    it("finds zero pollInterval/refetchInterval/setInterval-with-fetch/reconnect-loop violations", () => {
        const violations: Violation[] = [];

        for (const abs of files) {
            const relPath = relative(webRoot, abs).split("\\").join("/");
            const source = readFileSync(abs, "utf8");

            for (const { pattern, reason } of POLL_OPTION_PATTERNS) {
                if (pattern.test(source)) violations.push({ file: relPath, reason });
            }
            for (const { pattern, reason } of RECONNECT_LOOP_PATTERNS) {
                if (pattern.test(source)) violations.push({ file: relPath, reason });
            }
            if (SET_INTERVAL_PATTERN.test(source) && !SETINTERVAL_ALLOWLIST.has(relPath)) {
                violations.push({
                    file: relPath,
                    reason: "setInterval outside SETINTERVAL_ALLOWLIST — must not poll the Python API",
                });
            }
        }

        const message = violations.map((v) => `${v.file}: ${v.reason}`).join("\n");
        expect(violations, message).toEqual([]);
    });

    it("keeps the setInterval allowlist pointed at files that still exist and still call setInterval", () => {
        for (const relPath of SETINTERVAL_ALLOWLIST) {
            const abs = resolve(webRoot, relPath);
            const source = readFileSync(abs, "utf8");
            expect(
                SET_INTERVAL_PATTERN.test(source),
                `${relPath} is allowlisted for setInterval but no longer calls it — remove the stale entry`,
            ).toBe(true);
        }
    });
});
