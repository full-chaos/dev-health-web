import type {
    ACRContextFabricInvestigationResponseV1,
    ACRContextFabricInvestigationResponseV2,
    ACRContextFabricInvestigationResultV1,
} from "@/lib/acr/generated";
import { nonBlank } from "@/lib/ask-dev/conversation";

/**
 * Clarification and non-answer turns (CHAOS-11930's successor, CHAOS-3440): what the turn offers,
 * and the one way a choice becomes the next request's receipts.
 */
type TurnFields =
    | "result_id"
    | "status"
    | "question"
    | "deterministic_answer"
    | "structure_needs"
    | "window_clarification"
    | "subject_resolution"
    | "versions";

export type TurnResult =
    | Pick<ACRContextFabricInvestigationResultV1, TurnFields>
    | Pick<ACRContextFabricInvestigationResponseV1, TurnFields>
    | Pick<ACRContextFabricInvestigationResponseV2, TurnFields>;

/** The intent-frame members ACR can name as missing (`StructureNeedKind`, closed). */
export type OfferFamily =
    "expected_kind" | "subject_anchor" | "subject_handle" | "window" | "subject_candidate";

/** ACR's own elicitation order (kind, anchor, handle, window), then candidates. */
export const FAMILY_ORDER: readonly OfferFamily[] = [
    "expected_kind",
    "subject_anchor",
    "subject_handle",
    "window",
    "subject_candidate",
];

/** The request field that carries a confirmed offer of each family (receipt namespaces). */
export const RECEIPT_FIELD = {
    expected_kind: "prior_kind_receipts",
    subject_anchor: "prior_anchor_receipts",
    subject_handle: "prior_handle_receipts",
    window: "prior_window_receipts",
    subject_candidate: "prior_candidate_receipts",
} as const satisfies Record<OfferFamily, string>;

export type ReceiptField = (typeof RECEIPT_FIELD)[OfferFamily];

export type Offer = {
    readonly family: OfferFamily;
    readonly optionId: string;
    readonly receiptId: string;
    /** The structural label ACR bound to the receipt; the chip shows it as served. */
    readonly label: string;
};

type RawOption = { option_id: string; receipt_id: string; label: string };

function toOffers(family: OfferFamily, options: readonly RawOption[] | undefined): Offer[] {
    return (options ?? []).map((option) => ({
        family,
        optionId: option.option_id,
        receiptId: option.receipt_id,
        label: option.label,
    }));
}

/**
 * The offers of one turn, per family, in the result's own order. Nothing is minted, re-ranked or
 * filtered. Anchor offers have the same wire shape in a v1 result (unique claimant) and a v2
 * result (membership verify), so both render the same way. A v1 result that carries only
 * `window_clarification` offers those windows; window offers that repeat a receipt appear once.
 */
export function offersOf(result: TurnResult): Record<OfferFamily, Offer[]> {
    const needs = result.structure_needs;
    const windows = toOffers("window", [
        ...((needs?.window_options as readonly RawOption[] | undefined) ?? []),
        ...((needs?.window_expand_options as readonly RawOption[] | undefined) ?? []),
        ...((result.window_clarification?.options as readonly RawOption[] | undefined) ?? []),
    ]);
    const seen = new Set<string>();
    const uniqueWindows = windows.filter((offer) => {
        if (seen.has(offer.receiptId)) return false;
        seen.add(offer.receiptId);
        return true;
    });
    return {
        expected_kind: toOffers("expected_kind", needs?.kind_options as RawOption[] | undefined),
        subject_anchor: toOffers(
            "subject_anchor",
            needs?.anchor_options as RawOption[] | undefined,
        ),
        subject_handle: toOffers(
            "subject_handle",
            needs?.handle_options as RawOption[] | undefined,
        ),
        window: uniqueWindows,
        subject_candidate: toOffers(
            "subject_candidate",
            needs?.candidate_options as RawOption[] | undefined,
        ),
    };
}

/** The families this turn names as missing, in order, plus any family that carries offers. */
export function familiesOf(result: TurnResult): OfferFamily[] {
    const offers = offersOf(result);
    const missing = new Set<string>(result.structure_needs?.missing ?? []);
    return FAMILY_ORDER.filter((family) => missing.has(family) || offers[family].length > 0);
}

/** The next request's carry: the parent result and one receipt per chosen family. */
export type ClarificationChoice = {
    readonly parentResultId: string;
    readonly receipts: Partial<
        Record<ReceiptField, readonly { result_id: string; receipt_id: string }[]>
    >;
};

/**
 * INV-1: a choice carries only receipts this very result offered, each bound to this result's own
 * id. A pick that is not one of the turn's offers (another result's receipt, a stale offer, a
 * family the turn does not carry) is refused with an error, never sent.
 */
export function buildChoice(
    result: TurnResult,
    picks: Partial<Record<OfferFamily, string>>,
): ClarificationChoice {
    const offers = offersOf(result);
    const receipts: Partial<Record<ReceiptField, { result_id: string; receipt_id: string }[]>> = {};
    for (const family of FAMILY_ORDER) {
        const receiptId = picks[family];
        if (receiptId === undefined) continue;
        if (!offers[family].some((offer) => offer.receiptId === receiptId)) {
            throw new Error(`receipt is not an offer of this result (${family})`);
        }
        receipts[RECEIPT_FIELD[family]] = [{ result_id: result.result_id, receipt_id: receiptId }];
    }
    return { parentResultId: result.result_id, receipts };
}

export function isNonAnswer(status: string): boolean {
    return status === "clarification_required" || status === "no_match";
}

/** The service's prompt for this turn, when it sent one. */
export function clarificationPrompt(result: TurnResult): string | null {
    return nonBlank(result.subject_resolution?.clarification_prompt) ?? null;
}

/** Words this view writes (CHAOS-3440). The served labels and prompts are shown as served. */
export const CLARIFICATION_COPY = {
    familyTitle: {
        expected_kind: "Which kind of thing did you mean?",
        subject_anchor: "Which one did you mean?",
        subject_handle: "Which item did you mean?",
        window: "Which time period should the answer read?",
        subject_candidate: "Did you mean one of these?",
    } satisfies Record<OfferFamily, string>,
    noOffers: "No choices offered for this.",
    askAgain: "Ask again with these choices",
    asked: "Asked again with these choices",
    chooseFirst: "Choose at least one option to ask again.",
    offered: "Offered",
    youAsked: "You asked",
    priorTurnNote: "An earlier turn: its choices can no longer be sent.",
} as const;
