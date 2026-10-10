/**
 * Bounds every server-side wait and names the step that is stuck (CHAOS-9114).
 *
 * A server wait that never settles keeps the page, or the layout, or the proxy open for ever:
 * the streamed document does not end. The cause of the production hang is NOT known, so this
 * module bounds the wait whatever is inside it and writes ONE line that names the step.
 *
 * Deadline by RACE, not by abort. `withDeadline` is `Promise.race([work, timer])`: on the timer it
 * rejects with a `TimeoutError` and writes the line. No `AbortSignal` is added to a `fetch`: a
 * signal opts a GET out of Next request memoization, and a wait inside Next's patched fetch
 * (cache lock) does not see the signal anyway. The caller's own signal passes through untouched.
 * The orphan request ends by itself (Node ends it at 300 s); that is accepted.
 *
 * Two layers:
 *  - INNER `fetchWithDeadline`: the race covers `fetch` AND the full body read (the caller gets a
 *    buffered `Response`, so a shared `.clone()` has no stream behind it). `op` is `METHOD path`.
 *  - OUTER `withDeadline` around every awaited step of a render (`fetchOrNull`, health, the
 *    session read, the auth headers, the proxy auth): inner deadline + 5 s. If the outer fires and
 *    no inner line was written meanwhile, the line says `inner_fired: false`: the stuck wait is
 *    not a fetch.
 *
 * Kinds: `read`, `health`, `auth` (validate, impersonate-status), `entitlements` are bounded.
 * `write` (a mutation, refresh, login) is NEVER bounded: the server may have applied the change.
 * It is logged when slow, nothing more.
 *
 * Deadlines are a BACKSTOP above real p99, not a speed target. Tune them from the lines.
 *
 * Two structured warn lines, no headers, body, query string, variables, tokens or ids:
 *   "server fetch deadline exceeded" { op, elapsed_ms, deadline_ms, outcome:"deadline", layer, inner_fired? }
 *   "server fetch slow"              { op, elapsed_ms, outcome }
 * No retry. Off the server this is a plain `fetch`.
 */
import { logger } from "@/lib/logger";

export type ServerFetchKind = "read" | "health" | "auth" | "entitlements" | "write";

type DeadlineKind = Exclude<ServerFetchKind, "write">;
type Layer = "inner" | "outer";
type TableKey = DeadlineKind | "slow" | "outerMargin";

/** Defaults in ms. Each is overridable with SERVER_FETCH_DEADLINE_<NAME>_MS (clamped 1 s..10 min). */
export const SERVER_FETCH_DEADLINES: Readonly<Record<TableKey, number>> = {
    read: 20_000,
    health: 5_000,
    auth: 10_000,
    entitlements: 10_000,
    /** A call that takes longer than this (ok or failed) is logged as slow. */
    slow: 5_000,
    /** The OUTER layer waits this much longer than the inner deadline of the same kind. */
    outerMargin: 5_000,
};

const ENV_NAME: Record<DeadlineKind | "slow", string> = {
    read: "SERVER_FETCH_DEADLINE_READ_MS",
    health: "SERVER_FETCH_DEADLINE_HEALTH_MS",
    auth: "SERVER_FETCH_DEADLINE_AUTH_MS",
    entitlements: "SERVER_FETCH_DEADLINE_ENTITLEMENTS_MS",
    slow: "SERVER_FETCH_SLOW_MS",
};

const MIN_MS = 1_000;
const MAX_MS = 600_000;

let testOverrides: Partial<Record<TableKey, number>> | null = null;

/** Tests only: shrink the table (bypasses the clamp). Pass `null` to restore. */
export function overrideDeadlinesForTests(
    overrides: Partial<Record<TableKey, number>> | null,
): void {
    testOverrides = overrides;
}

function limitMs(name: TableKey): number {
    const forced = testOverrides?.[name];
    if (forced !== undefined) return forced;
    if (name === "outerMargin") return SERVER_FETCH_DEADLINES.outerMargin;
    const raw = process.env[ENV_NAME[name]];
    const parsed = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= MIN_MS && parsed <= MAX_MS
        ? parsed
        : SERVER_FETCH_DEADLINES[name];
}

export interface DeadlineOptions {
    kind: ServerFetchKind;
    /** The step, for the log line. Never an id. */
    op: string;
    /** Default `outer`. */
    layer?: Layer;
}

// Errors this module made, so a caller can tell a deadline from any other failure.
const deadlineErrors = new WeakSet<object>();
export function isServerDeadlineError(error: unknown): boolean {
    return typeof error === "object" && error !== null && deadlineErrors.has(error);
}

// Inner deadlines written so far in this process. The outer layer compares it before and after
// its wait. It is a process-wide count (no per-request context on purpose: it must work in every
// bundle), so `inner_fired` means "an inner deadline fired while this step waited".
let innerDeadlines = 0;

/**
 * Race `promise` against the deadline of `kind`. A `write` is returned as it is.
 * On the timer: reject with a `TimeoutError` and write the "deadline exceeded" line.
 */
export function withDeadline<T>(promise: Promise<T>, options: DeadlineOptions): Promise<T> {
    if (options.kind === "write" || typeof window !== "undefined") return promise;
    const layer = options.layer ?? "outer";
    const deadlineMs = limitMs(options.kind) + (layer === "outer" ? limitMs("outerMargin") : 0);
    const innerAtStart = innerDeadlines;
    const started = Date.now();

    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new DOMException(
                `server wait "${options.op}" exceeded ${deadlineMs} ms`,
                "TimeoutError",
            );
            deadlineErrors.add(error);
            if (layer === "inner") innerDeadlines += 1;
            logger.warn(
                {
                    op: options.op,
                    elapsed_ms: Date.now() - started,
                    deadline_ms: deadlineMs,
                    outcome: "deadline",
                    layer,
                    ...(layer === "outer" ? { inner_fired: innerDeadlines > innerAtStart } : {}),
                },
                "server fetch deadline exceeded",
            );
            reject(error);
        }, deadlineMs);
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

/** `/api/v1/people/<uuid>/summary` -> `/api/v1/people/:id/summary`: no id in a log line. */
export function sanitizePath(pathname: string): string {
    return pathname
        .split("/")
        .map((segment) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
            /^\d+$/.test(segment) ||
            segment.length >= 20 ||
            segment.includes(":") ||
            segment.includes("%3A") ||
            /^[0-9a-f]{12,}$/i.test(segment)
                ? ":id"
                : segment,
        )
        .join("/");
}

function defaultOp(input: RequestInfo | URL, init: RequestInit | undefined): string {
    const method = (
        init?.method ??
        (typeof input === "object" && "method" in input ? input.method : undefined) ??
        "GET"
    ).toUpperCase();
    try {
        const raw = typeof input === "string" || input instanceof URL ? input : input.url;
        return `${method} ${sanitizePath(new URL(String(raw), "http://x").pathname)}`;
    } catch {
        return `${method} unknown`;
    }
}

function statusClass(status: number): string {
    return status >= 200 && status < 300 ? "ok" : `${Math.floor(status / 100)}xx`;
}

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

async function buffered(raw: Response): Promise<Response> {
    if (!(raw instanceof Response)) return raw;
    const { status, statusText, headers } = raw;
    const body = NULL_BODY_STATUS.has(status) ? null : await raw.arrayBuffer();
    return new Response(body, { status, statusText, headers });
}

export interface FetchDeadlineOptions {
    kind: ServerFetchKind;
    /** Log label. Default: `<METHOD> <pathname>` (no query string, ids replaced by `:id`). */
    op?: string;
}

/** INNER layer: `fetch` plus the full body read, under one race. */
export async function fetchWithDeadline(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    options: FetchDeadlineOptions,
): Promise<Response> {
    if (typeof window !== "undefined") return fetch(input, init);

    const op = options.op ?? defaultOp(input, init);
    const slowMs = limitMs("slow");
    const started = Date.now();

    try {
        let response: Response;
        if (options.kind === "write") {
            response = await fetch(input, init);
        } else {
            const work = fetch(input, init).then(buffered);
            work.catch(() => undefined); // an orphan that fails later is not an unhandled rejection
            response = await withDeadline(work, { kind: options.kind, op, layer: "inner" });
        }
        const elapsed = Date.now() - started;
        if (elapsed > slowMs) {
            logger.warn(
                { op, elapsed_ms: elapsed, outcome: statusClass(response.status) },
                "server fetch slow",
            );
        }
        return response;
    } catch (error) {
        const elapsed = Date.now() - started;
        if (!isServerDeadlineError(error) && elapsed > slowMs) {
            logger.warn(
                { op, elapsed_ms: elapsed, outcome: error instanceof Error ? error.name : "error" },
                "server fetch slow",
            );
        }
        throw error;
    }
}

/**
 * `fetch`-shaped function bound to a kind, so a call site changes only its head:
 * `await deadlineFetch("read")(url, init)`.
 */
export function deadlineFetch(kind: ServerFetchKind, op?: string) {
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        fetchWithDeadline(input, init, { kind, op });
}

/**
 * A server action / read that returns `{ data?, error? }` and never rejects: bound it at the call
 * site of a page (for files that an auth-profile gate anchors by line, where an import cannot be
 * added). On the deadline the result is the plain read-failed result of that page.
 */
export async function boundedRead<R extends { error?: string }>(
    promise: Promise<R>,
    op: string,
): Promise<R> {
    try {
        return await withDeadline(promise, { kind: "read", op });
    } catch (error) {
        if (!isServerDeadlineError(error)) throw error;
        return { error: "Could not be read" } as R;
    }
}
