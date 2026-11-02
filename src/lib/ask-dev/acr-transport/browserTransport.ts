import type { ContextFabricSubmissionStatusV1 } from "@/lib/acr/generated";
import {
    acrQuery as query,
    createAcrCalls,
    TransportFailure,
    type AcrBrowserClientConfig,
    type AcrCallDependencies,
    type StreamEnvelopeValidators,
    type StreamValidators,
} from "@full-chaos/ask-dev/acr-client";

import "@/lib/ask-dev/acr-log";
import { parseExpandedEvidence } from "@/lib/acr/evidenceContract";
import { parseResultFeedback } from "@/lib/acr/feedbackContract";
import { parseThread, parseThreadList } from "@/lib/acr/threadContract";
import { asTranscriptResult } from "@/components/ask-dev/conversation/testModeAnswer";
import type { TranscriptResult } from "@/lib/ask-dev/transcript";
import type { AskDevTransport, FeedbackView } from "@/components/ask-dev/conversation/transport";

export type { StreamEnvelopeValidators, StreamValidators };

/**
 * Web's ACR transport (CHAOS-12541). The client, its calls and its checks are ask-dev's
 * (`@full-chaos/ask-dev/acr-client`). Web adds the reads only it has: threads, evidence and
 * feedback, on the same call rules, each mapping every status ACR's OpenAPI names for its route.
 */
export type BrowserTransportDependencies = Omit<AcrCallDependencies<TranscriptResult>, "isResult">;

/** The one route the browser reads outside the Context Fabric API (CHAOS-12105). */
const EVIDENCE_API = "/api/v1/agent-context/evidence";

/** A `context_fabric_result_feedback.v1` body as the store reads it; a broken one is invalid. */
function feedbackOf(body: unknown): FeedbackView {
    const view = parseResultFeedback(body);
    if (view === null) throw new TransportFailure("invalid_upstream");
    return view;
}

export function createAcrBrowserTransport(
    config: AcrBrowserClientConfig,
    dependencies: BrowserTransportDependencies,
): AskDevTransport {
    const calls = createAcrCalls<TranscriptResult, ContextFabricSubmissionStatusV1>(config, {
        ...dependencies,
        isResult: (value): value is TranscriptResult => asTranscriptResult(value) !== null,
    });
    const { callJson, callUrl, refuse } = calls;

    return {
        investigate: calls.investigate,
        attach: calls.attach,
        submissionStatus: calls.submissionStatus,
        readResult: calls.readResult,
        cancel: calls.cancel,
        async listThreads({ cursor, limit, signal }) {
            const path = `/threads${query({ limit: String(limit), cursor })}`;
            // A History read: the render asks for it only while the list is on screen.
            const { response, body } = await callJson(
                path,
                "threads_list",
                signal,
                "GET",
                undefined,
                "user_act",
            );
            if (!response.ok) return refuse(response, "threads_list", signal);
            const view = parseThreadList(body);
            if (view === null) throw new TransportFailure("invalid_upstream");
            return view;
        },
        async readThread({ threadId, before, signal, userAct }) {
            const path = `/threads/${encodeURIComponent(threadId)}${query({ before })}`;
            const { response, body } = await callJson(
                path,
                "thread_read",
                signal,
                "GET",
                undefined,
                userAct === true ? "user_act" : "background",
            );
            // ACR's 404 is one answer for every cause (another principal's, unknown, deleted,
            // expired or malformed).
            if (response.status === 404) return null;
            if (!response.ok) return refuse(response, "thread_read", signal);
            const view = parseThread(body);
            if (view === null) throw new TransportFailure("invalid_upstream");
            return view;
        },
        async deleteThread({ threadId, signal }) {
            const path = `/threads/${encodeURIComponent(threadId)}`;
            const { response } = await callJson(path, "thread_delete", signal, "DELETE");
            if (response.status === 204) return;
            if (!response.ok) return refuse(response, "thread_delete", signal);
            throw new TransportFailure("invalid_upstream");
        },
        async readEvidence({ refId, resultId, signal }) {
            const ref = encodeURIComponent(refId);
            const url = `${config.issuer}${EVIDENCE_API}/${ref}${query({ result_id: resultId })}`;
            // Mounted by the open, so a read is one click, and "Try again" one more.
            const { response, body } = await callUrl(
                url,
                "evidence_read",
                signal,
                "GET",
                undefined,
                "user_act",
            );
            // Gone, or another principal's: the same answer.
            if (response.status === 404) return null;
            if (!response.ok) return refuse(response, "evidence_read", signal);
            const view = body === undefined ? null : parseExpandedEvidence(body);
            if (view === null) throw new TransportFailure("invalid_upstream");
            return view;
        },
        async readFeedback({ resultId, signal }) {
            const path = `/investigations/feedback/${encodeURIComponent(resultId)}`;
            const { response, body } = await callJson(path, "feedback_read", signal);
            // Not the caller's Ask Dev result, or one ACR would not serve now: the same answer.
            if (response.status === 404) return null;
            if (!response.ok) return refuse(response, "feedback_read", signal);
            return feedbackOf(body);
        },
        async setFeedback({ resultId, correct, useful, signal }) {
            const path = `/investigations/feedback/${encodeURIComponent(resultId)}`;
            const request = {
                schema_version: "context_fabric_result_feedback_request.v1",
                correct,
                useful,
            };
            const { response, body } = await callJson(
                path,
                "feedback_set",
                signal,
                "POST",
                request,
            );
            if (!response.ok) return refuse(response, "feedback_set", signal);
            return feedbackOf(body);
        },
    };
}
