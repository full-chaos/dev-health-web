import type {
    ACRContextFabricInvestigationRequestV1 as InvestigationRequest,
    ACRErrorV1,
    ContextFabricSubmissionStatusV1,
} from "@/lib/acr/generated";

import type { TranscriptResult } from "../answer/AskDevTurn";

/**
 * The one seam between the Ask Dev conversation store (CHAOS-11928) and ACR. The browser calls ACR
 * directly (design amendment 2026-10-30, "Ask Dev: browser calls ACR directly with an ACR OAuth
 * credential"): there is no web or ask-dev proxy in front of it. The store decides WHEN to call and
 * what each answer means; a transport only carries the calls.
 *
 * The live transport is item T14 (CHAOS-12104, `feat(ask-dev): stream ACR investigation events in
 * the browser`), built on the ACR browser OAuth client T13 (CHAOS-12103). Until it lands,
 * `ACR_BROWSER_TRANSPORT` is `null`: the panel draws no composer and sends nothing. Test mode alone
 * supplies a transport (`testModeTransport.ts`). The proofs that need the live transport (the store
 * owns the LIVE stream; recovery through LIVE status polling) are CHAOS-12192, blocked by T14.
 *
 * Authorization is not part of this seam: the transport attaches the credential, and ACR decides
 * every call again (INV-1). The store never sees a token.
 */

/** ACR's closed stage vocabulary, in its one order (`context_fabric_investigation_event.v1`). */
export type InvestigationStage =
    "interpreting" | "resolving_subjects" | "reading_facts" | "synthesizing" | "validating";

type EventBase = { readonly seq: number; readonly request_id: string };

/**
 * One parsed `context_fabric_investigation_event.v1` event, as the store reads it. The transport
 * parses and checks the frames (T14 owns the grammar); `result` and `error` are terminal.
 */
export type InvestigationEvent =
    | (EventBase & {
          readonly type: "accepted";
          readonly reserved_result_id: string;
          readonly submission_id?: string | undefined;
          readonly thread_id?: string | undefined;
          readonly started_at: string;
          readonly budget_seconds: number;
      })
    | (EventBase & {
          readonly type: "stage";
          readonly stage: InvestigationStage;
          readonly state: "started" | "completed";
          readonly elapsed_ms: number;
      })
    | (EventBase & { readonly type: "heartbeat"; readonly stage?: InvestigationStage | undefined })
    | (EventBase & { readonly type: "result"; readonly result: TranscriptResult })
    | (EventBase & {
          readonly type: "error";
          readonly reserved_result_id: string;
          readonly error: ACRErrorV1;
          readonly stage?: InvestigationStage | undefined;
      });

export type InvestigateCall = {
    /** The wire request, built by `buildInvestigationRequest`; sent byte for byte. */
    readonly request: InvestigationRequest;
    /** `X-ACR-Submission-ID`: one per user submit, reused only to retry this identical request. */
    readonly submissionId: string;
    /** `X-ACR-Thread-ID`: one per conversation, sent on every turn. */
    readonly threadId: string;
    /** Aborting it is the only cancel (plan §2.7.4: a disconnect ends the run). */
    readonly signal: AbortSignal;
};

/**
 * ACR answered before the stream opened: an HTTP status and its `error.v1` body (for example
 * `409 submission_in_progress` on a retry while the first run is still live).
 */
export class TransportRefusal extends Error {
    readonly status: number;
    readonly error: ACRErrorV1;

    constructor(status: number, error: ACRErrorV1) {
        super(`ACR refused the call: ${String(status)} ${error.error.code}`);
        this.name = "TransportRefusal";
        this.status = status;
        this.error = error;
    }
}

export type AskDevTransport = {
    /**
     * Opens one investigation stream (`Accept: text/event-stream`). It yields the events in `seq`
     * order and ends after the terminal. Ending without a terminal, or throwing anything but a
     * `TransportRefusal` or an abort, is a dropped run: the store recovers it through the
     * submission status.
     */
    readonly investigate: (call: InvestigateCall) => AsyncIterable<InvestigationEvent>;
    /**
     * `GET …/investigations/submissions/{submission_id}`: the caller's own submission, or `null`
     * for ACR's 404 (unknown id, or not this principal's). Each call is a fresh authorized call.
     */
    readonly submissionStatus: (
        submissionId: string,
        signal: AbortSignal,
    ) => Promise<ContextFabricSubmissionStatusV1 | null>;
    /** `GET …/investigations/{result_id}`: replays a stored result, which ACR authorizes again. */
    readonly readResult: (resultId: string, signal: AbortSignal) => Promise<TranscriptResult>;
};

/**
 * The live browser transport. `null` until T14 (CHAOS-12104) fills it: no composer, no request.
 * T14 replaces this one line with its client; nothing else in the store changes.
 */
export const ACR_BROWSER_TRANSPORT: AskDevTransport | null = null;
