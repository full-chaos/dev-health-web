import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AskDevConversationTurn, NOT_RUN_COPY } from "../AskDevConversationTurn";
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

    it("gives every reason different words", () => {
        const copy = Object.values(NOT_RUN_COPY);
        expect(new Set(copy).size).toBe(copy.length);
    });
});
