import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { AskDevRefusal } from "../AskDevRefusal";
import { AskDevTurn } from "../AskDevTurn";
import {
    REFUSAL_COPY,
    isBudgetRefusal,
    narrowingAxis,
    overrunSentence,
    type RefusalEvent,
    type RefusalTurn,
} from "../refusalModel";
import index from "./captures/index.json";
import evidenceWindow from "./captures/acr_encoder_budget_refusal_evidence_window.event.json";
import resultCount from "./captures/acr_encoder_budget_refusal_result_count.event.json";
import scopeAnchor from "./captures/acr_encoder_budget_refusal_scope_anchor.event.json";
import groupSelection from "./captures/acr_encoder_budget_refusal_group_selection.event.json";
import comparisonPair from "./captures/acr_encoder_budget_refusal_comparison_pair.event.json";
import noAxis from "./captures/acr_encoder_budget_refusal_none.event.json";

/**
 * CHAOS-3440, the narrower re-ask. Every event is the error frame acr's own route wrote at the
 * pinned commit for a real `AnswerBudgetRefusal` (`captures/index.json`, `encoder_captures`): kiac
 * produced no 413. The question of each turn is the one that capture sent.
 */
const FILES = {
    evidence_window: ["acr_encoder_budget_refusal_evidence_window.event.json", evidenceWindow],
    result_count: ["acr_encoder_budget_refusal_result_count.event.json", resultCount],
    scope_anchor: ["acr_encoder_budget_refusal_scope_anchor.event.json", scopeAnchor],
    group_selection: ["acr_encoder_budget_refusal_group_selection.event.json", groupSelection],
    comparison_pair: ["acr_encoder_budget_refusal_comparison_pair.event.json", comparisonPair],
    none: ["acr_encoder_budget_refusal_none.event.json", noAxis],
} as const;

function turnOf(axis: keyof typeof FILES): RefusalTurn {
    const [file, event] = FILES[axis];
    const entry = index.encoder_captures.captures.find((c) => c.file === file);
    if (!entry) throw new Error(`${file} is not indexed`);
    return { question: entry.question, refusal: event as unknown as RefusalEvent };
}

const AXES = [
    "evidence_window",
    "result_count",
    "scope_anchor",
    "group_selection",
    "comparison_pair",
] as const;

describe("refusalModel: reads the closed tokens ACR sent", () => {
    it.each(AXES)("names the %s axis from the served continuation", (axis) => {
        const { refusal } = turnOf(axis);
        expect(isBudgetRefusal(refusal)).toBe(true);
        expect(narrowingAxis(refusal)).toBe(axis);
    });

    it("has no axis when ACR omitted the continuation", () => {
        const { refusal } = turnOf("none");
        expect(refusal.error.error.details).not.toHaveProperty("narrower_continuation");
        expect(narrowingAxis(refusal)).toBeNull();
    });

    it("reads an axis outside the closed vocabulary as absent", () => {
        // A copy of a real refusal with one token changed: an unknown axis is never shown.
        const copy = structuredClone(turnOf("evidence_window").refusal) as unknown as {
            error: { error: { details: { narrower_continuation: { axis: string } } } };
        };
        copy.error.error.details.narrower_continuation.axis = "ask_about_one_subject";
        expect(narrowingAxis(copy as unknown as RefusalEvent)).toBeNull();
    });

    it("states an items overrun and a size overrun with the served numbers", () => {
        expect(overrunSentence(turnOf("result_count").refusal)).toBe(
            REFUSAL_COPY.overrunItems(41, 30),
        );
        expect(overrunSentence(turnOf("evidence_window").refusal)).toBe(
            REFUSAL_COPY.overrunBytes("295 KB", "256 KB"),
        );
    });
});

describe("AskDevRefusal: the narrower re-ask", () => {
    it.each(AXES)("shows this view's words for %s, never a served sentence", (axis) => {
        render(<AskDevRefusal turn={turnOf(axis)} onReask={vi.fn()} />);
        expect(screen.getByTestId("ask-dev-answer-status")).toHaveTextContent(REFUSAL_COPY.status);
        expect(screen.getByTestId("ask-dev-refusal-narrower")).toHaveTextContent(
            REFUSAL_COPY.axis[axis],
        );
        expect(screen.getByTestId("ask-dev-refusal")).toHaveAttribute("data-axis", axis);
        // ACR's English message is for operators: the view never shows it.
        const message = turnOf(axis).refusal.error.error.message;
        expect(screen.queryByText(message)).toBeNull();
    });

    it("says no narrower form exists and offers no re-ask when ACR named no axis", () => {
        render(<AskDevRefusal turn={turnOf("none")} onReask={vi.fn()} />);
        expect(screen.getByTestId("ask-dev-refusal-narrower")).toHaveTextContent(
            REFUSAL_COPY.noAxis,
        );
        expect(screen.queryByTestId("ask-dev-refusal-reask")).toBeNull();
    });

    it("says nothing more could be cut, and that the same question gives the same result", () => {
        render(<AskDevRefusal turn={turnOf("evidence_window")} onReask={vi.fn()} />);
        expect(screen.getByTestId("ask-dev-refusal-overrun")).toHaveTextContent(
            REFUSAL_COPY.nothingLeftToCut,
        );
        expect(screen.getByText(REFUSAL_COPY.sameAgain)).toBeInTheDocument();
    });

    it("hands back the question and the axis once, with no receipt", async () => {
        const onReask = vi.fn();
        const user = userEvent.setup();
        const turn = turnOf("result_count");
        render(<AskDevRefusal turn={turn} onReask={onReask} />);
        const button = screen.getByTestId("ask-dev-refusal-reask");
        await user.click(button);
        expect(onReask).toHaveBeenCalledTimes(1);
        expect(onReask).toHaveBeenCalledWith({ question: turn.question, axis: "result_count" });
        expect(button).toBeDisabled();
        expect(button).toHaveTextContent(REFUSAL_COPY.reasked);
        await user.click(button);
        expect(onReask).toHaveBeenCalledTimes(1);
    });

    it("is read-only on a prior turn", () => {
        render(<AskDevRefusal turn={turnOf("scope_anchor")} />);
        expect(screen.queryAllByRole("button")).toEqual([]);
        expect(screen.getByTestId("ask-dev-refusal-prior")).toHaveTextContent(
            REFUSAL_COPY.priorTurnNote,
        );
    });

    it("renders in the transcript turn under the question that was asked", () => {
        const turn = turnOf("comparison_pair");
        render(<AskDevTurn turn={turn} onReask={vi.fn()} />);
        expect(screen.getByTestId("ask-dev-turn")).toHaveAttribute("data-status", "budget_refusal");
        expect(screen.getByTestId("ask-dev-turn")).toHaveTextContent(turn.question);
        expect(screen.getByTestId("ask-dev-refusal")).toHaveAttribute("data-live", "true");
    });
});
