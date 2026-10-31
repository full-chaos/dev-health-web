"use client";

import type { ContextFabricSubmissionStatusV1 } from "@/lib/acr/generated";
import { logger } from "@/lib/logger";

import type { TranscriptResult } from "../answer/AskDevTurn";
import { asTranscriptResult } from "../answer/testModeAnswer";
import {
    TransportRefusal,
    type AskDevTransport,
    type InvestigateCall,
    type InvestigationEvent,
} from "./transport";

/**
 * Test mode only: a scripted `AskDevTransport`, so the e2e suite can drive the real composer and
 * conversation store with no ACR (CHAOS-11928). A Playwright run puts the script in session storage
 * before the page loads; nothing is fetched.
 *
 * - `TEST_MODE_STREAM_KEY`: an array of plays, one per investigation call, in order (the last one
 *   repeats). A play is `{ events, delayMs? }` (the events, then the end; no terminal is a dropped
 *   stream), `{ refuse: { status, error } }` (a refusal before the stream) or `{ hold: true }` (a
 *   stream that stays open until it is aborted).
 * - `TEST_MODE_STATUS_KEY`: the submission status answers in order (`null` is ACR's 404).
 * - `TEST_MODE_RESULTS_KEY`: the results a replay reads, by `result_id`.
 * - `TEST_MODE_CALLS_KEY`: written here, one entry per call, for the suite to read.
 *
 * It never ships: a production build inlines `process.env.NODE_ENV`, so `TEST_MODE` is `false` and
 * `testModeTransport` returns `null` (`check:client-bundle` rule K6 fails the build if a key leaks).
 */
export const TEST_MODE_STREAM_KEY = "ask-dev:test-mode-stream";
export const TEST_MODE_STATUS_KEY = "ask-dev:test-mode-status";
export const TEST_MODE_RESULTS_KEY = "ask-dev:test-mode-results";
export const TEST_MODE_CALLS_KEY = "ask-dev:test-mode-calls";

const TEST_MODE =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

type Play =
    | { readonly events: readonly InvestigationEvent[]; readonly delayMs?: number }
    | { readonly refuse: { readonly status: number; readonly error: TransportRefusal["error"] } }
    | { readonly hold: true };

type Call =
    | {
          readonly kind: "investigate";
          readonly submission_id: string;
          readonly thread_id: string;
          readonly request: unknown;
      }
    | { readonly kind: "status"; readonly submission_id: string }
    | { readonly kind: "read"; readonly result_id: string };

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

function scriptedTransport(plays: readonly Play[]): AskDevTransport {
    let investigations = 0;
    let statuses = 0;
    return {
        async *investigate(call: InvestigateCall) {
            record({
                kind: "investigate",
                submission_id: call.submissionId,
                thread_id: call.threadId,
                request: call.request,
            });
            const play = at(plays, investigations++);
            if (play === undefined || "hold" in play) {
                await new Promise<never>((_, reject) =>
                    call.signal.addEventListener("abort", () => reject(call.signal.reason), {
                        once: true,
                    }),
                );
                return;
            }
            if ("refuse" in play) throw new TransportRefusal(play.refuse.status, play.refuse.error);
            for (const event of play.events) {
                await wait(play.delayMs ?? 0, call.signal);
                yield checkedEvent(event);
            }
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
            const result = asTranscriptResult(results?.[resultId]);
            if (result === null) throw new Error("test-mode result not found");
            return result as TranscriptResult;
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
