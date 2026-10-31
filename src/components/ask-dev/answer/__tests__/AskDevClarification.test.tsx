import { describe, expect, it, vi } from "vitest";
// No canvas in jsdom: the Ask Dev charts draw through a stub that keeps ECharts' event order (CHAOS-11942).
vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../../render/__tests__/echartsStub")).echartsStubModule,
);
import { render, screen, userEvent, within } from "@/test/utils";

import { AskDevClarification } from "../AskDevClarification";
import { AskDevTurn, type TranscriptResult } from "../AskDevTurn";
import {
    CLARIFICATION_COPY,
    FAMILY_ORDER,
    RECEIPT_FIELD,
    buildChoice,
    familiesOf,
    offersOf,
    type TurnResult,
} from "../clarificationModel";
import blockedNow from "./captures/kiac_blocked_now_window_clarification.event.json";
import workItemHandle from "./captures/kiac_work_item_handle_clarification.event.json";
import kindAndCandidate from "./captures/kiac_kind_and_candidate_clarification.event.json";
import kindCandidateHandle from "./captures/kiac_kind_candidate_handle_clarification.event.json";
import teamCandidateNoMatch from "./captures/kiac_team_candidate_no_match.event.json";
import unresolvedNoMatch from "./captures/kiac_unresolved_structure_no_match.event.json";
import projectStatusPartial from "./captures/kiac_project_status_partial.event.json";
import anchorV1 from "./captures/acr_encoder_anchor_v1_clarification.event.json";
import anchorV2 from "./captures/acr_encoder_anchor_v2_clarification.event.json";

/**
 * CHAOS-3440. Every result is a real ACR answer: captured from the kiac stack, or, for the anchor
 * offers kiac never produced, the frame acr's own engine and route wrote at the pinned commit
 * (`captures/index.json`, `encoder_captures`). None is edited.
 */
const asTurn = (event: { result: unknown }) => event.result as TurnResult;
const window_ = asTurn(blockedNow);
const handle = asTurn(workItemHandle);
const kindCandidate = asTurn(kindAndCandidate);
const kindCandidateHandles = asTurn(kindCandidateHandle);
const candidateNoMatch = asTurn(teamCandidateNoMatch);
const bareNoMatch = asTurn(unresolvedNoMatch);

const familyBlocks = () => screen.getAllByTestId("ask-dev-clarification-family");
const chipsIn = (block: HTMLElement) =>
    within(block).queryAllByTestId("ask-dev-clarification-chip");

describe("the captured clarifications carry what each test needs", () => {
    it("has window, handle, kind and candidate offers, and two no-matches", () => {
        expect(offersOf(window_).window.length).toBeGreaterThan(1);
        expect(offersOf(handle).subject_handle).toHaveLength(1);
        expect(offersOf(kindCandidate).expected_kind.length).toBeGreaterThan(0);
        expect(offersOf(kindCandidate).subject_candidate.length).toBeGreaterThan(0);
        expect(offersOf(kindCandidateHandles).subject_handle.length).toBeGreaterThan(5);
        expect(candidateNoMatch.status).toBe("no_match");
        expect(offersOf(candidateNoMatch).subject_candidate.length).toBeGreaterThan(0);
        expect(bareNoMatch.status).toBe("no_match");
        expect(Object.values(offersOf(bareNoMatch)).flat()).toEqual([]);
    });
});

describe("AskDevClarification: what the turn offers, as served", () => {
    it("shows the service sentence, its prompt and the answer's status first", () => {
        render(<AskDevClarification result={window_} onConfirm={vi.fn()} />);
        expect(screen.getByTestId("ask-dev-answer-status")).toHaveTextContent(
            "Answer needs your confirmation",
        );
        expect(screen.getByTestId("ask-dev-answer-lead")).toHaveTextContent(
            window_.deterministic_answer.trim(),
        );
        expect(screen.getByTestId("ask-dev-clarification-prompt")).toHaveTextContent(
            window_.subject_resolution.clarification_prompt as string,
        );
    });

    it("does not repeat a prompt the service sentence already holds", () => {
        const prompt = kindCandidate.subject_resolution.clarification_prompt as string;
        expect(kindCandidate.deterministic_answer).toContain(prompt);
        render(<AskDevClarification result={kindCandidate} onConfirm={vi.fn()} />);
        expect(screen.queryByTestId("ask-dev-clarification-prompt")).toBeNull();
        expect(screen.getByTestId("ask-dev-answer-lead")).toHaveTextContent(prompt);
    });

    it("lists each window once, in the served order, even when the result repeats a receipt", () => {
        render(<AskDevClarification result={window_} onConfirm={vi.fn()} />);
        const [block] = familyBlocks();
        expect(block).toHaveAttribute("data-family", "window");
        const served = offersOf(window_).window.map((o) => o.label);
        expect(chipsIn(block as HTMLElement).map((c) => c.textContent)).toEqual(served);
        const receipts = offersOf(window_).window.map((o) => o.receiptId);
        expect(new Set(receipts).size).toBe(receipts.length);
    });

    it("keeps ACR's order of the missing parts and says when a part has no offers", () => {
        render(<AskDevClarification result={kindCandidate} onConfirm={vi.fn()} />);
        const families = familyBlocks().map((b) => b.getAttribute("data-family"));
        expect(families).toEqual(familiesOf(kindCandidate));
        expect(families).toEqual(FAMILY_ORDER.filter((f) => families.includes(f)));
        const handleBlock = familyBlocks().find(
            (b) => b.getAttribute("data-family") === "subject_handle",
        ) as HTMLElement;
        expect(handleBlock).toHaveTextContent(CLARIFICATION_COPY.noOffers);
    });

    it("shows a bare no-match without any choice or Ask again control", () => {
        render(<AskDevClarification result={bareNoMatch} onConfirm={vi.fn()} />);
        expect(screen.getByTestId("ask-dev-answer-status")).toHaveTextContent(
            "No answer: no matching subject",
        );
        expect(screen.queryAllByTestId("ask-dev-clarification-chip")).toEqual([]);
        expect(screen.queryByTestId("ask-dev-clarification-ask-again")).toBeNull();
    });
});

describe("AskDevClarification: a choice sends only this result's receipts (INV-1)", () => {
    it("sends one window receipt bound to this result, once", async () => {
        const onConfirm = vi.fn();
        const user = userEvent.setup();
        render(<AskDevClarification result={window_} onConfirm={onConfirm} />);
        const askAgain = screen.getByTestId("ask-dev-clarification-ask-again");
        expect(askAgain).toBeDisabled();

        const chip = screen.getAllByTestId("ask-dev-clarification-chip")[1] as HTMLElement;
        await user.click(chip);
        expect(chip).toHaveAttribute("aria-pressed", "true");
        await user.click(askAgain);

        const offer = offersOf(window_).window[1]!;
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledWith({
            parentResultId: window_.result_id,
            receipts: {
                prior_window_receipts: [
                    { result_id: window_.result_id, receipt_id: offer.receiptId },
                ],
            },
        });
        // Sent once: the turn is no longer live.
        expect(askAgain).toHaveTextContent(CLARIFICATION_COPY.asked);
        expect(askAgain).toBeDisabled();
        await user.click(askAgain);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("sends one receipt per chosen part, each in its own namespace", async () => {
        const onConfirm = vi.fn();
        const user = userEvent.setup();
        render(<AskDevClarification result={kindCandidateHandles} onConfirm={onConfirm} />);
        const blocks = familyBlocks();
        const pick = async (family: string) => {
            const block = blocks.find((b) => b.getAttribute("data-family") === family)!;
            await user.click(chipsIn(block)[0] as HTMLElement);
        };
        await pick("expected_kind");
        await pick("subject_handle");
        await pick("subject_candidate");
        await user.click(screen.getByTestId("ask-dev-clarification-ask-again"));

        const offers = offersOf(kindCandidateHandles);
        const bound = (receipt: string) => [
            { result_id: kindCandidateHandles.result_id, receipt_id: receipt },
        ];
        expect(onConfirm).toHaveBeenCalledWith({
            parentResultId: kindCandidateHandles.result_id,
            receipts: {
                [RECEIPT_FIELD.expected_kind]: bound(offers.expected_kind[0]!.receiptId),
                [RECEIPT_FIELD.subject_handle]: bound(offers.subject_handle[0]!.receiptId),
                [RECEIPT_FIELD.subject_candidate]: bound(offers.subject_candidate[0]!.receiptId),
            },
        });
    });

    it("lets a pick be undone before sending", async () => {
        const onConfirm = vi.fn();
        const user = userEvent.setup();
        render(<AskDevClarification result={handle} onConfirm={onConfirm} />);
        const chip = screen.getByTestId("ask-dev-clarification-chip");
        await user.click(chip);
        await user.click(chip);
        expect(chip).toHaveAttribute("aria-pressed", "false");
        expect(screen.getByTestId("ask-dev-clarification-ask-again")).toBeDisabled();
    });

    it("refuses to build a choice from another result's receipt", () => {
        const foreign = offersOf(window_).window[0]!.receiptId;
        expect(() => buildChoice(kindCandidate, { window: foreign })).toThrow(/not an offer/u);
        const otherKind = offersOf(kindCandidateHandles).expected_kind[0]!.receiptId;
        expect(offersOf(kindCandidate).expected_kind.map((o) => o.receiptId)).not.toContain(
            otherKind,
        );
        expect(() => buildChoice(kindCandidate, { expected_kind: otherKind })).toThrow(
            /not an offer/u,
        );
    });

    it("offers candidates on a no-match turn, bound to that turn", async () => {
        const onConfirm = vi.fn();
        const user = userEvent.setup();
        render(<AskDevClarification result={candidateNoMatch} onConfirm={onConfirm} />);
        await user.click(screen.getAllByTestId("ask-dev-clarification-chip")[0] as HTMLElement);
        await user.click(screen.getByTestId("ask-dev-clarification-ask-again"));
        expect(onConfirm.mock.calls[0]![0].receipts.prior_candidate_receipts[0].result_id).toBe(
            candidateNoMatch.result_id,
        );
    });
});

describe("AskDevClarification: anchor offers (v1 and v2)", () => {
    // acr encoder captures: v1 = unique-claimant offers, v2 = membership-verify offers (the
    // result's schema_version says which). Both have the same wire shape and render the same way.
    it.each([
        ["v1", asTurn(anchorV1), "context_fabric_investigation_result.v1"],
        ["v2", asTurn(anchorV2), "context_fabric_investigation_result.v2"],
    ] as const)(
        "renders %s anchor offers as chips and sends ancr receipts",
        async (_v, result, schema) => {
            expect((result as unknown as { schema_version: string }).schema_version).toBe(schema);
            const anchors = offersOf(result).subject_anchor;
            expect(anchors.length).toBe(2);
            const onConfirm = vi.fn();
            const user = userEvent.setup();
            render(<AskDevClarification result={result} onConfirm={onConfirm} />);
            const block = familyBlocks().find(
                (b) => b.getAttribute("data-family") === "subject_anchor",
            )!;
            expect(chipsIn(block).map((chip) => chip.textContent)).toEqual(
                anchors.map((a) => a.label),
            );
            await user.click(chipsIn(block)[1] as HTMLElement);
            await user.click(screen.getByTestId("ask-dev-clarification-ask-again"));
            expect(onConfirm).toHaveBeenCalledWith({
                parentResultId: result.result_id,
                receipts: {
                    prior_anchor_receipts: [
                        { result_id: result.result_id, receipt_id: anchors[1]!.receiptId },
                    ],
                },
            });
            expect(anchors[1]!.receiptId).toMatch(/^ancr_/u);
        },
    );

    it("shows the anchor part before the window part (the fixed part order)", () => {
        const result = asTurn(anchorV1);
        render(<AskDevClarification result={result} onConfirm={vi.fn()} />);
        expect(familyBlocks().map((b) => b.getAttribute("data-family"))).toEqual([
            "subject_anchor",
            "window",
        ]);
    });
});

describe("read-only prior turns", () => {
    it("lists a prior turn's offers with no control at all", () => {
        render(<AskDevClarification result={kindCandidateHandles} />);
        expect(screen.queryAllByRole("button")).toEqual([]);
        expect(screen.getByTestId("ask-dev-clarification-prior")).toHaveTextContent(
            CLARIFICATION_COPY.priorTurnNote,
        );
        const offered = screen.getAllByTestId("ask-dev-clarification-offered");
        expect(offered[0]).toHaveTextContent(
            offersOf(kindCandidateHandles).expected_kind[0]!.label,
        );
    });

    it("renders an answered turn with the answer view and a non-answer with this view", () => {
        const answered = projectStatusPartial.result as unknown as TranscriptResult;
        const { unmount } = render(<AskDevTurn turn={answered} />);
        expect(screen.getByTestId("ask-dev-answer")).toBeInTheDocument();
        expect(screen.queryByTestId("ask-dev-clarification")).toBeNull();
        unmount();
        render(<AskDevTurn turn={window_ as unknown as TranscriptResult} onConfirm={vi.fn()} />);
        expect(screen.getByTestId("ask-dev-clarification")).toHaveAttribute("data-live", "true");
        expect(screen.getByTestId("ask-dev-turn")).toHaveTextContent(window_.question);
    });
});
