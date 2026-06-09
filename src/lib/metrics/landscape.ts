/**
 * Maps each Landscape quadrant type to the catalog metric used for the
 * "Open evidence" linkback. Quadrant type ids are visualization-only keys
 * and are NOT valid catalog metric ids — use this mapping instead.
 *
 * Tested in src/lib/__tests__/landscape-evidence-metrics.test.ts to ensure
 * every value remains a member of METRIC_CATALOG.
 */
export const LANDSCAPE_EVIDENCE_METRICS: Record<string, string> = {
    /** Cycle Time × Throughput quadrant → cycle_time axis metric */
    cycle_throughput: "cycle_time",
    /** Churn × Throughput quadrant → churn axis metric */
    churn_throughput: "churn",
};
