"use client";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { MetricCard } from "@/components/metrics/MetricCard";
import { metricInverseGood } from "@/lib/metrics/catalog";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";

type MetricEvidenceCardsProps = {
    metrics: string[];
    deltas: MetricDelta[];
    filters: MetricFilter;
    activeRole?: string;
    placeholderDeltas: boolean;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric);

export function MetricEvidenceCards({
    metrics,
    deltas,
    filters,
    activeRole,
    placeholderDeltas,
}: MetricEvidenceCardsProps) {
    const evidence = useEvidenceDrawer();

    return (
        <>
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {metrics.map((metric) => {
                    const data = getMetric(deltas, metric);
                    const label = data?.label ?? metric;
                    const hasValue = !placeholderDeltas && data?.value !== undefined;

                    return (
                        <MetricCard
                            key={metric}
                            as="article"
                            label={label}
                            value={hasValue ? data?.value : undefined}
                            unit={data?.unit}
                            spark={data?.spark}
                            noTrendLabel="Trend"
                            // A missing delta (placeholder rows, or no data row) is "No prior period", never 0.
                            delta={placeholderDeltas ? undefined : data?.delta_pct}
                            inverseGood={metricInverseGood(metric)}
                            // One evidence path per tile: the button opens the shared drawer, and
                            // the drawer footer links to Explore for the metric (with the role).
                            onOpenEvidence={() =>
                                evidence.open({ title: label, metric, filters, role: activeRole })
                            }
                        />
                    );
                })}
            </section>
        </>
    );
}
