"use client";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { metricCardProps, readFailedCardProps } from "@/lib/metrics/metricDisplay";
import { getMetricLabel, getMetricPolarity } from "@/lib/metrics/catalog";
import { withRepoLinkNote } from "@/lib/metrics/repoLinkNote";
import { withRepoScopeNote } from "@/lib/metrics/repoScope";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";

type MetricEvidenceCardsProps = {
    metrics: string[];
    deltas: MetricDelta[];
    filters: MetricFilter;
    activeRole?: string;
    placeholderDeltas: boolean;
    /** The page's Home read FAILED (no answer): each tile says so, never "Not reported". */
    readFailed?: boolean;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric);

export function MetricEvidenceCards({
    metrics,
    deltas,
    filters,
    activeRole,
    placeholderDeltas,
    readFailed = false,
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
                // Placeholder rows are not served rows: the tile says "Not reported", never 0.
                const card = readFailed
                    ? readFailedCardProps()
                    : metricCardProps(placeholderDeltas ? null : data);

                return (
                    <MetricCard
                        key={metric}
                        as="article"
                        label={label}
                        {...card}
                        spark={readFailed ? undefined : data?.spark}
                        // A change is drawn only when both windows have data; else "No prior period", never 0.
                        // The served delta compares the window with the previous window of the same length.
                        caption={withRepoLinkNote(
                            withRepoScopeNote(
                                "delta" in card && card.delta !== undefined
                                    ? "vs previous window"
                                    : undefined,
                                metric,
                                filters,
                                data,
                            ),
                            data,
                        )}
                        polarity={getMetricPolarity(metric)}
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
