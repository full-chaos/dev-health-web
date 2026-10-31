import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ACRErrorV1, ContextFabricSubmissionStatusV1 } from "@/lib/acr/generated";

import type { TranscriptResult } from "../../answer/AskDevTurn";
import type {
    AskDevTransport,
    FeedbackFlag,
    FeedbackView,
    InvestigateCall,
    InvestigationEvent,
    ThreadListView,
    ThreadSummaryView,
    ThreadTurnView,
    ThreadView,
} from "../transport";

const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");

/** A real (scrubbed) ACR result from the capture set. */
export function captureResult(file: string): TranscriptResult {
    return (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: TranscriptResult })
        .result;
}

export function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve = () => undefined as void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

/** One step of a scripted stream: an event, a wait, or a throw. */
export type Step =
    InvestigationEvent | { readonly wait: Promise<void> } | { readonly fail: unknown };

let seq = 0;
const base = () => ({ seq: ++seq, request_id: "request_test" });

export const accepted = (reserved = "result_reserved_0001"): InvestigationEvent => ({
    ...base(),
    type: "accepted",
    reserved_result_id: reserved,
    started_at: "2026-10-30T00:00:00Z",
    budget_seconds: 110,
});
export const resultEvent = (result: TranscriptResult): InvestigationEvent => ({
    ...base(),
    type: "result",
    result,
});
export const errorEvent = (
    code: string,
    reserved = "result_reserved_0001",
): InvestigationEvent => ({
    ...base(),
    type: "error",
    reserved_result_id: reserved,
    error: acrError(code, 422, false),
});

export function acrError(code: string, status: number, retryable: boolean): ACRErrorV1 {
    return {
        schema_version: "error.v1",
        request_id: "req_test",
        error: { code, message: "test", http_status: status, retryable },
    } as ACRErrorV1;
}

export function status(
    state: ContextFabricSubmissionStatusV1["state"],
    resultId?: string,
): ContextFabricSubmissionStatusV1 {
    return {
        schema_version: "context_fabric_submission_status.v1",
        submission_id: "sub_test_000000",
        state,
        reserved_result_id: "result_reserved_0001",
        ...(resultId === undefined ? {} : { result_id: resultId }),
        updated_at: "2026-10-30T00:00:00Z",
    };
}

/** A thread view for tests: `turns` in the served order, oldest first. */
export function threadView(
    threadId: string,
    turns: readonly ThreadTurnView[],
    earlierTurnsCursor: string | null = null,
): ThreadView {
    return {
        threadId,
        turnCount: turns.length,
        createdAt: turns[0]?.admittedAt ?? "2026-10-30T00:00:00Z",
        lastTurnAt: turns[turns.length - 1]?.admittedAt ?? "2026-10-30T00:00:00Z",
        expiresAt: "2026-11-29T00:00:00Z",
        turns,
        earlierTurnsCursor,
    };
}

/** One thread turn for tests. */
export function threadTurn(
    submissionId: string,
    state: ThreadTurnView["state"],
    options: { question?: string | null; resultId?: string; withheld?: boolean; at?: string } = {},
): ThreadTurnView {
    return {
        submissionId,
        state,
        question: options.question === undefined ? `question of ${submissionId}` : options.question,
        resultId: options.resultId ?? null,
        resultWithheld: options.withheld ?? false,
        admittedAt: options.at ?? "2026-10-30T00:00:00Z",
    };
}

/** One history row for tests. */
export function summary(threadId: string, lastTurnAt = "2026-10-30T00:00:00Z"): ThreadSummaryView {
    return {
        threadId,
        turnCount: 2,
        createdAt: "2026-10-29T00:00:00Z",
        lastTurnAt,
        expiresAt: "2026-11-29T00:00:00Z",
        firstQuestion: null,
    };
}

/**
 * A scripted transport. Its streams ignore the abort signal on purpose: they model a transport that
 * still delivers an event after the store gave the run up, which the store must drop.
 */
export class FakeTransport implements AskDevTransport {
    readonly calls: InvestigateCall[] = [];
    /** Streams whose every step was read (a consumer that stops early leaves one unfinished). */
    finishedStreams = 0;
    readonly scripts: Step[][] = [];
    readonly statuses: (ContextFabricSubmissionStatusV1 | null | Error)[] = [];
    /** A status read or a replay that never answers (and ignores the abort signal). */
    statusHangs = false;
    readHangs = false;
    readonly statusCalls: string[] = [];
    readonly results = new Map<string, TranscriptResult>();
    readonly readCalls: string[] = [];
    /** A replay that throws this (for example a 404 `TransportRefusal`). */
    readonly readErrors = new Map<string, unknown>();
    /** A replay that waits for this before it answers (and ignores the abort signal). */
    readonly readGates = new Map<string, Promise<void>>();
    /** Thread reads: by `thread_id`, or `thread_id|before` for an earlier page. */
    readonly threads = new Map<string, ThreadView | null | { readonly fail: unknown }>();
    readonly threadCalls: {
        readonly threadId: string;
        readonly before?: string | undefined;
        readonly signal?: AbortSignal | undefined;
    }[] = [];
    /** A status read per submission id, when set: it answers instead of `statuses`. */
    statusOf:
        ((submissionId: string) => Promise<ContextFabricSubmissionStatusV1 | null>) | undefined;
    /** A thread read waits for this before it answers (and ignores the abort signal). */
    threadGate: Promise<void> | undefined;
    /** List pages in order (the last one repeats); `{ fail }` throws. */
    readonly listPages: (ThreadListView | { readonly fail: unknown })[] = [];
    readonly listCalls: (string | undefined)[] = [];
    listGate: Promise<void> | undefined;
    readonly deleteCalls: string[] = [];
    deleteGate: Promise<void> | undefined;
    deleteFails: unknown = undefined;

    readonly investigate = (call: InvestigateCall): AsyncIterable<InvestigationEvent> => {
        this.calls.push(call);
        const steps = this.scripts.shift() ?? [];
        const done = () => {
            this.finishedStreams += 1;
        };
        return (async function* () {
            for (const step of steps) {
                if ("wait" in step) await step.wait;
                else if ("fail" in step) throw step.fail;
                else yield step;
            }
            done();
        })();
    };

    readonly submissionStatus = async (
        submissionId: string,
    ): Promise<ContextFabricSubmissionStatusV1 | null> => {
        this.statusCalls.push(submissionId);
        if (this.statusHangs) return new Promise<never>(() => undefined);
        if (this.statusOf !== undefined) return this.statusOf(submissionId);
        const next = this.statuses.length > 1 ? this.statuses.shift() : this.statuses[0];
        if (next instanceof Error) throw next;
        return next ?? null;
    };

    readonly readResult = async (resultId: string): Promise<TranscriptResult> => {
        this.readCalls.push(resultId);
        if (this.readHangs) return new Promise<never>(() => undefined);
        const gate = this.readGates.get(resultId);
        if (gate !== undefined) await gate;
        if (this.readErrors.has(resultId)) throw this.readErrors.get(resultId);
        const result = this.results.get(resultId);
        if (result === undefined) throw new Error("no such result");
        return result;
    };

    readonly listThreads = async (call: {
        readonly cursor?: string | undefined;
    }): Promise<ThreadListView> => {
        this.listCalls.push(call.cursor);
        if (this.listGate !== undefined) await this.listGate;
        const next = this.listPages.length > 1 ? this.listPages.shift() : this.listPages[0];
        if (next === undefined) return { threads: [], nextCursor: null };
        if ("fail" in next) throw next.fail;
        return next;
    };

    readonly readThread = async (call: {
        readonly threadId: string;
        readonly before?: string | undefined;
        readonly signal?: AbortSignal | undefined;
    }): Promise<ThreadView | null> => {
        this.threadCalls.push({
            threadId: call.threadId,
            before: call.before,
            signal: call.signal,
        });
        if (this.threadGate !== undefined) await this.threadGate;
        const key = call.before === undefined ? call.threadId : `${call.threadId}|${call.before}`;
        const answer = this.threads.get(key);
        if (answer === undefined) return null;
        if (answer !== null && "fail" in answer) throw answer.fail;
        return answer;
    };

    readonly deleteThread = async (call: { readonly threadId: string }): Promise<void> => {
        this.deleteCalls.push(call.threadId);
        if (this.deleteGate !== undefined) await this.deleteGate;
        if (this.deleteFails !== undefined) throw this.deleteFails;
    };

    /** Feedback reads (CHAOS-11958): by `result_id`; no entry is never-rated; `null` is a 404. */
    readonly feedback = new Map<string, FeedbackView | null | { readonly fail: unknown }>();
    readonly feedbackReads: string[] = [];
    /** A feedback read waits for this before it answers (and ignores the abort signal). */
    feedbackReadGate: Promise<void> | undefined;
    /**
     * Feedback sets in order: each waits for its `gate` (if any; it ignores the abort signal), then
     * throws its `fail`, or stores the body and answers it. Absent, a set stores at once.
     */
    readonly feedbackSets: { readonly gate?: Promise<void>; readonly fail?: unknown }[] = [];
    readonly feedbackSetCalls: { resultId: string; correct: FeedbackFlag; useful: FeedbackFlag }[] =
        [];

    readonly readFeedback = async (call: {
        readonly resultId: string;
    }): Promise<FeedbackView | null> => {
        this.feedbackReads.push(call.resultId);
        if (this.feedbackReadGate !== undefined) await this.feedbackReadGate;
        const answer = this.feedback.get(call.resultId);
        if (answer === undefined)
            return { resultId: call.resultId, correct: "unset", useful: "unset" };
        if (answer !== null && "fail" in answer) throw answer.fail;
        return answer;
    };

    readonly setFeedback = async (call: {
        readonly resultId: string;
        readonly correct: FeedbackFlag;
        readonly useful: FeedbackFlag;
        readonly signal: AbortSignal;
    }): Promise<FeedbackView> => {
        this.feedbackSetCalls.push({
            resultId: call.resultId,
            correct: call.correct,
            useful: call.useful,
        });
        const step = this.feedbackSets.shift();
        if (step?.gate !== undefined) await step.gate;
        if (step !== undefined && "fail" in step) throw step.fail;
        const stored: FeedbackView = {
            resultId: call.resultId,
            correct: call.correct,
            useful: call.useful,
        };
        this.feedback.set(call.resultId, stored);
        return stored;
    };
}
