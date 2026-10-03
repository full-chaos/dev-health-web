"use client";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import type { MetricFilter } from "@/lib/filters/types";
import { getMetricLabel, metricInverseGood } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";

/** The three tiles of the page (prototype `metrics([M.wip, M.blocked, M.review], 3)`). */
export const BOTTLENECK_TILES = [
    { metric: "wip_saturation", caption: "Work in progress" },
    { metric: "blocked_work", caption: "Blocked items" },
    { metric: "review_latency", caption: "Time to first review" },
] as const;

type BottleneckTilesProps = {
    deltas: MetricDelta[];
    /** True when the home payload had no rows: values and changes are not served. */
    placeholderDeltas: boolean;
    filters: MetricFilter;
    role?: string;
    /** The way back to this page, for the drawer footer and "Return to investigation". */
    origin: string;
};

/**
 * One joined strip of three tiles. Each tile opens the ONE shared evidence drawer for its metric
 * (P0-9); the drawer footer leads to the metric's evidence page with this page as the way back.
 * Each delta is coloured by the metric's polarity (`metricInverseGood`), as on Flow.
 */
export function BottleneckTiles({
    deltas,
    placeholderDeltas,
    filters,
    role,
    origin,
}: BottleneckTilesProps) {
    const evidence = useEvidenceDrawer();
    return (
        <MetricStrip data-testid="bottleneck-tiles">
            {BOTTLENECK_TILES.map(({ metric, caption }) => {
                const row = deltas.find((item) => item.metric === metric);
                const label = row?.label ?? getMetricLabel(metric);
                return (
                    <MetricCard
                        key={metric}
                        as="article"
                        testId={`bottleneck-tile-${metric}`}
                        label={label}
                        value={placeholderDeltas ? undefined : row?.value}
                        unit={row?.unit}
                        delta={placeholderDeltas ? undefined : row?.delta_pct}
                        inverseGood={metricInverseGood(metric)}
                        spark={row?.spark}
                        caption={caption}
                        onOpenEvidence={() =>
                            evidence.open({ title: label, metric, filters, role, origin })
                        }
                    />
                );
            })}
        </MetricStrip>
    );
}
