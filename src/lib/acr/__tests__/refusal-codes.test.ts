import { describe, expect, it } from "vitest";

import { AcrRuntimeClient } from "../client";
import { NOT_RUN_COPY } from "@/components/ask-dev/conversation/AskDevConversationTurn";

import { safeAcrRuntimeMessage } from "../errors";

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
        expect(client.investigationFailure(429, "rate_limited", undefined).code).toBe("upstream");
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

    it("says the same words as the conversation store", () => {
        for (const [code, copy] of Object.entries(NOT_RUN_COPY)) {
            expect(safeAcrRuntimeMessage(code as never)).toBe(copy);
        }
    });
});
