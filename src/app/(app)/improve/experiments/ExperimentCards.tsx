"use client";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import type { Experiment } from "@/lib/graphql/types";
import { getMetricLabel } from "@/lib/metrics/catalog";

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
        <>
            <section
                className="grid gap-6 md:grid-cols-2"
                aria-label="Experiments"
                data-testid="experiments-list"
            >
                {experiments.map((experiment, index) => (
                    <article
                        key={experiment.id}
                        className="flex flex-col gap-3 rounded-3xl border border-(--card-stroke) bg-card p-6"
                        data-testid="experiment-card"
                    >
                        <header className="flex items-start justify-between gap-4">
                            <p className="rounded-full border border-(--card-stroke) bg-(--card-80) px-2 py-0.5 text-xs text-(--ink-muted)">
                                {experiment.metric || "Experiment"}
                            </p>
                            <span className="shrink-0 text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Suggestion {index + 1}
                            </span>
                        </header>
                        <p className="font-(--font-display) text-base leading-snug">
                            {experiment.hypothesis}
                        </p>
                        {experiment.metric ? (
                            <div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        evidence.open({
                                            title: `${getMetricLabel(experiment.metric)} evidence`,
                                            metric: experiment.metric,
                                            filters,
                                        })
                                    }
                                    className="rounded-xl border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--accent-2) hover:bg-(--card-70) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/60"
                                >
                                    {CTA_LABELS.reviewEvidence}
                                </button>
                            </div>
                        ) : null}
                    </article>
                ))}
            </section>
        </>
    );
}
