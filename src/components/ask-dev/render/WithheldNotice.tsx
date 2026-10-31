import type { WithheldReason } from "@/lib/ask-dev/render/withheld-log";

/**
 * One notice for the charts its owner withheld (CHAOS-11942, E8 design §4.4): counts and a plain
 * class per closed reason, never a label, value or id. Static text, no live region. The caller
 * passes only the occurrences it owns (`noticeOwnerFor`), so no occurrence is counted twice.
 */
type NoticeClass = "unchecked" | "unsupported" | "unplaced" | "not_drawn" | "unaccounted";

const CLASS_OF: Partial<Record<WithheldReason, NoticeClass>> = {
    kind_not_drawable: "unsupported",
    presentation_missing: "unsupported",
    time_axis_requires_line: "unsupported",
    presentation_not_rendered: "unsupported",
    multi_claim_trend: "unplaced",
    placement_missing: "unplaced",
    render_error: "not_drawn",
    render_timeout: "not_drawn",
    render_accounting_violated: "unaccounted",
};

/** Every other closed reason is a verification or web-guard refusal. */
export const noticeClass = (reason: WithheldReason): NoticeClass => CLASS_OF[reason] ?? "unchecked";

const ORDER: readonly NoticeClass[] = [
    "unchecked",
    "unsupported",
    "unplaced",
    "not_drawn",
    "unaccounted",
];

const WORDS: Record<NoticeClass, { readonly one: string; readonly many: string }> = {
    unchecked: {
        one: "it could not be checked against the facts it cites in this answer",
        many: "they could not be checked against the facts they cite in this answer",
    },
    unsupported: {
        one: "it is a kind of chart this view does not draw",
        many: "they are kinds of chart this view does not draw",
    },
    unplaced: {
        one: "it does not belong to one fact table of this answer",
        many: "they do not belong to one fact table of this answer",
    },
    not_drawn: { one: "it could not be drawn", many: "they could not be drawn" },
    unaccounted: {
        one: "the charts of this answer could not be accounted for",
        many: "the charts of this answer could not be accounted for",
    },
};

export function withheldSentences(reasons: readonly WithheldReason[]): string[] {
    const counts = new Map<NoticeClass, number>();
    for (const reason of reasons) {
        const kind = noticeClass(reason);
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return ORDER.flatMap((kind) => {
        const count = counts.get(kind) ?? 0;
        if (count === 0) return [];
        return count === 1
            ? [`A chart was withheld: ${WORDS[kind].one}.`]
            : [`${count} charts were withheld: ${WORDS[kind].many}.`];
    });
}

export function WithheldNotice({
    reasons,
    testId = "ask-dev-withheld-notice",
}: {
    readonly reasons: readonly WithheldReason[];
    readonly testId?: string;
}) {
    if (reasons.length === 0) return null;
    return (
        <div className="space-y-1" data-testid={testId} data-count={reasons.length}>
            {withheldSentences(reasons).map((sentence) => (
                <p key={sentence} className="text-xs text-(--ink-muted)">
                    {sentence}
                </p>
            ))}
        </div>
    );
}
