"use client";

import Link from "next/link";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { Notice } from "@/components/ui/Notice";
import { CTA_LABELS } from "@/lib/design/cta";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import { getMetricLabel, getMetricPolarity } from "@/lib/metrics/catalog";
import type { OpportunityCard as OpportunityCardData } from "@/lib/types";

type OpportunityCardProps = {
    card: OpportunityCardData;
    filters: MetricFilter;
    activeRole?: string;
};

/** The metric an evidence link explains (`/api/v1/explain?metric=<id>`), or undefined. */
export const metricFromEvidenceLink = (link: string | undefined): string | undefined => {
    if (!link) return undefined;
    try {
        const url = new URL(link, "http://local");
        return url.pathname.endsWith("/explain")
            ? (url.searchParams.get("metric") ?? undefined)
            : undefined;
    } catch {
        return undefined;
    }
};

/** The selected opportunity: rationale, next steps and the evidence drawer. */
export function OpportunityCard({ card, filters, activeRole }: OpportunityCardProps) {
    const evidence = useEvidenceDrawer();
    const [first, ...more] = card.evidence_links;
    const metric = metricFromEvidenceLink(first);
    // The backend words every title "Reduce <metric>", also where a rise is good (open point).
    const backwards = metric !== undefined && getMetricPolarity(metric) === "higherIsBetter";

    return (
        <div
            className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6"
            data-testid="opportunity-detail"
        >
            <h2 className="font-(--font-display) text-xl">{card.title}</h2>

            {backwards ? (
                <Notice
                    variant="warn"
                    live={false}
                    className="mt-3"
                    data-testid="opportunity-direction-note"
                >
                    The source suggests reducing {getMetricLabel(metric)}. For this metric a rise is
                    usually good; read the evidence before acting.
                </Notice>
            ) : null}

            <div className="mt-4" data-testid="opportunity-captured-change">
                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                    Captured change
                </p>
                <p className="mt-2 text-sm text-(--ink-muted)">{card.rationale}</p>
            </div>

            {card.suggested_experiments.length > 0 && (
                <div className="mt-4" data-testid="opportunity-card-next-step">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Suggested next steps
                    </p>
                    <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-(--ink-muted)">
                        {card.suggested_experiments.map((experiment) => (
                            <li key={experiment}>{experiment}</li>
                        ))}
                    </ol>
                </div>
            )}

            <div className="mt-5" data-testid="opportunity-card-evidence">
                <div className="flex flex-wrap items-center gap-3">
                    {first ? (
                        <button
                            type="button"
                            onClick={() =>
                                evidence.open({ title: card.title, apiUrl: first, filters })
                            }
                            className="rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-(--accent-foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/60"
                        >
                            {CTA_LABELS.viewMetricEvidence}
                        </button>
                    ) : (
                        <p
                            aria-disabled="true"
                            className="inline-block rounded-full border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-1 text-xs text-(--ink-muted)"
                        >
                            No linked artifacts in this window
                        </p>
                    )}
                    <Link
                        href={withFilterParam("/improve/experiments", filters, activeRole)}
                        className="rounded-xl border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--accent-2) hover:bg-(--card-70)"
                    >
                        {CTA_LABELS.exploreExperiments}
                    </Link>
                </div>
                {more.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                            More evidence
                        </span>
                        {more.map((link) => (
                            <Link
                                key={link}
                                href={buildExploreUrl({ api: link, filters, role: activeRole })}
                                className="rounded-full border border-(--card-stroke) bg-(--card) px-3 py-1 text-(--accent-2)"
                            >
                                Open artifact ↗
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
