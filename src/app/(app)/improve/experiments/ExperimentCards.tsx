"use client";

import { ArrowRight } from "lucide-react";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { Button } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import type { Experiment } from "@/lib/graphql/types";
import { getMetricLabel } from "@/lib/metrics/catalog";
import { STATUS_PILL } from "@/lib/statusPill";

type ExperimentCardsProps = {
    experiments: Experiment[];
    filters: MetricFilter;
};

/**
 * Suggested experiments: hypothesis as the title, the source metric as a neutral tag, and the
 * evidence behind the metric in the shared drawer. Owner and stop condition are not shown until
 * experiments can be saved (ruling 10).
 */
export function ExperimentCards({ experiments, filters }: ExperimentCardsProps) {
    const evidence = useEvidenceDrawer();

    return (
        <Section title="Suggested experiments" data-testid="experiments-section">
            <div
                className="grid gap-4 md:grid-cols-2"
                role="list"
                aria-label="Experiments"
                data-testid="experiments-list"
            >
                {experiments.map((experiment, index) => (
                    <article
                        key={experiment.id}
                        role="listitem"
                        className="flex flex-col gap-3 rounded-sm border border-(--card-stroke) bg-background p-4"
                        data-testid="experiment-card"
                    >
                        <header className="flex items-start justify-between gap-4">
                            <span
                                data-testid="experiment-metric-pill"
                                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_PILL.info}`}
                            >
                                {experiment.metric
                                    ? getMetricLabel(experiment.metric)
                                    : "Experiment"}
                            </span>
                            <span className="shrink-0 text-xs text-(--ink-muted)">
                                Suggestion {index + 1}
                            </span>
                        </header>
                        <h3 className="text-[0.9375rem] font-semibold leading-snug">
                            {experiment.hypothesis}
                        </h3>
                        {experiment.metric ? (
                            <div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<ArrowRight />}
                                    onClick={() =>
                                        evidence.open({
                                            title: `${getMetricLabel(experiment.metric)} evidence`,
                                            metric: experiment.metric,
                                            filters,
                                        })
                                    }
                                >
                                    {CTA_LABELS.reviewEvidence}
                                </Button>
                            </div>
                        ) : null}
                    </article>
                ))}
            </div>
        </Section>
    );
}
