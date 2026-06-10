import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import {
    AnalyticsRequestInput,
    AnalyticsResult,
    AnalyticsResultSchema,
} from "@/lib/graphql/schemas/analytics";
import { logger } from "@/lib/logger";
import { normalizePercent } from "@/lib/guards/numbers";
import {
    TESTOPS_PIPELINE_QUERY,
    TESTOPS_TEST_QUERY,
    TESTOPS_COVERAGE_QUERY,
    TESTOPS_RISK_QUERY,
} from "./queries";
import { TestOpsData } from "./types";
import {
    SAMPLE_PIPELINES_DATA,
    SAMPLE_TESTS_DATA,
    SAMPLE_COVERAGE_DATA,
    SAMPLE_RISK_DATA,
} from "./sample-data";

const EMPTY_ANALYTICS: AnalyticsResult = { timeseries: [], breakdowns: [] };

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
): Promise<AnalyticsResult> {
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
            return EMPTY_ANALYTICS;
        }
        return parsed.data;
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch coverage metrics");
        return EMPTY_ANALYTICS;
    }
}

export async function fetchRiskMetrics(
    batch: AnalyticsRequestInput,
    isTestMode: boolean = false,
    orgIdOverride?: string,
) {
    if (isTestMode) {
        return SAMPLE_RISK_DATA;
    }

    const orgId = await resolveOrgId(orgIdOverride);
    try {
        const res = await graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_RISK_QUERY, {
            orgId,
            batch,
        });
        const analytics = res.analytics;

        const pipelineSuccess =
            analytics.timeseries.find((t) => t.measure === "PIPELINE_SUCCESS_RATE")?.buckets || [];
        const testFlake =
            analytics.timeseries.find((t) => t.measure === "TEST_FLAKE_RATE")?.buckets || [];
        const coverage =
            analytics.timeseries.find((t) => t.measure === "COVERAGE_LINE_PCT")?.buckets || [];

        const latestPipelineSuccess =
            pipelineSuccess.length > 0
                ? pipelineSuccess[pipelineSuccess.length - 1].value
                : undefined;
        const latestTestFlake =
            testFlake.length > 0 ? testFlake[testFlake.length - 1].value : undefined;
        const latestCoverage =
            coverage.length > 0 ? coverage[coverage.length - 1].value : undefined;

        const testPassRateImplied =
            latestTestFlake != null ? Math.max(0, 100 - latestTestFlake) : undefined;
        const releaseConfidence =
            latestPipelineSuccess != null && testPassRateImplied != null && latestCoverage != null
                ? (latestPipelineSuccess / 100) *
                  (testPassRateImplied / 100) *
                  (latestCoverage / 100)
                : undefined;

        const failureRate =
            latestPipelineSuccess != null ? Math.max(0, 100 - latestPipelineSuccess) : undefined;
        const qualityDragHours =
            latestTestFlake != null && failureRate != null
                ? latestTestFlake * 2 + failureRate * 1.5
                : undefined;

        const timeseries = pipelineSuccess.map((bucket, i) => {
            const pSuccess = bucket.value;
            const tFlake = testFlake[i]?.value || 0;
            const cov = coverage[i]?.value || 0;
            const tPass = Math.max(0, 100 - tFlake);
            const riskScore = 1 - (pSuccess / 100) * (tPass / 100) * (cov / 100);
            return {
                date: bucket.date,
                riskScore: Math.max(0, Math.min(1, riskScore)),
            };
        });

        const qualityDragBreakdown =
            failureRate != null && latestTestFlake != null
                ? [
                      { category: "Failure Rework", hours: failureRate * 1.0 },
                      { category: "Flake Investigation", hours: latestTestFlake * 1.5 },
                      { category: "Queue Wait", hours: failureRate * 0.3 },
                      { category: "Retry Overhead", hours: latestTestFlake * 0.5 },
                  ]
                : [];

        const quadrantData =
            latestTestFlake != null
                ? analytics.breakdowns
                      .find((b) => b.measure === "PIPELINE_SUCCESS_RATE")
                      ?.items.map((item) => ({
                          id: item.key,
                          pipeline_success_rate: normalizePercent(item.value),
                          test_pass_rate: normalizePercent(100 - latestTestFlake),
                      })) || []
                : [];

        const toSpark = (buckets: { date: string; value: number }[]) =>
            buckets.map((b) => ({ ts: b.date, value: b.value }));

        const delta = (buckets: { value: number }[]) => {
            if (buckets.length < 2) return undefined;
            const prev = buckets[0].value;
            const curr = buckets[buckets.length - 1].value;
            return prev === 0 ? undefined : ((curr - prev) / Math.abs(prev)) * 100;
        };

        const confidenceSpark = timeseries.map((b) => ({
            ts: b.date,
            value: (1 - b.riskScore) * 100,
        }));

        const dragSpark = timeseries.map((b, i) => {
            const fr = Math.max(0, 100 - (pipelineSuccess[i]?.value || 0));
            const tf = testFlake[i]?.value || 0;
            return { ts: b.date, value: tf * 2 + fr * 1.5 };
        });

        const stabilitySpark = toSpark(pipelineSuccess);

        return {
            release_confidence: releaseConfidence,
            quality_drag_hours: qualityDragHours,
            pipeline_stability:
                latestPipelineSuccess != null ? latestPipelineSuccess / 100 : undefined,
            timeseries,
            quality_drag_breakdown: qualityDragBreakdown,
            quadrant_data: quadrantData,
            confidence_spark: confidenceSpark,
            confidence_delta: delta(confidenceSpark),
            drag_spark: dragSpark,
            drag_delta: delta(dragSpark),
            stability_spark: stabilitySpark,
            stability_delta: delta(pipelineSuccess),
        };
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch risk metrics");
        return null;
    }
}
