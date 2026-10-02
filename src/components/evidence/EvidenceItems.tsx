"use client";

import Link from "next/link";

export type EvidenceItem = {
    id: string;
    /** The served name of the row: a contributor, an artifact title, a served sentence. */
    title: string;
    /** The served link of the row. "#" or empty: the row is not a link. */
    url: string;
    type: "pr" | "issue" | "commit" | "other";
    /** A served line about the row, shown under its name. */
    meta?: string;
    /** The served value of the row, shown at the right (for example "1.2 hours"). */
    value?: string;
    /** A served figure beside the value (for example the change). */
    valueNote?: string;
};

type EvidenceItemsProps = {
    items: EvidenceItem[];
};

/** Title of the supporting section. The API does not serve the kind of a row, so no kind is named. */
export const EVIDENCE_SUPPORTING_TITLE = "Supporting evidence";

const TYPE_LABEL: Record<Exclude<EvidenceItem["type"], "other">, string> = {
    pr: "Pull request",
    issue: "Issue",
    commit: "Commit",
};

/**
 * The supporting rows of the evidence drawer (approved prototype `openEvidence`, `app.js:122`:
 * one plain section of fact rows, name left and value right).
 *
 * Every text is served: the name, the value, the line under the name. A row whose API link was
 * served is a link to it. The count of rows is the "Artifacts" fact row of the drawer.
 */
export function EvidenceItems({ items }: EvidenceItemsProps) {
    if (!items || items.length === 0) return null;

    return (
        <section
            data-testid="evidence-supporting"
            aria-labelledby="evidence-supporting-title"
            className="rounded-(--radius-md) border border-(--card-stroke) p-4"
        >
            <h4 id="evidence-supporting-title" className="text-sm font-semibold text-foreground">
                {EVIDENCE_SUPPORTING_TITLE}
            </h4>
            <ul className="mt-2 text-xs">
                {items.map((item) => {
                    const linked = Boolean(item.url) && item.url !== "#";
                    const kind = item.type === "other" ? null : TYPE_LABEL[item.type];
                    const under = [kind, item.meta].filter(Boolean).join(" · ");
                    return (
                        <li
                            key={item.id}
                            data-testid="evidence-supporting-row"
                            className="flex items-start gap-x-3 border-b border-(--card-stroke) py-2.5 last:border-b-0"
                        >
                            <div className="min-w-0">
                                {linked ? (
                                    <Link
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-foreground underline-offset-4 hover:text-(--accent-2) hover:underline"
                                    >
                                        {item.title}
                                    </Link>
                                ) : (
                                    <span className="text-foreground">{item.title}</span>
                                )}
                                {under ? (
                                    <p className="mt-0.5 text-(--ink-muted)">{under}</p>
                                ) : null}
                            </div>
                            {item.value ? (
                                <span className="ml-auto shrink-0 whitespace-nowrap text-right tabular-nums">
                                    <span className="font-semibold text-foreground">
                                        {item.value}
                                    </span>
                                    {item.valueNote ? (
                                        <span className="text-(--ink-muted)">
                                            {" "}
                                            {item.valueNote}
                                        </span>
                                    ) : null}
                                </span>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
