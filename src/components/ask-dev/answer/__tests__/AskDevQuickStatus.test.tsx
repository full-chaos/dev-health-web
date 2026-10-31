import { describe, expect, it } from "vitest";
import { render, screen, within } from "@/test/utils";

import { AskDevAnswer } from "../AskDevAnswer";
import { ANSWER_STATUS_LABEL, type AnswerResult } from "../answerModel";
import { statusLabel } from "../quickStatus";
import ownerComplete from "./captures/kiac_repo_owner_complete.event.json";
import ownerCorrected from "./captures/kiac_repo_owner_status_corrected.event.json";
import ciRateComplete from "./captures/kiac_repo_ci_rate_complete.event.json";

/**
 * CHAOS-12157. North Star checks 11 and 12 rank completeness above status: the quick answer never
 * says "Full answer" unless the answer's own completeness is complete. Real kiac answers to the
 * same question, with ACR's completeness authority off (the model's `complete` stands beside
 * `partial` completeness) and on (ACR served `partial` with a `status_correction`). A test that
 * needs a state kiac did not produce changes one field of a copy of a real answer and says so.
 */
const resultOf = (event: { result: unknown }) => event.result as AnswerResult;
const copyOf = (event: { result: unknown }) => structuredClone(resultOf(event));

const knobOff = resultOf(ownerComplete);
const corrected = resultOf(ownerCorrected);
const notDerived = resultOf(ciRateComplete);

/** A raw status word, as ACR serves it: never display text (CHAOS-12245, lead ruling Q2). */
const RAW_STATUS = /\b(complete|partial|degraded|clarification_required|no_match|not_derived)\b/u;

const quick = () => screen.getByTestId("ask-dev-answer-quick");
const pill = () => within(quick()).getByTestId("ask-dev-answer-status");

describe("the captures are the cases this ticket is about", () => {
    it("has the same question with the authority off and on", () => {
        expect(knobOff.status).toBe("complete");
        expect(knobOff.completeness.state).toBe("partial");
        expect(knobOff.status_correction).toBeUndefined();
        expect(corrected.status).toBe("partial");
        expect(corrected.status_correction).toMatchObject({
            replaced_status: "complete",
            direction: "complete_to_partial",
        });
        expect(notDerived.status).toBe("complete");
        expect(notDerived.completeness.state).toBe("not_derived");
    });
});

describe("the quick answer never says 'Full answer' unless completeness is complete", () => {
    it("authority off: a 'complete' status with partial completeness is not a full answer", () => {
        render(<AskDevAnswer result={knobOff} />);
        expect(pill()).not.toHaveTextContent(ANSWER_STATUS_LABEL.complete);
        expect(pill()).toHaveAttribute("data-coverage", "partial");
        // CHAOS-12245: one plain sentence of missing data, never the state word.
        expect(within(quick()).getByTestId("ask-dev-answer-completeness")).toHaveTextContent(
            "Missing data: health read in part (1 of 1); status read in part (1 of 4).",
        );
    });

    // CHAOS-12245: not derived renders nothing about completeness; the pill claims neither.
    it("a 'complete' status whose completeness was not derived is a plain answer, not a full one", () => {
        render(<AskDevAnswer result={notDerived} />);
        expect(pill()).toHaveTextContent(/^Answer$/u);
        expect(within(quick()).queryByTestId("ask-dev-answer-completeness")).toBeNull();
    });

    it("a 'complete' status with no completeness at all is a plain answer, not a full one", () => {
        // A copy of a real answer without completeness (an older stored result has none).
        const copy = copyOf(ownerComplete) as unknown as Record<string, unknown>;
        delete copy.completeness;
        render(<AskDevAnswer result={copy as unknown as AnswerResult} />);
        expect(pill()).toHaveTextContent(/^Answer$/u);
        expect(within(quick()).queryByTestId("ask-dev-answer-completeness")).toBeNull();
    });

    it("says 'Full answer' when the status and the completeness are both complete", () => {
        // A copy of a real answer with its completeness state set to complete: kiac served none.
        const copy = copyOf(ownerComplete);
        copy.completeness.state = "complete";
        render(<AskDevAnswer result={copy} />);
        expect(pill()).toHaveTextContent(ANSWER_STATUS_LABEL.complete);
        expect(within(quick()).queryByTestId("ask-dev-answer-completeness")).toBeNull();
    });
});

describe("statusLabel: the one labelling function of the pill and the note (CHAOS-12245)", () => {
    it("never returns a raw status word, even for a status it has no label for", () => {
        expect(statusLabel("degraded", null)).toBe("Degraded answer");
        expect(statusLabel("complete", null)).toBe("Answer");
        // An open-vocabulary status a newer ACR might serve: humanized, never the raw token.
        expect(statusLabel("needs_review", null)).not.toBe("needs_review");
        expect(statusLabel("needs_review", null)).not.toMatch(/_/u);
    });
});

describe("a served status correction is shown as served, never re-derived", () => {
    it("authority on: shows the served status and says ACR lowered it, and why", () => {
        render(<AskDevAnswer result={corrected} />);
        expect(pill()).toHaveTextContent(ANSWER_STATUS_LABEL.partial);
        const note = within(quick()).getByTestId("ask-dev-answer-correction");
        // CHAOS-12245 (lead ruling Q2): each status by the pill's own label function.
        expect(note).toHaveTextContent(
            `The service lowered this answer from ${statusLabel("complete", corrected.completeness)} to ${statusLabel("partial", corrected.completeness)}: health was read only in part.`,
        );
        expect(note.textContent).not.toMatch(RAW_STATUS);
    });

    it("names a 'complete' status whose completeness was not derived as the pill does: Answer", () => {
        const copy = copyOf(ownerCorrected);
        copy.completeness.state = "not_derived";
        render(<AskDevAnswer result={copy} />);
        const note = within(quick()).getByTestId("ask-dev-answer-correction");
        expect(note).toHaveTextContent(
            "The service lowered this answer from Answer to Partial answer: health was read only in part.",
        );
        expect(note.textContent).not.toMatch(RAW_STATUS);
    });

    it("says 'raised' for a degraded_to_partial correction, never 'lowered'", () => {
        // A copy of the real corrected answer with the other schema direction (codex r1 P2 on
        // #1621): ACR's symmetric authority can raise a degraded status to partial.
        const copy = copyOf(ownerCorrected);
        copy.status_correction = {
            ...copy.status_correction!,
            replaced_status: "degraded",
            direction: "degraded_to_partial",
            deciding_outcome: "satisfied",
        };
        render(<AskDevAnswer result={copy} />);
        const note = within(quick()).getByTestId("ask-dev-answer-correction");
        expect(note).toHaveTextContent(
            "The service raised this answer from Degraded answer to Partial answer: health was read in full.",
        );
        expect(note).not.toHaveTextContent("lowered");
        expect(note.textContent).not.toMatch(RAW_STATUS);
    });

    it("does not upgrade a corrected status, whatever the completeness says", () => {
        // A copy of the corrected answer with completeness complete: the served status stands.
        const copy = copyOf(ownerCorrected);
        copy.completeness.state = "complete";
        render(<AskDevAnswer result={copy} />);
        expect(pill()).toHaveTextContent(ANSWER_STATUS_LABEL.partial);
    });
});

describe("two answered turns in one transcript", () => {
    it("repeat no landmark: an answer's parts are groups, not named regions", async () => {
        // Found by the e2e axe check of this ticket: the first transcript with two answers.
        const axe = (await import("axe-core")).default;
        const { container } = render(
            <div>
                <AskDevAnswer result={knobOff} />
                <AskDevAnswer result={corrected} />
            </div>,
        );
        const result = await axe.run(container, { runOnly: ["landmark-unique"] });
        expect(result.violations.map((v) => v.id)).toEqual([]);
        expect(container.querySelectorAll("section[aria-labelledby]")).toHaveLength(0);
    });
});
