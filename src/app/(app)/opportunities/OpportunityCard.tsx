import Link from "next/link";

import { buildExploreUrl } from "@/lib/filters/url";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import type { OpportunityCard as OpportunityCardData } from "@/lib/types";

type OpportunityCardProps = {
    card: OpportunityCardData;
    filters: MetricFilter;
    activeRole?: string;
};

export function OpportunityCard({ card, filters, activeRole }: OpportunityCardProps) {
    const hasArtifacts = card.evidence_links.length > 0;

    return (
        <div className="rounded-3xl border border-(--border) bg-(--card-80) p-6">
            <h2 className="font-(--font-display) text-xl">{card.title}</h2>
            <p className="mt-2 text-sm text-(--ink-muted)">{card.rationale}</p>

            <div className="mt-4" data-testid="opportunity-card-evidence">
                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                    {CTA_LABELS.evidence}
                </p>
                {hasArtifacts ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {card.evidence_links.map((link) => (
                            <Link
                                key={link}
                                href={buildExploreUrl({ api: link, filters, role: activeRole })}
                                className="rounded-full border border-(--border) bg-(--card) px-3 py-1"
                            >
                                Open artifact ↗
                            </Link>
                        ))}
                    </div>
                ) : (
                    <p
                        aria-disabled="true"
                        className="mt-2 inline-block rounded-full border border-dashed border-(--border) bg-(--card-70) px-3 py-1 text-xs text-(--ink-muted)"
                    >
                        No linked artifacts in this window
                    </p>
                )}
            </div>

            {card.suggested_experiments.length > 0 && (
                <div className="mt-4" data-testid="opportunity-card-next-step">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Recommended next step
                    </p>
                    <div className="mt-2 space-y-2 text-xs text-(--ink-muted)">
                        {card.suggested_experiments.map((experiment) => (
                            <div
                                key={experiment}
                                className="rounded-2xl border border-dashed border-(--border) bg-(--card-70) px-3 py-2"
                            >
                                {experiment}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
