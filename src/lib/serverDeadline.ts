/**
 * One deadline, and one slow-call log, for every server-side fetch (CHAOS-9103).
 *
 * A server fetch that is accepted and never answered has no end: the page's `Promise.all`
 * (or the layout's `await`) never settles and the streamed document stays open. This wrapper
 * is the single place that bounds it.
 *
 * - READ kinds (`read`, `health`, `auth`, `entitlements`) get an abort at the deadline. The
 *   fetch rejects with a `TimeoutError`; every caller already has a failure path for a rejected
 *   fetch (`fetchOrNull`, `checkApiHealth`, the auth transient branch, `withErrorHandling`).
 * - `write` is never aborted: the server may have applied the change, and "failed" would be a
 *   lie. A write is logged when slow, nothing more (write deadlines are a follow-up).
 * - The deadlines are a BACKSTOP above real p99, not a speed target. Tune from the log lines.
 * - Browser code is untouched: off the server this is a plain `fetch`.
 *
 * Two structured lines, no headers, no body, no query string, no variables, no ids:
 *   warn "server fetch deadline exceeded" { op, elapsed_ms, deadline_ms, outcome: "deadline" }
 *   warn "server fetch slow"              { op, elapsed_ms, outcome, deadline_ms? }
 * No retry. A caller abort (browser left, Next cancelled) wins and is not a deadline.
 */
import { logger } from "@/lib/logger";

export type ServerFetchKind = "read" | "health" | "auth" | "entitlements" | "write";

type DeadlineKind = Exclude<ServerFetchKind, "write">;

/** Defaults in ms. Each is overridable with SERVER_FETCH_DEADLINE_<NAME>_MS (read at call time). */
export const SERVER_FETCH_DEADLINES: Readonly<Record<DeadlineKind | "slow", number>> = {
    read: 20_000,
    health: 5_000,
    auth: 10_000,
    entitlements: 10_000,
    /** A call that takes longer than this (ok or failed) is logged as slow. */
    slow: 5_000,
};

const ENV_NAME: Record<DeadlineKind | "slow", string> = {
    read: "SERVER_FETCH_DEADLINE_READ_MS",
    health: "SERVER_FETCH_DEADLINE_HEALTH_MS",
    auth: "SERVER_FETCH_DEADLINE_AUTH_MS",
    entitlements: "SERVER_FETCH_DEADLINE_ENTITLEMENTS_MS",
    slow: "SERVER_FETCH_SLOW_MS",
};

function limitMs(name: DeadlineKind | "slow"): number {
    const raw = process.env[ENV_NAME[name]];
    const parsed = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : SERVER_FETCH_DEADLINES[name];
}

export interface FetchDeadlineOptions {
    kind: ServerFetchKind;
    /** Log label. Default: `<METHOD> <pathname>` (the query string is never logged). */
    op?: string;
}

function defaultOp(input: RequestInfo | URL, init: RequestInit | undefined): string {
    const method = (
        init?.method ??
        (typeof input === "object" && "method" in input ? input.method : undefined) ??
        "GET"
    ).toUpperCase();
    try {
        const raw = typeof input === "string" || input instanceof URL ? input : input.url;
        return `${method} ${new URL(String(raw), "http://x").pathname}`;
    } catch {
        return `${method} unknown`;
    }
}

function statusClass(status: number): string {
    return status >= 200 && status < 300 ? "ok" : `${Math.floor(status / 100)}xx`;
}

export async function fetchWithDeadline(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    options: FetchDeadlineOptions,
): Promise<Response> {
    if (typeof window !== "undefined") return fetch(input, init);

    const { kind } = options;
    const op = options.op ?? defaultOp(input, init);
    const slowMs = limitMs("slow");
    const deadlineMs = kind === "write" ? undefined : limitMs(kind);
    const started = Date.now();

    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let signal = init?.signal ?? undefined;
    if (deadlineMs !== undefined) {
        controller = new AbortController();
        timer = setTimeout(() => {
            timedOut = true;
            controller?.abort(
                new DOMException(
                    `server fetch deadline of ${deadlineMs} ms exceeded`,
                    "TimeoutError",
                ),
            );
        }, deadlineMs);
        signal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    }

    try {
        const response = await fetch(input, signal === init?.signal ? init : { ...init, signal });
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
        if (timedOut && !init?.signal?.aborted) {
            logger.warn(
                { op, elapsed_ms: elapsed, deadline_ms: deadlineMs, outcome: "deadline" },
                "server fetch deadline exceeded",
            );
        } else if (elapsed > slowMs) {
            logger.warn(
                {
                    op,
                    elapsed_ms: elapsed,
                    outcome: error instanceof Error ? error.name : "error",
                },
                "server fetch slow",
            );
        }
        throw error;
    } finally {
        if (timer !== undefined) clearTimeout(timer);
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
