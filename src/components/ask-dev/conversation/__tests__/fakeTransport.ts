import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ACRErrorV1, ContextFabricSubmissionStatusV1 } from "@/lib/acr/generated";

import type { TranscriptResult } from "../../answer/AskDevTurn";
import type { AskDevTransport, InvestigateCall, InvestigationEvent } from "../transport";

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

/**
 * A scripted transport. Its streams ignore the abort signal on purpose: they model a transport that
 * still delivers an event after the store gave the run up, which the store must drop.
 */
export class FakeTransport implements AskDevTransport {
    readonly calls: InvestigateCall[] = [];
    readonly scripts: Step[][] = [];
    readonly statuses: (ContextFabricSubmissionStatusV1 | null | Error)[] = [];
    readonly statusCalls: string[] = [];
    readonly results = new Map<string, TranscriptResult>();
    readonly readCalls: string[] = [];

    readonly investigate = (call: InvestigateCall): AsyncIterable<InvestigationEvent> => {
        this.calls.push(call);
        const steps = this.scripts.shift() ?? [];
        return (async function* () {
            for (const step of steps) {
                if ("wait" in step) await step.wait;
                else if ("fail" in step) throw step.fail;
                else yield step;
            }
        })();
    };

    readonly submissionStatus = async (
        submissionId: string,
    ): Promise<ContextFabricSubmissionStatusV1 | null> => {
        this.statusCalls.push(submissionId);
        const next = this.statuses.length > 1 ? this.statuses.shift() : this.statuses[0];
        if (next instanceof Error) throw next;
        return next ?? null;
    };

    readonly readResult = async (resultId: string): Promise<TranscriptResult> => {
        this.readCalls.push(resultId);
        const result = this.results.get(resultId);
        if (result === undefined) throw new Error("no such result");
        return result;
    };
}
