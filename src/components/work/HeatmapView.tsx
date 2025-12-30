"use client";

import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import type { HeatmapResponse, MetricFilter } from "@/lib/types";

type HeatmapViewProps = {
    filters: MetricFilter;
    scopeId: string;
    reviewHeatmap: HeatmapResponse | null;
};

export function HeatmapView({ filters, scopeId, reviewHeatmap }: HeatmapViewProps) {
    return (
        <section>
            <HeatmapPanel
                title="Review wait density"
                description="Find the hours and weekdays where PRs accumulate review wait time."
                request={{
                    type: "temporal_load",
                    metric: "review_wait_density",
                    scope_type: filters.scope.level,
                    scope_id: scopeId,
                    range_days: filters.time.range_days,
                    start_date: filters.time.start_date,
                    end_date: filters.time.end_date,
                }}
                initialData={reviewHeatmap}
                emptyState="Review wait heatmap unavailable."
                evidenceTitle="PR evidence"
            />
        </section>
    );
}
