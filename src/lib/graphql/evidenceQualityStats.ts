import type { EvidenceQualityStats } from "@/lib/types";
import type { EvidenceQualityStatsResult } from "./types";

/**
 * The REST-shaped evidence-quality stats of the GraphQL stats row. `uncategorizedCount` is the work
 * units the theme mix leaves out for too little text: a count the API did not send stays null,
 * never 0 (unknown is not zero).
 */
export function adaptEvidenceQualityStats(
    stats: EvidenceQualityStatsResult | null | undefined,
): EvidenceQualityStats | undefined {
    if (!stats) return undefined;
    return {
        mean: stats.mean ?? null,
        stddev: stats.stddev ?? null,
        band_counts: (stats.bandCounts as Record<string, number>) ?? {},
        quality_drivers: [],
        total: stats.total,
        uncategorized_count: stats.uncategorizedCount ?? null,
    };
}
