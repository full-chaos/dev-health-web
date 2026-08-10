/**
 * The feedback footer, with one invariant above all others: a reason is never
 * recorded that the reader did not express.
 *
 * The implementation this replaced sent `["unclear"]` for every unhelpful
 * rating. Nothing tested the feedback flow at all, which is exactly how that
 * survived — so these assert the SUBMITTED PAYLOAD, not that a click happened
 * or a spinner appeared.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackFooter, type FeedbackSubmission } from "./FeedbackFooter";
import {
    FEEDBACK_REASON_LABELS,
    NEGATIVE_FEEDBACK_REASONS,
    POSITIVE_FEEDBACK_REASON,
} from "./feedbackReasons";

const onSubmit = vi.fn<(submission: FeedbackSubmission) => void>();

function renderFooter(state: "helpful" | "not_helpful" | "saving" | null = null) {
    return render(<FeedbackFooter error={null} onSubmit={onSubmit} state={state} />);
}

const label = (reason: (typeof NEGATIVE_FEEDBACK_REASONS)[number]) =>
    FEEDBACK_REASON_LABELS[reason];

describe("FeedbackFooter positive path", () => {
    beforeEach(() => onSubmit.mockReset());

    it("submits on one click, recording only the reason that restates the button", async () => {
        renderFooter();
        await userEvent.click(screen.getByRole("button", { name: "Helpful" }));
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit.mock.calls[0]![0]).toEqual({
            rating: "helpful",
            reasons: [POSITIVE_FEEDBACK_REASON],
            comment: null,
        });
    });
});

describe("FeedbackFooter negative path", () => {
    beforeEach(() => onSubmit.mockReset());

    it("does NOT submit when the rating is chosen — it asks first", async () => {
        renderFooter();
        await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByText(/pick at least one/iu)).toBeInTheDocument();
    });

    it("keeps Save disabled until a reason is actually chosen", async () => {
        renderFooter();
        await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
        const save = screen.getByRole("button", { name: "Save" });
        expect(save).toBeDisabled();

        await userEvent.click(screen.getByRole("button", { name: label("unclear") }));
        expect(save).toBeEnabled();
    });

    it("cannot be made to submit with no reason, even by clicking a disabled Save", async () => {
        renderFooter();
        await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("records exactly the reasons chosen, and nothing inferred", async () => {
        renderFooter();
        await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
        await userEvent.click(screen.getByRole("button", { name: label("missing_evidence") }));
        await userEvent.click(screen.getByRole("button", { name: label("stale_data") }));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(onSubmit).toHaveBeenCalledTimes(1);
        const submission = onSubmit.mock.calls[0]![0];
        expect(submission.rating).toBe("not_helpful");
        expect(submission.reasons.slice().sort()).toEqual(["missing_evidence", "stale_data"]);
        // The specific regression: no diagnosis the reader never picked.
        expect(submission.reasons).not.toContain("unclear");
        expect(submission.comment).toBeNull();
    });

    it("deselects a reason on a second click and records the remainder", async () => {
        renderFooter();
        await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
        const incorrect = screen.getByRole("button", { name: label("incorrect") });
        await userEvent.click(incorrect);
        expect(incorrect).toHaveAttribute("aria-pressed", "true");
        await userEvent.click(incorrect);
        expect(incorrect).toHaveAttribute("aria-pressed", "false");

        await userEvent.click(screen.getByRole("button", { name: label("wrong_scope") }));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSubmit.mock.calls[0]![0].reasons).toEqual(["wrong_scope"]);
    });

    it("passes a trimmed comment, and null when it is blank or whitespace", async () => {
        renderFooter();
        await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
        await userEvent.click(screen.getByRole("button", { name: label("incorrect") }));
        await userEvent.type(screen.getByRole("textbox"), "   the cohort was wrong   ");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSubmit.mock.calls[0]![0].comment).toBe("the cohort was wrong");

        onSubmit.mockReset();
        renderFooter();
        const notHelpful = screen.getAllByRole("button", { name: "Not helpful" }).at(-1)!;
        await userEvent.click(notHelpful);
        const chips = screen.getAllByRole("button", { name: label("incorrect") });
        await userEvent.click(chips.at(-1)!);
        await userEvent.type(screen.getAllByRole("textbox").at(-1)!, "    ");
        await userEvent.click(screen.getAllByRole("button", { name: "Save" }).at(-1)!);
        expect(onSubmit.mock.calls[0]![0].comment).toBeNull();
    });

    it("never offers the positive reason as an explanation for an unhelpful rating", async () => {
        renderFooter();
        await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
        expect(
            screen.queryByRole("button", {
                name: FEEDBACK_REASON_LABELS[POSITIVE_FEEDBACK_REASON],
            }),
        ).toBeNull();
    });

    it("Cancel abandons the selection without submitting anything", async () => {
        renderFooter();
        await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
        await userEvent.click(screen.getByRole("button", { name: label("incorrect") }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    });
});

describe("FeedbackFooter committed and in-flight states", () => {
    beforeEach(() => onSubmit.mockReset());

    it("reports a settled rating and stops accepting another", async () => {
        renderFooter("helpful");
        expect(screen.getByRole("status")).toHaveTextContent("Feedback saved.");
        expect(screen.getByRole("button", { name: "Helpful" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Not helpful" })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "Helpful" }));
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("surfaces a save failure as an alert", () => {
        render(
            <FeedbackFooter
                error="Feedback could not be saved."
                onSubmit={onSubmit}
                state={null}
            />,
        );
        expect(screen.getByRole("alert")).toHaveTextContent("Feedback could not be saved.");
    });
});
