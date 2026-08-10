"use client";

import { formatTimestamp } from "@/lib/formatters";

/**
 * The answer's identity row and its primary content.
 *
 * Returns a Fragment, not a wrapper element: the two blocks are direct
 * children of the answer `article`, whose `space-y-5` supplies the rhythm
 * between every top-level section. Wrapping them would collapse that gap into
 * one slot and silently re-space the whole answer.
 *
 * `summary` and `statusExplanation` arrive already resolved by the container —
 * the withhold-vs-render decision for a self-contradictory row belongs in one
 * place beside the predicates that diagnose it, not duplicated per section.
 *
 * The direct answer is the primary content (TRD §16: scope → question →
 * answer → evidence/metrics → follow-up; CHAOS-3291). Previously the status
 * caption rendered as an isolated text-xs line and direct_summary as plain
 * text-body — same visual weight as the supporting chrome below it, so a thin
 * answer (e.g. "Status: partial.") read as smaller and less important than
 * the Evidence block. Keeping the caption tightly coupled to the summary (one
 * block, no separating chrome) and giving the summary the same display-font
 * treatment used for section headings elsewhere makes it read as one coherent
 * answer rather than badge + boilerplate + terse line.
 */
export function AnswerHeaderSection({
    asOf,
    statusExplanation,
    statusLabel,
    summary,
}: {
    asOf: string;
    statusExplanation: string | undefined;
    statusLabel: string;
    summary: string;
}) {
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-(--radius-pill) bg-(--accent-ai)/12 px-2.5 py-1 text-label-caps text-(--accent-ai)">
                    AI-generated
                </span>
                <span className="rounded-(--radius-pill) border border-(--border) px-2.5 py-1 text-label-caps text-(--text-muted)">
                    {statusLabel}
                </span>
                <span className="text-xs text-(--text-muted)">As of {formatTimestamp(asOf)}</span>
            </div>

            <div className="space-y-1.5">
                {statusExplanation ? (
                    <p className="text-sm leading-6 text-(--text-secondary)">{statusExplanation}</p>
                ) : null}
                <p className="font-(--font-display) text-h3 text-(--text-primary)">{summary}</p>
            </div>
        </>
    );
}
