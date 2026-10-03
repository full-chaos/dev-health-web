"use client";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { getMetricLabel, metricInverseGood } from "@/lib/metrics/catalog";
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
        // One joined strip with one column per tile (prototype `metrics(arr, cols)`): 4 tiles give
        // 4 columns, 3 give 3.
        <MetricStrip data-testid="metric-tile-strip">
            {metrics.map((metric) => {
                const data = getMetric(deltas, metric);
                // A metric with no served row keeps its catalog name; a raw key is never shown.
                const label = data?.label ?? getMetricLabel(metric);
                const hasValue = !placeholderDeltas && data?.value !== undefined;
                const delta = placeholderDeltas ? undefined : data?.delta_pct;

                return (
                    <MetricCard
                        key={metric}
                        as="article"
                        label={label}
                        value={hasValue ? data?.value : undefined}
                        unit={data?.unit}
                        spark={data?.spark}
                        // A missing delta (placeholder rows, or no data row) is "No prior period", never 0.
                        delta={delta}
                        // The served delta compares the window with the previous window of the same length.
                        caption={delta !== undefined ? "vs previous window" : undefined}
                        inverseGood={metricInverseGood(metric)}
                        // One evidence path per tile: the button opens the shared drawer, and
                        // the drawer footer links to Explore for the metric (with the role).
                        onOpenEvidence={() =>
                            evidence.open({ title: label, metric, filters, role: activeRole })
                        }
                    />
                );
            })}
        </MetricStrip>
    );
}
