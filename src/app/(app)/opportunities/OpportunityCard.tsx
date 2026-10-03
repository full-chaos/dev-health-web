"use client";

import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { Inset } from "@/components/capacity/Inset";
import { Button, buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import type { OpportunityCard as OpportunityCardData } from "@/lib/types";

type OpportunityCardProps = {
    card: OpportunityCardData;
    filters: MetricFilter;
    activeRole?: string;
};

/**
 * The selected opportunity: rationale, next steps and the evidence drawer. The title is drawn as
 * served: the API names it by the metric's polarity ("Reduce" where lower is better, "Recover"
 * where higher is better), so the web adds no direction warning.
 */
export function OpportunityCard({ card, filters, activeRole }: OpportunityCardProps) {
    const evidence = useEvidenceDrawer();
    const [first, ...more] = card.evidence_links;

    return (
        <Section title={card.title} data-testid="opportunity-detail">
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
