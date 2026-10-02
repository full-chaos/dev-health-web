"use client";

import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { Inset } from "@/components/capacity/Inset";
import { Button, buttonClassName } from "@/components/shared/Button";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
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
        <Section title={card.title} data-testid="opportunity-detail">
            {backwards ? (
                <Notice
                    variant="warn"
                    live={false}
                    className="mb-4"
                    data-testid="opportunity-direction-note"
                >
                    The source suggests reducing {getMetricLabel(metric)}. For this metric a rise is
                    usually good; read the evidence before acting.
                </Notice>
            ) : null}

            <div data-testid="opportunity-captured-change">
                <p className="text-label-caps uppercase text-(--ink-muted)">Captured change</p>
                <p className="mt-2 text-sm text-(--ink-muted)">{card.rationale}</p>
            </div>

            {card.suggested_experiments.length > 0 && (
                <Inset title="Suggested next steps" data-testid="opportunity-card-next-step">
                    <ol className="mt-1 space-y-2">
                        {card.suggested_experiments.map((experiment, index) => (
                            <li key={experiment} className="flex items-start gap-3">
                                <span
                                    aria-hidden="true"
                                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-(--action)/15 text-xs font-semibold text-(--accent-2)"
                                >
                                    {index + 1}
                                </span>
                                <span>{experiment}</span>
                            </li>
                        ))}
                    </ol>
                </Inset>
            )}

            <div className="mt-4" data-testid="opportunity-card-evidence">
                <div className="flex flex-wrap items-center gap-3">
                    {first ? (
                        <Button
                            variant="primary"
                            icon={<FileText />}
                            onClick={() =>
                                evidence.open({ title: card.title, apiUrl: first, filters })
                            }
                        >
                            {CTA_LABELS.viewMetricEvidence}
                        </Button>
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
                        className={buttonClassName("secondary")}
                    >
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.exploreExperiments}
                    </Link>
                </div>
                {more.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-label-caps uppercase text-(--ink-muted)">
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
        </Section>
    );
}
