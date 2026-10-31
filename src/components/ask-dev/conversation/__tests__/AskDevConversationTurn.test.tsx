import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AskDevConversationTurn, NOT_RUN_COPY, STOPPED_COPY } from "../AskDevConversationTurn";
import type { StoreTurn, TurnOutcome } from "../conversationStore";

const turn = (outcome: TurnOutcome): StoreTurn => ({
    id: 1,
    question: "Which projects are at risk?",
    createdAt: "2026-10-31T00:00:00Z",
    submissionId: "sub_00000000000000000000000000000001",
    request: {} as never,
    outcome,
});

// CHAOS-12201: each refusal says what to do; none reads as an outage or names a service.
describe("AskDevConversationTurn: not-run refusals", () => {
    it.each([
        ["access_denied", false],
        ["no_repository", false],
        ["budget_exhausted", true],
        ["concurrency_limited", true],
        ["allowance_exhausted", false],
        ["stream_unavailable", false],
        ["not_entitled", false],
        ["repo_forbidden", false],
        ["budget_refusal", false],
        ["rate_limited", true],
    ] as const)("%s shows its own guidance (retry %s)", async (reason, retry) => {
        const onRetry = vi.fn();
        render(
            <AskDevConversationTurn
                turn={turn({ kind: "not_run", reason, retry })}
                onRetry={onRetry}
            />,
        );
        const status = screen.getByTestId("ask-dev-turn-status");
        expect(status).toHaveTextContent(NOT_RUN_COPY[reason]);
        expect(status.textContent).not.toMatch(/temporarily|Agent Context Runtime|ACR/u);
        if (retry) {
            await userEvent.click(screen.getByRole("button", { name: "Retry" }));
            expect(onRetry).toHaveBeenCalledOnce();
        } else {
            expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
        }
    });

    // codex r1 P3 on #1639: access_denied also covers a user who is not a member.
    it("access_denied names both ways back: sign in again, or ask an admin", () => {
        expect(NOT_RUN_COPY.access_denied).toMatch(/Sign in again/u);
        expect(NOT_RUN_COPY.access_denied).toMatch(/admin/u);
    });

    it("gives every reason different words", () => {
        const copy = Object.values(NOT_RUN_COPY);
        expect(new Set(copy).size).toBe(copy.length);
    });
});

// codex r3 on #1639: a run ACR stopped after it started says why, and offers no retry.
describe("AskDevConversationTurn: stopped runs", () => {
    it.each(["rate_limited", "interpretation_rejected", "synthesis_rejected"] as const)(
        "%s shows its own words and no Retry",
        (reason) => {
            render(
                <AskDevConversationTurn
                    turn={turn({ kind: "stopped", reason })}
                    onRetry={vi.fn()}
                />,
            );
            const status = screen.getByTestId("ask-dev-turn-status");
            expect(status).toHaveTextContent(STOPPED_COPY[reason]);
            expect(status.textContent).not.toMatch(
                /did not finish|temporarily|Agent Context Runtime/u,
            );
            expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
        },
    );

    it("tells the user to wait after a rate limit", () => {
        expect(STOPPED_COPY.rate_limited).toMatch(/Wait/u);
    });
});
