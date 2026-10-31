import { describe, expect, it } from "vitest";

import { AcrRuntimeClient } from "../client";
import {
    NOT_RUN_COPY,
    STOPPED_COPY,
} from "@/components/ask-dev/conversation/AskDevConversationTurn";

import type { NotRunReason } from "@/components/ask-dev/conversation/conversationStore";

import { safeAcrRuntimeMessage, type AcrRuntimeErrorCode } from "../errors";

// CHAOS-12201: ACR's per-call access refusals and the Ask Dev limits each keep their own code and
// guidance; none of them reads as an outage, and no copy names an internal service.
const client = new AcrRuntimeClient({} as never);

describe("investigationFailure: refusals keep their own code", () => {
    it.each([
        ["access_denied", 403, "access_denied", false],
        ["no_repository", 409, "no_repository", false],
        ["budget_exhausted", 503, "budget_exhausted", true],
        ["concurrency_limited", 429, "concurrency_limited", true],
        ["allowance_exhausted", 429, "allowance_exhausted", false],
    ] as const)("%s (%i)", (wire, status, code, retryable) => {
        const failure = client.investigationFailure(status, wire, undefined);
        expect(failure.code).toBe(code);
        expect(failure.status).toBe(status);
        expect(failure.retryable).toBe(retryable);
        const message = safeAcrRuntimeMessage(failure.code);
        expect(message).not.toMatch(/temporarily|Agent Context Runtime|ACR/u);
        expect(message.length).toBeGreaterThan(10);
    });

    it("keeps the Retry-After of a refusal that has one", () => {
        expect(client.investigationFailure(503, "budget_exhausted", 7).retryAfterSeconds).toBe(7);
        expect(client.investigationFailure(429, "concurrency_limited", 12).retryAfterSeconds).toBe(
            12,
        );
    });

    it("decides by status and code together: the code at another status is not trusted", () => {
        expect(client.investigationFailure(500, "access_denied", undefined).code).toBe("upstream");
        expect(client.investigationFailure(429, "some_future_code", undefined).code).toBe(
            "upstream",
        );
    });

    it("gives each refusal different guidance", () => {
        const messages = [
            "access_denied",
            "no_repository",
            "budget_exhausted",
            "concurrency_limited",
            "allowance_exhausted",
        ].map((code) => safeAcrRuntimeMessage(code as never));
        expect(new Set(messages).size).toBe(messages.length);
    });

    // codex r2 on #1639: every reason the panel shows has an Ask Dev code in the client with the
    // same words; none is excluded. A new reason without one is a compile error here.
    it("says the same words as the conversation store, for every reason", () => {
        const webCodeOf: Record<NotRunReason, AcrRuntimeErrorCode> = {
            access_denied: "access_denied",
            no_repository: "no_repository",
            budget_exhausted: "budget_exhausted",
            concurrency_limited: "concurrency_limited",
            allowance_exhausted: "allowance_exhausted",
            stream_unavailable: "stream_unavailable",
            not_entitled: "ask_dev_not_entitled",
            repo_forbidden: "ask_dev_repo_forbidden",
            budget_refusal: "budget_refusal",
            rate_limited: "ask_dev_rate_limited",
        };
        for (const [reason, copy] of Object.entries(NOT_RUN_COPY) as [NotRunReason, string][]) {
            expect(safeAcrRuntimeMessage(webCodeOf[reason])).toBe(copy);
        }
    });
});

// codex r1 on #1639: every error.v1 code a create-investigation call (or its stream) can get, at
// each status ACR sends it with, reaches its own state; only real outages read as one.
describe("investigationFailure: the whole create-investigation vocabulary", () => {
    it.each([
        [400, "invalid_request", "invalid_request", false],
        [409, "invalid_request", "invalid_request", false],
        [413, "invalid_request", "invalid_request", false],
        [400, "submission_required", "invalid_request", false],
        [403, "insufficient_scope", "ask_dev_not_entitled", false],
        [403, "feature_not_enabled", "ask_dev_not_entitled", false],
        [501, "feature_not_enabled", "ask_dev_not_entitled", false],
        [403, "repo_forbidden", "ask_dev_repo_forbidden", false],
        // codex r2 on #1639: ACR's per-principal rate limit is not an outage.
        [429, "rate_limited", "ask_dev_rate_limited", true],
        [406, "stream_unavailable", "stream_unavailable", false],
        [409, "submission_mismatch", "invalid_request", false],
        [409, "submission_in_progress", "submission_in_progress", true],
        [409, "submission_unsaved", "submission_unsaved", false],
        [409, "submission_abandoned", "interrupted", false],
        [409, "thread_closed", "thread_closed", false],
        [409, "canceled", "canceled", false],
        [413, "budget_refusal", "budget_refusal", false],
        [503, "run_lost", "interrupted", false],
    ] as const)("%i %s → %s, retry %s", (status, wire, code, retryable) => {
        const failure = client.investigationFailure(status, wire, undefined);
        expect(failure.code).toBe(code);
        expect(failure.retryable).toBe(retryable);
        expect(safeAcrRuntimeMessage(failure.code)).not.toMatch(/temporarily/u);
    });

    it.each([
        [500, "internal_error"],
        [502, "upstream_invalid_output"],
        [503, "upstream_unavailable"],
        [504, "upstream_unavailable"],
        [503, "store_unavailable"],
    ] as const)("a real outage stays one: %i %s", (status, wire) => {
        const failure = client.investigationFailure(status, wire, undefined);
        expect(failure.code).toBe("upstream");
        expect(failure.retryable).toBe(true);
    });

    // codex r3 on #1639: a run stopped by a rejected step reads the same in the route and the panel.
    it("says the same words as the panel for a rejected step", () => {
        expect(safeAcrRuntimeMessage("interpretation_rejected")).toBe(
            STOPPED_COPY.interpretation_rejected,
        );
        expect(safeAcrRuntimeMessage("synthesis_rejected")).toBe(STOPPED_COPY.synthesis_rejected);
    });
});
