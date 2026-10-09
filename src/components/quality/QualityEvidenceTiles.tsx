"use client";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import type { MetricFilter } from "@/lib/filters/types";
import { metricCardProps } from "@/lib/metrics/metricDisplay";
import type { MetricDelta, SparkPoint } from "@/lib/types";

/** One Quality tile: the served metric delta row, as the page always read it. */
export type QualityTile = {
    /** Metric key of the explain endpoint (the drawer loads its evidence). */
    metric: string;
    label: string;
    /** The served delta row. `null` when no row was served: the tile says so, never 0. */
    row: MetricDelta | null;
    spark?: SparkPoint[];
    /** The short line the tile carried as its caption ("Pipeline success", …). */
    description: string;
};

type QualityEvidenceTilesProps = {
    tiles: QualityTile[];
    filters: MetricFilter;
    role?: string;
};

/**
 * The Quality tiles in the shared metric strip (MAPPING Q2-Q4). The tile is not a link: its
 * "Open evidence" action opens the ONE shared evidence drawer for the metric, and the drawer
 * footer links to Explore with the scope and role (the path the whole-card link used to take).
 */
export function QualityEvidenceTiles({ tiles, filters, role }: QualityEvidenceTilesProps) {
    const evidence = useEvidenceDrawer();
    return (
        <MetricStrip data-testid="quality-tiles">
            {tiles.map((tile) => (
                <MetricCard
                    key={tile.metric}
                    label={tile.label}
                    {...metricCardProps(tile.row)}
                    spark={tile.spark}
                    description={tile.description}
                    onOpenEvidence={() =>
                        evidence.open({ title: tile.label, metric: tile.metric, filters, role })
                    }
                    testId={`quality-tile-${tile.metric}`}
                />
            ))}
        </MetricStrip>
    );
}
