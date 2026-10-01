"use client";

import { useState } from "react";

import { EvidencePanel } from "@/components/evidence";
import { MetricCard } from "@/components/metrics/MetricCard";
import { buildExploreUrl } from "@/lib/filters/url";
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
    const [activeMetric, setActiveMetric] = useState<MetricDelta | null>(null);

    return (
        <>
            <EvidencePanel
                isOpen={Boolean(activeMetric)}
                onCloseAction={() => setActiveMetric(null)}
                title={activeMetric?.label ?? "Metric evidence"}
                metric={activeMetric?.metric}
                filters={filters}
            />

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
                            valueUnavailableLabel="—"
                            onOpenEvidence={() =>
                                setActiveMetric(
                                    data ?? {
                                        metric,
                                        label,
                                        value: 0,
                                        unit: "",
                                        delta_pct: 0,
                                        spark: [],
                                    },
                                )
                            }
                            evidenceHref={buildExploreUrl({ metric, filters, role: activeRole })}
                        />
                    );
                })}
            </section>
        </>
    );
}
