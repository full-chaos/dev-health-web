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
 *   - a hand-rolled recursive-`setTimeout` poll loop, inline or via a named
 *     function that reschedules itself
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

/**
 * Identifiers that reach the Python API (directly or via a server action
 * that wraps a REST/GraphQL call to it). If any of these appear inside an
 * ALLOWLISTED file's `setInterval(...)` callback, the allowlist entry no
 * longer means "no fetch" and must fail — this is what stops someone from
 * quietly adding a Python API read to the SyncProgressBar clock tick or the
 * telemetry flush interval and sliding it past the allowlist on filename
 * alone.
 */
const PYTHON_API_CALL_PATTERN =
    /\b(?:getSyncJobs|getSyncRunStatus|getSyncRunUnits|getBackfillJobStatus|getCustomerPushBatch|getActiveBackfillJob|adminApi|graphqlFetch|graphqlFetchForHydration|router\.refresh|fetch)\s*\(/;

/**
 * Returns the full text of every call matching `callPattern` (e.g.
 * `setInterval(` or `set(?:Timeout|Interval)\(`) in `source`, including its
 * callback and delay arguments — found via paren-depth scanning from each
 * match so a callback containing its own parens (a call expression, an
 * arrow function body) doesn't truncate early.
 */
function extractTimerCalls(source: string, callPattern: RegExp): string[] {
    const calls: string[] = [];
    let match: RegExpExecArray | null;
    callPattern.lastIndex = 0;
    while ((match = callPattern.exec(source))) {
        const openParenIndex = match.index + match[0].length - 1;
        let depth = 0;
        let endIndex = -1;
        for (let i = openParenIndex; i < source.length; i++) {
            if (source[i] === "(") depth++;
            else if (source[i] === ")") {
                depth--;
                if (depth === 0) {
                    endIndex = i;
                    break;
                }
            }
        }
        calls.push(source.slice(match.index, endIndex === -1 ? source.length : endIndex + 1));
    }
    return calls;
}

const extractSetIntervalCalls = (source: string): string[] =>
    extractTimerCalls(source, /\bsetInterval\s*\(/g);

const TIMER_CALL_PATTERN = /\bset(?:Timeout|Interval)\s*\(/g;
const TIMER_CALL_TEST_PATTERN = /\bset(?:Timeout|Interval)\s*\(/;

/**
 * True if `source` contains a `setTimeout(...)`/`setInterval(...)` call
 * whose own argument list — extracted via paren-depth scanning, so a
 * callback's own parens (a call expression, an arrow body) don't fool this —
 * contains ANOTHER `setTimeout(`/`setInterval(` call. That's the INLINE
 * self-scheduling poll shape (`setTimeout(function poll(){ ...;
 * setTimeout(poll, ms) }, ms)`) that would replace a removed `setInterval`
 * without matching the `setInterval` scan at all.
 */
function hasNestedTimerCall(source: string): boolean {
    for (const call of extractTimerCalls(source, TIMER_CALL_PATTERN)) {
        // Skip past this call's own leading `setTimeout(`/`setInterval(` so
        // matching against the remainder can only find a DIFFERENT,
        // nested occurrence, never itself.
        const afterOwnKeyword = call.slice(call.indexOf("(") + 1);
        if (TIMER_CALL_TEST_PATTERN.test(afterOwnKeyword)) return true;
    }
    return false;
}

const NAMED_FUNCTION_PATTERN =
    /\bfunction\s+(\w+)\s*\(|\bconst\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>|\bconst\s+(\w+)\s*=\s*(?:async\s*)?function\b/g;

/** The `{...}` block starting at/after `fromIndex`, via brace-depth scanning. */
function extractBraceBlock(source: string, fromIndex: number): string | null {
    const openBraceIndex = source.indexOf("{", fromIndex);
    if (openBraceIndex === -1) return null;
    let depth = 0;
    for (let i = openBraceIndex; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") {
            depth--;
            if (depth === 0) return source.slice(openBraceIndex, i + 1);
        }
    }
    return source.slice(openBraceIndex);
}

/**
 * True if `source` declares a named function/const that schedules ITSELF
 * via `setTimeout(name, ...)` or `setInterval(name, ...)` inside its own
 * body — the mutual-recursion poll shape
 * (`function poll(){ fetch(...); setTimeout(poll, ms); } setTimeout(poll,
 * ms);`) that `hasNestedTimerCall` above cannot see, since no single timer
 * call is textually nested inside another.
 *
 * Text-scan limitation: only matches a single-identifier self-reference
 * (the function's own declared name reappearing as the first arg to a
 * timer call in its own body) — a renamed alias or an indirect reference
 * through an object/ref would still slip past. Combined with the
 * setInterval allowlist and the inline-nesting check above, this closes
 * the most likely reintroduction shapes without a full AST pass.
 */
function hasNamedSelfSchedulingFunction(source: string): boolean {
    let match: RegExpExecArray | null;
    NAMED_FUNCTION_PATTERN.lastIndex = 0;
    while ((match = NAMED_FUNCTION_PATTERN.exec(source))) {
        const name = match[1] ?? match[2] ?? match[3];
        if (!name) continue;
        const body = extractBraceBlock(source, NAMED_FUNCTION_PATTERN.lastIndex);
        if (!body) continue;
        const selfSchedulePattern = new RegExp(`\\bset(?:Timeout|Interval)\\s*\\(\\s*${name}\\b`);
        if (selfSchedulePattern.test(body)) return true;
    }
    return false;
}

describe("no timer-driven polling against the Python API (CHAOS-4318)", () => {
    const files = listSourceFiles(srcRoot);
    expect(files.length).toBeGreaterThan(0);

    it("finds zero pollInterval/refetchInterval/setInterval-with-fetch/reconnect-loop/recursive-setTimeout violations", () => {
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
            if (hasNestedTimerCall(source)) {
                violations.push({
                    file: relPath,
                    reason: "recursive setTimeout/setInterval — a hand-rolled poll loop",
                });
            }
            if (hasNamedSelfSchedulingFunction(source)) {
                violations.push({
                    file: relPath,
                    reason: "a named function reschedules itself via setTimeout/setInterval — a hand-rolled poll loop",
                });
            }

            const setIntervalCalls = extractSetIntervalCalls(source);
            if (setIntervalCalls.length === 0) continue;

            if (!SETINTERVAL_ALLOWLIST.has(relPath)) {
                violations.push({
                    file: relPath,
                    reason: "setInterval outside SETINTERVAL_ALLOWLIST — must not poll the Python API",
                });
                continue;
            }
            // Allowlisted file: still fails if ANY setInterval call's own
            // text (callback + delay) reaches the Python API — the
            // allowlist is "this timer never fetches", not "this filename
            // is exempt".
            for (const call of setIntervalCalls) {
                if (PYTHON_API_CALL_PATTERN.test(call)) {
                    violations.push({
                        file: relPath,
                        reason: `allowlisted setInterval callback now reaches the Python API: ${call}`,
                    });
                }
            }
        }

        const message = violations.map((v) => `${v.file}: ${v.reason}`).join("\n");
        expect(violations, message).toEqual([]);
    });

    it("keeps the setInterval allowlist pointed at files that still exist, still call setInterval, and whose callbacks still never reach the Python API", () => {
        for (const relPath of SETINTERVAL_ALLOWLIST) {
            const abs = resolve(webRoot, relPath);
            const source = readFileSync(abs, "utf8");
            const calls = extractSetIntervalCalls(source);
            expect(
                calls.length > 0,
                `${relPath} is allowlisted for setInterval but no longer calls it — remove the stale entry`,
            ).toBe(true);
            for (const call of calls) {
                expect(
                    PYTHON_API_CALL_PATTERN.test(call),
                    `${relPath}'s setInterval callback unexpectedly reaches the Python API: ${call}`,
                ).toBe(false);
            }
        }
    });

    it("PYTHON_API_CALL_PATTERN actually catches a Python-API fetch added to an allowlisted timer (mutation check)", () => {
        const poisoned = `setInterval(() => { void getSyncRunStatus(runId); }, 1000);`;
        expect(PYTHON_API_CALL_PATTERN.test(poisoned)).toBe(true);
        const clean = `setInterval(() => setNow(Date.now()), 1000);`;
        expect(PYTHON_API_CALL_PATTERN.test(clean)).toBe(false);
    });

    it("hasNestedTimerCall catches an inline self-scheduling setTimeout poll (mutation check)", () => {
        // Catches the inline-nested shape (the outer call's own argument list
        // contains another timer call). It does NOT catch mutual recursion
        // via a named function reference (`function tick(){ setTimeout(tick,
        // 1000) } setTimeout(tick, 1000)`) — that needs a symbol-aware
        // check, out of scope for a text scan; the setInterval/pollInterval/
        // refetchInterval/EventSource/WebSocket checks above remain the
        // primary guard.
        const recursive = `setTimeout(function poll() { fetch("/x"); setTimeout(poll, 1000); }, 1000);`;
        expect(hasNestedTimerCall(recursive)).toBe(true);
        const oneShot = `const timer = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(timer);`;
        expect(hasNestedTimerCall(oneShot)).toBe(false);
    });

    it("hasNamedSelfSchedulingFunction catches a named mutual-recursion setTimeout poll (mutation check)", () => {
        // The exact shape a nested-call scan alone cannot see: no single
        // timer call is textually nested inside another — `poll` schedules
        // itself by NAME, declared elsewhere in the same function body.
        const recursive = `function poll() { fetch("/x"); setTimeout(poll, 3500); } setTimeout(poll, 3500);`;
        expect(hasNamedSelfSchedulingFunction(recursive)).toBe(true);

        const recursiveArrow = `const poll = () => { fetch("/x"); setTimeout(poll, 3500); }; setTimeout(poll, 3500);`;
        expect(hasNamedSelfSchedulingFunction(recursiveArrow)).toBe(true);

        // A debounced one-shot fetch (PeopleSearch.tsx's real shape) must
        // NOT trip this — the callback is anonymous, it never reschedules
        // itself, and the effect re-running on a new keystroke is not a
        // hand-rolled poll loop.
        const debounce = `useEffect(() => {
            const timer = setTimeout(() => {
                apiClient.getJson(PEOPLE_SEARCH_ENDPOINT, params);
            }, DEBOUNCE_MS);
            return () => clearTimeout(timer);
        }, [query]);`;
        expect(hasNamedSelfSchedulingFunction(debounce)).toBe(false);
    });
});
