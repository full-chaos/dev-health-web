import type { ACRErrorV1 } from "@/lib/acr/generated";

/**
 * A budget refusal turn (CHAOS-3440): ACR measured the answer, it did not fit the response budget,
 * and the stream ended with an `error` event (error.v1, code `budget_refusal`, HTTP 413). The
 * engine names the dimension a narrower question could reduce as a closed token
 * (`details.narrower_continuation.axis`), never as a sentence; this view writes the words.
 */
export type RefusalEvent = {
    readonly type: "error";
    /** The result id ACR minted at admission: the refusal's own identity in the transcript. */
    readonly reserved_result_id: string;
    readonly error: ACRErrorV1;
};

/** A refusal turn: the question this browser sent, then the error event ACR answered with. */
export type RefusalTurn = {
    readonly question: string;
    readonly refusal: RefusalEvent;
};

/** ACR's closed narrowing axes (`NarrowingContinuationAxis`, without `none`, which is never sent). */
export type NarrowingAxis =
    "evidence_window" | "result_count" | "scope_anchor" | "group_selection" | "comparison_pair";

const AXES: ReadonlySet<string> = new Set<NarrowingAxis>([
    "evidence_window",
    "result_count",
    "scope_anchor",
    "group_selection",
    "comparison_pair",
]);

/** The one way a refusal is re-asked: the question goes back to the composer with the axis. */
export type NarrowerReask = {
    readonly question: string;
    readonly axis: NarrowingAxis;
};

export function isBudgetRefusal(event: RefusalEvent): boolean {
    return event.error.error.code === "budget_refusal";
}

type Details = NonNullable<ACRErrorV1["error"]["details"]>;

const detailsOf = (event: RefusalEvent): Details => event.error.error.details ?? {};

/**
 * The axis ACR named, or `null`. ACR omits the continuation when it can name none; a value outside
 * the closed vocabulary is read as absent, never shown.
 */
export function narrowingAxis(event: RefusalEvent): NarrowingAxis | null {
    const continuation = detailsOf(event).narrower_continuation;
    if (!continuation || typeof continuation !== "object") return null;
    const axis = (continuation as Record<string, unknown>).axis;
    return typeof axis === "string" && AXES.has(axis) ? (axis as NarrowingAxis) : null;
}

const count = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const kilobytes = (bytes: number): string =>
    `${Math.ceil(bytes / 1024).toLocaleString("en-US")} KB`;

/**
 * What did not fit, as measured, in this view's words: items or size against the limit. `null`
 * when ACR sent no overrun it names or no numbers for it.
 */
export function overrunSentence(event: RefusalEvent): string | null {
    const details = detailsOf(event);
    if (details.overrun === "items") {
        const measured = count(details.measured_items);
        const max = count(details.max_items);
        if (measured === null || max === null) return null;
        return REFUSAL_COPY.overrunItems(measured, max);
    }
    if (details.overrun === "bytes") {
        const measured = count(details.measured_bytes);
        const max = count(details.max_serialized_bytes);
        if (measured === null || max === null) return null;
        return REFUSAL_COPY.overrunBytes(kilobytes(measured), kilobytes(max));
    }
    return null;
}

/** True when ACR says nothing was left to cut from this answer. */
export function nothingLeftToCut(event: RefusalEvent): boolean {
    return detailsOf(event).nothing_left_to_cut === true;
}

/** Words this view writes (CHAOS-3440). ACR sends tokens and numbers only. */
export const REFUSAL_COPY = {
    status: "No answer: too large to send",
    lead: "The answer to this question was too large to send.",
    overrunItems: (measured: number, max: number) =>
        `It held ${measured.toLocaleString("en-US")} items; an answer can hold ${max.toLocaleString("en-US")}.`,
    overrunBytes: (measured: string, max: string) => `It was ${measured}; an answer can be ${max}.`,
    nothingLeftToCut: "Nothing more could be cut from it.",
    sameAgain: "Asking the same question again gives the same result.",
    axis: {
        evidence_window: "Ask about a shorter time period.",
        result_count: "Ask for fewer results, for example the top 10.",
        scope_anchor: "Ask about a narrower scope, for example one project or one repository.",
        group_selection: "Ask about fewer groups.",
        comparison_pair: "Compare fewer subjects at a time.",
    } satisfies Record<NarrowingAxis, string>,
    noAxis: "No narrower form of this question can be suggested.",
    reask: "Ask a narrower question",
    reasked: "Question back in the composer",
    priorTurnNote: "An earlier turn: it can no longer be re-asked from here.",
} as const;
