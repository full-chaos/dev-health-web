"use client";

import type { ContextFabricSubmissionStatusV1 } from "@/lib/acr/generated";
import { parseResultFeedback } from "@/lib/acr/feedbackContract";
import { parseThread, parseThreadList } from "@/lib/acr/threadContract";
import { logger } from "@/lib/logger";

import type { TranscriptResult } from "../answer/AskDevTurn";
import { asTranscriptResult } from "../answer/testModeAnswer";
import {
    isTransportFailureReason,
    TransportFailure,
    TransportRefusal,
    type AskDevTransport,
    type InvestigateCall,
    type InvestigationEvent,
    type TransportFailureReason,
} from "./transport";

/**
 * Test mode only: a scripted `AskDevTransport`, so the e2e suite can drive the real composer and
 * conversation store with no ACR (CHAOS-11928). A Playwright run puts the script in session storage
 * before the page loads; nothing is fetched.
 *
 * - `TEST_MODE_STREAM_KEY`: an array of plays, one per investigation call, in order (the last one
 *   repeats). A play is `{ events, delayMs?, then? }`, `{ refuse: { status, error,
 *   retryAfterSeconds? } }` (a refusal before the stream) or `{ hold: true }` (a stream that stays
 *   open until it is aborted). After the events, `then` is `"hold"` (stay open until aborted) or a
 *   `TransportFailureReason` (the transport ends the run itself, CHAOS-11929); without it the
 *   stream ends (no terminal is a dropped stream).
 * - `TEST_MODE_STATUS_KEY`: the submission status answers in order (`null` is ACR's 404).
 * - `TEST_MODE_RESULTS_KEY`: the results a replay reads, by `result_id`.
 * - `TEST_MODE_CALLS_KEY`: written here, one entry per call, for the suite to read.
 * - `TEST_MODE_THREADS_KEY` (CHAOS-11956): ACR's thread bodies by `thread_id` (or
 *   `thread_id|before` for an earlier page), as ACR sends them: each is checked with `parseThread`,
 *   as the live transport checks it, so a body that breaks the contract is `invalid_upstream`.
 *   `null` (or no entry) is ACR's 404; `{ refuse: { status, error } }` is another refusal.
 * - `TEST_MODE_THREAD_LIST_KEY`: the list pages in order (the last one repeats), checked with
 *   `parseThreadList`; `{ refuse }` as above.
 * - `TEST_MODE_DELETED_KEY`: written here by a delete, so a deleted thread is gone from later
 *   reads and lists (as on ACR). An id in `TEST_MODE_FOREIGN_KEY` is another principal's: its
 *   delete answers 204 as ACR does, and changes nothing.
 * - A `TEST_MODE_RESULTS_KEY` entry `{ refuse: { status, error } }` refuses the replay.
 * - `TEST_MODE_FEEDBACK_KEY` (CHAOS-11958): ACR's feedback bodies by `result_id`, as ACR sends
 *   them (checked with `parseResultFeedback`). No entry is a never-rated result (`unset`/`unset`);
 *   `null` is ACR's 404; `{ refuse }` refuses the read. A successful set stores its body here, as ACR
 *   does, so a later read (a reload, the other surface) reads it back.
 * - `TEST_MODE_FEEDBACK_SETS_KEY`: the set answers in order (the last one repeats): `"store"` (ACR
 *   stores the body and answers it), `{ refuse }`, or `{ delayMs }` (stores after the wait). Absent,
 *   every set stores.
 * - `TEST_MODE_ATTACH_KEY` (CHAOS-11957): the attaches in order (the last one repeats), each a play
 *   as above. With no entry, an attach is ACR's 410 `cursor_expired` (`not_logged`: an ACR without
 *   the run lease), so the store reads the status instead.
 * - `TEST_MODE_CANCEL_KEY`: Stop's answers in order (the last one repeats): `"running"` (202),
 *   `"final"` (204), `"not_leased"` (409) or `{ refuse: { status, error } }`. With no entry, every
 *   answer is `"not_leased"` (an ACR without the run lease: the disconnect is the cancel).
 *
 * It never ships: a production build inlines `process.env.NODE_ENV`, so `TEST_MODE` is `false` and
 * `testModeTransport` returns `null` (`check:client-bundle` rule K6 fails the build if a key leaks).
 */
export const TEST_MODE_STREAM_KEY = "ask-dev:test-mode-stream";
export const TEST_MODE_STATUS_KEY = "ask-dev:test-mode-status";
export const TEST_MODE_RESULTS_KEY = "ask-dev:test-mode-results";
export const TEST_MODE_CALLS_KEY = "ask-dev:test-mode-calls";
export const TEST_MODE_THREADS_KEY = "ask-dev:test-mode-threads";
export const TEST_MODE_THREAD_LIST_KEY = "ask-dev:test-mode-thread-list";
export const TEST_MODE_DELETED_KEY = "ask-dev:test-mode-deleted";
export const TEST_MODE_FOREIGN_KEY = "ask-dev:test-mode-foreign";
export const TEST_MODE_FEEDBACK_KEY = "ask-dev:test-mode-feedback";
export const TEST_MODE_FEEDBACK_SETS_KEY = "ask-dev:test-mode-feedback-sets";
export const TEST_MODE_ATTACH_KEY = "ask-dev:test-mode-attach";
export const TEST_MODE_CANCEL_KEY = "ask-dev:test-mode-cancel";

const TEST_MODE =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

type Play =
    | {
          readonly events: readonly InvestigationEvent[];
          readonly delayMs?: number;
          readonly then?: "hold" | TransportFailureReason;
      }
    | {
          readonly refuse: {
              readonly status: number;
              readonly error: TransportRefusal["error"];
              readonly retryAfterSeconds?: number;
          };
      }
    | { readonly hold: true };

type Call =
    | {
          readonly kind: "investigate";
          readonly submission_id: string;
          readonly thread_id: string;
          readonly request: unknown;
      }
    | { readonly kind: "status"; readonly submission_id: string }
    | { readonly kind: "read"; readonly result_id: string }
    | { readonly kind: "list"; readonly cursor: string | null }
    | { readonly kind: "thread"; readonly thread_id: string; readonly before: string | null }
    | { readonly kind: "delete"; readonly thread_id: string }
    | {
          readonly kind: "attach";
          readonly submission_id: string;
          readonly last_event_id: number | null;
      }
    | { readonly kind: "cancel"; readonly submission_id: string }
    | { readonly kind: "feedback_read"; readonly result_id: string }
    | {
          readonly kind: "feedback_set";
          readonly result_id: string;
          readonly correct: string;
          readonly useful: string;
      };

function read(key: string): unknown {
    try {
        const raw = window.sessionStorage.getItem(key);
        return raw === null ? undefined : (JSON.parse(raw) as unknown);
    } catch (error) {
        logger.warn({ err: error, key }, "test-mode transport script not read");
        return undefined;
    }
}

function record(call: Call): void {
    try {
        const calls = (read(TEST_MODE_CALLS_KEY) as Call[] | undefined) ?? [];
        window.sessionStorage.setItem(TEST_MODE_CALLS_KEY, JSON.stringify([...calls, call]));
    } catch (error) {
        logger.warn(
            { err: error, key: TEST_MODE_CALLS_KEY },
            "test-mode transport call not stored",
        );
    }
}

const at = <T>(list: readonly T[], index: number): T | undefined =>
    list[Math.min(index, list.length - 1)];

function wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(signal.reason);
            },
            { once: true },
        );
    });
}

function checkedEvent(event: InvestigationEvent): InvestigationEvent {
    if (event.type === "result" && asTranscriptResult(event.result) === null) {
        throw new Error("test-mode result event is not a result");
    }
    return event;
}

function held(signal: AbortSignal): Promise<never> {
    return new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
}

/** A scripted `{ refuse: { status, error } }` answer, as a `TransportRefusal`. */
function refusalOf(value: unknown): TransportRefusal | null {
    if (typeof value !== "object" || value === null || !("refuse" in value)) return null;
    const { status, error } = (
        value as { refuse: { status: number; error: TransportRefusal["error"] } }
    ).refuse;
    return new TransportRefusal(status, error);
}

function deletedIds(): string[] {
    const ids = read(TEST_MODE_DELETED_KEY);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/** ACR's body for a never-rated result. */
const neverRated = (resultId: string) => ({
    schema_version: "context_fabric_result_feedback.v1",
    result_id: resultId,
    correct: "unset",
    useful: "unset",
});

/** ACR's 410 for an attach it cannot serve (`not_logged`: the run has no lease). */
const NOT_LOGGED = new TransportRefusal(410, {
    schema_version: "error.v1",
    request_id: "request_test_mode_attach",
    error: {
        code: "cursor_expired",
        message: "The event log does not hold this run.",
        http_status: 410,
        retryable: false,
        details: { reason: "not_logged" },
    },
} as TransportRefusal["error"]);

/** Plays one scripted stream: its events, then its end (`then`), or a refusal. */
async function* play(scripted: Play | undefined, signal: AbortSignal) {
    if (scripted === undefined || "hold" in scripted) {
        await held(signal);
        return;
    }
    if ("refuse" in scripted) {
        const { status, error, retryAfterSeconds } = scripted.refuse;
        throw new TransportRefusal(status, error, retryAfterSeconds);
    }
    for (const event of scripted.events) {
        await wait(scripted.delayMs ?? 0, signal);
        yield checkedEvent(event);
    }
    if (scripted.then === "hold") await held(signal);
    else if (scripted.then !== undefined) {
        if (!isTransportFailureReason(scripted.then)) {
            throw new Error("test-mode play ends with an unknown transport failure");
        }
        throw new TransportFailure(scripted.then);
    }
}

function scriptedTransport(plays: readonly Play[]): AskDevTransport {
    let investigations = 0;
    let statuses = 0;
    let lists = 0;
    let feedbackSets = 0;
    let attaches = 0;
    let cancels = 0;
    return {
        async *investigate(call: InvestigateCall) {
            record({
                kind: "investigate",
                submission_id: call.submissionId,
                thread_id: call.threadId,
                request: call.request,
            });
            yield* play(at(plays, investigations++), call.signal);
        },
        async *attach({ submissionId, lastEventId, signal }) {
            record({
                kind: "attach",
                submission_id: submissionId,
                last_event_id: lastEventId ?? null,
            });
            const attachPlays = read(TEST_MODE_ATTACH_KEY);
            if (!Array.isArray(attachPlays) || attachPlays.length === 0) throw NOT_LOGGED;
            yield* play(at(attachPlays as Play[], attaches++), signal);
        },
        async cancel({ submissionId }) {
            record({ kind: "cancel", submission_id: submissionId });
            const answers = read(TEST_MODE_CANCEL_KEY);
            const answer: unknown = Array.isArray(answers) ? at(answers, cancels++) : undefined;
            const refusal = refusalOf(answer);
            if (refusal !== null) throw refusal;
            if (answer === "running" || answer === "final") return { kind: answer };
            return { kind: "not_leased" };
        },
        async submissionStatus(submissionId: string) {
            record({ kind: "status", submission_id: submissionId });
            const answers = read(TEST_MODE_STATUS_KEY);
            if (!Array.isArray(answers) || answers.length === 0) return null;
            return (at(answers, statuses++) ?? null) as ContextFabricSubmissionStatusV1 | null;
        },
        async readResult(resultId: string) {
            record({ kind: "read", result_id: resultId });
            const results = read(TEST_MODE_RESULTS_KEY) as Record<string, unknown> | undefined;
            const refusal = refusalOf(results?.[resultId]);
            if (refusal !== null) throw refusal;
            const result = asTranscriptResult(results?.[resultId]);
            if (result === null) throw new Error("test-mode result not found");
            return result as TranscriptResult;
        },
        async listThreads({ cursor }) {
            record({ kind: "list", cursor: cursor ?? null });
            const pages = read(TEST_MODE_THREAD_LIST_KEY);
            const page: unknown = Array.isArray(pages) ? at(pages, lists++) : undefined;
            const refusal = refusalOf(page);
            if (refusal !== null) throw refusal;
            const view = parseThreadList(
                page ?? { schema_version: "context_fabric_thread_list.v1", threads: [] },
            );
            if (view === null) throw new TransportFailure("invalid_upstream");
            const deleted = new Set(deletedIds());
            return { ...view, threads: view.threads.filter((row) => !deleted.has(row.threadId)) };
        },
        async readThread({ threadId, before }) {
            record({ kind: "thread", thread_id: threadId, before: before ?? null });
            if (deletedIds().includes(threadId)) return null;
            const threads = read(TEST_MODE_THREADS_KEY) as Record<string, unknown> | undefined;
            const body = threads?.[before === undefined ? threadId : `${threadId}|${before}`];
            if (body === undefined || body === null) return null;
            const refusal = refusalOf(body);
            if (refusal !== null) throw refusal;
            const view = parseThread(body);
            if (view === null) throw new TransportFailure("invalid_upstream");
            return view;
        },
        async deleteThread({ threadId }) {
            record({ kind: "delete", thread_id: threadId });
            const foreign = read(TEST_MODE_FOREIGN_KEY);
            // ACR answers 204 for another principal's thread too, and changes nothing.
            if (Array.isArray(foreign) && foreign.includes(threadId)) return;
            try {
                window.sessionStorage.setItem(
                    TEST_MODE_DELETED_KEY,
                    JSON.stringify([...deletedIds(), threadId]),
                );
            } catch (error) {
                logger.warn(
                    { err: error, key: TEST_MODE_DELETED_KEY },
                    "test-mode delete not stored",
                );
            }
        },
        async readFeedback({ resultId }) {
            record({ kind: "feedback_read", result_id: resultId });
            const stored = read(TEST_MODE_FEEDBACK_KEY) as Record<string, unknown> | undefined;
            const body =
                stored === undefined || !(resultId in stored)
                    ? neverRated(resultId)
                    : stored[resultId];
            if (body === null) return null;
            const refusal = refusalOf(body);
            if (refusal !== null) throw refusal;
            const view = parseResultFeedback(body);
            if (view === null) throw new TransportFailure("invalid_upstream");
            return view;
        },
        async setFeedback({ resultId, correct, useful, signal }) {
            record({ kind: "feedback_set", result_id: resultId, correct, useful });
            const answers = read(TEST_MODE_FEEDBACK_SETS_KEY);
            const answer: unknown = Array.isArray(answers) ? at(answers, feedbackSets++) : "store";
            const refusal = refusalOf(answer);
            if (refusal !== null) throw refusal;
            if (typeof answer === "object" && answer !== null && "delayMs" in answer) {
                await wait(Number((answer as { delayMs: unknown }).delayMs), signal);
            }
            const body = {
                schema_version: "context_fabric_result_feedback.v1",
                result_id: resultId,
                correct,
                useful,
                updated_at: new Date().toISOString(),
            };
            const view = parseResultFeedback(body);
            if (view === null) throw new TransportFailure("invalid_upstream");
            try {
                const stored = (read(TEST_MODE_FEEDBACK_KEY) as Record<string, unknown>) ?? {};
                window.sessionStorage.setItem(
                    TEST_MODE_FEEDBACK_KEY,
                    JSON.stringify({ ...stored, [resultId]: body }),
                );
            } catch (error) {
                logger.warn(
                    { err: error, key: TEST_MODE_FEEDBACK_KEY },
                    "test-mode feedback not stored",
                );
            }
            return view;
        },
    };
}

/** The scripted transport when a test-mode script is present; `null` otherwise (and in prod). */
export function testModeTransport(): AskDevTransport | null {
    if (!TEST_MODE || typeof window === "undefined") return null;
    const plays = read(TEST_MODE_STREAM_KEY);
    if (!Array.isArray(plays)) return null;
    return scriptedTransport(plays as Play[]);
}
