import { AnalyticsResult } from "@/lib/graphql/schemas/analytics";

export type TestOpsData = {
    pipelines: AnalyticsResult;
    tests: AnalyticsResult;
    coverage: AnalyticsResult;
    /**
     * True when the GraphQL fetch threw and the empty results above are a
     * degraded fallback, not a genuine absence of data. Lets pages render an
     * error state instead of a misleading "not yet ingested" empty state.
     */
    fetchFailed?: boolean;
};
