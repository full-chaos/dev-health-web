import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import {
    AnalyticsRequestInput,
    AnalyticsResult,
    AnalyticsResultSchema,
} from "@/lib/graphql/schemas/analytics";
import { logger } from "@/lib/logger";
import {
    TESTOPS_PIPELINE_QUERY,
    TESTOPS_TEST_QUERY,
    TESTOPS_COVERAGE_QUERY,
    TESTOPS_RISK_QUERY,
} from "./queries";
import { mapRiskMetricsPayload, type RiskMetricsResult } from "./risk-metrics";
import { TestOpsData } from "./types";
import {
    SAMPLE_PIPELINES_DATA,
    SAMPLE_TESTS_DATA,
    SAMPLE_COVERAGE_DATA,
    SAMPLE_RISK_DATA,
} from "./sample-data";

const EMPTY_ANALYTICS: AnalyticsResult = { timeseries: [], breakdowns: [] };

export type CoverageMetricsResult = AnalyticsResult & { fetchFailed?: boolean };

// Duration measures whose backend buckets are stored in seconds. Sample data is
// already in minutes, so this normalisation is applied only in real (non-test) mode.
const DURATION_MEASURES_SECONDS = new Set([
    "PIPELINE_DURATION_P95",
    "PIPELINE_QUEUE_TIME",
    "TEST_SUITE_DURATION_P95",
]);

/**
 * Converts duration-measure bucket values from seconds to minutes.
 * All other measures are passed through unchanged.
 * Safe to call with empty / partial results.
 */
export function normalizeAnalyticsDurations(result: AnalyticsResult): AnalyticsResult {
    return {
        ...result,
        timeseries: result.timeseries.map((series) =>
            DURATION_MEASURES_SECONDS.has(series.measure)
                ? {
                      ...series,
                      buckets: series.buckets.map((b) => ({ ...b, value: b.value / 60 })),
                  }
                : series,
        ),
    };
}

/** Resolve orgId from the auth session, falling back to "default-org". */
async function resolveOrgId(orgId?: string): Promise<string> {
    if (orgId) return orgId;
    const session = await auth();
    return (session?.user?.org_id as string | undefined) ?? "default-org";
}

export async function fetchTestOpsData(
    batch: AnalyticsRequestInput,
    isTestMode: boolean = false,
    orgIdOverride?: string,
): Promise<TestOpsData> {
    const orgId = await resolveOrgId(orgIdOverride);
    if (isTestMode) {
        return {
            pipelines: SAMPLE_PIPELINES_DATA,
            tests: SAMPLE_TESTS_DATA,
            coverage: SAMPLE_COVERAGE_DATA,
        };
    }

    try {
        const [pipelinesRes, testsRes, coverageRes] = await Promise.all([
            graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_PIPELINE_QUERY, {
                orgId,
                batch,
            }),
            graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_TEST_QUERY, {
                orgId,
                batch,
            }),
            graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_COVERAGE_QUERY, {
                orgId,
                batch,
            }),
        ]);

        // Normalise duration measures from seconds (backend) to minutes so that
        // the display layer (formatMetricValue with unit "m") can label without
        // converting. Sample data is already in minutes and is NOT passed here.
        return {
            pipelines: normalizeAnalyticsDurations(pipelinesRes.analytics),
            tests: normalizeAnalyticsDurations(testsRes.analytics),
            coverage: coverageRes.analytics,
        };
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch TestOps data");
        return {
            pipelines: EMPTY_ANALYTICS,
            tests: EMPTY_ANALYTICS,
            coverage: EMPTY_ANALYTICS,
            fetchFailed: true,
        };
    }
}

export async function fetchCoverageMetrics(
    batch: AnalyticsRequestInput,
    isTestMode: boolean = false,
    orgIdOverride?: string,
): Promise<CoverageMetricsResult> {
    if (isTestMode) {
        return SAMPLE_COVERAGE_DATA;
    }

    const orgId = await resolveOrgId(orgIdOverride);
    try {
        const res = await graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_COVERAGE_QUERY, {
            orgId,
            batch,
        });
        const parsed = AnalyticsResultSchema.safeParse(res.analytics);
        if (!parsed.success) {
            logger.error(
                { err: parsed.error },
                "Coverage analytics failed schema validation; returning empty result",
            );
            return { ...EMPTY_ANALYTICS, fetchFailed: true };
        }
        return parsed.data;
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch coverage metrics");
        return { ...EMPTY_ANALYTICS, fetchFailed: true };
    }
}

export async function fetchRiskMetrics(
    batch: AnalyticsRequestInput,
    isTestMode: boolean = false,
    orgIdOverride?: string,
): Promise<RiskMetricsResult | null> {
    if (isTestMode) {
        return SAMPLE_RISK_DATA;
    }

    const orgId = await resolveOrgId(orgIdOverride);
    try {
        const dateRange = batch.timeseries[0]?.dateRange ?? batch.breakdowns[0]?.dateRange;
        if (!dateRange) {
            logger.error("Risk metrics request requires a date range");
            return null;
        }

        const res = await graphqlFetch<{ testopsRisk: unknown }>(TESTOPS_RISK_QUERY, {
            orgId,
            input: dateRange,
        });
        const risk = mapRiskMetricsPayload(res.testopsRisk);
        if (!risk) {
            logger.error("Risk metrics failed schema validation");
            return null;
        }
        return risk;
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch risk metrics");
        return null;
    }
}
