import { AuthErrors } from "@/lib/constants/errors";
import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import {
    AnalyticsRequestInput,
    AnalyticsResult,
    CoverageAnalyticsResult,
    CoverageAnalyticsResultSchema,
} from "@/lib/graphql/schemas/analytics";
import { logger } from "@/lib/logger";
import { CoverageBaselinesSchema, type CoverageBaselinesState } from "./coverageBaselines";
import { JobFailuresResultSchema, type JobFailuresState } from "./jobFailures";
import {
    TESTOPS_PIPELINE_QUERY,
    TESTOPS_TEST_QUERY,
    TESTOPS_COVERAGE_BASELINES_QUERY,
    TESTOPS_COVERAGE_QUERY,
    TESTOPS_JOB_FAILURES_QUERY,
    TESTOPS_RISK_QUERY,
} from "./queries";
import { mapRiskMetricsPayload, type RiskMetricsResult } from "./risk-metrics";
import { TestOpsData } from "./types";
import {
    SAMPLE_PIPELINES_DATA,
    SAMPLE_TESTS_DATA,
    SAMPLE_COVERAGE_BASELINES,
    SAMPLE_COVERAGE_DATA,
    SAMPLE_JOB_FAILURES_DATA,
    SAMPLE_RISK_DATA,
} from "./sample-data";

const EMPTY_ANALYTICS: AnalyticsResult = { timeseries: [], breakdowns: [] };

export type CoverageMetricsResult = CoverageAnalyticsResult & { fetchFailed?: boolean };

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
                      buckets: series.buckets.map((b) => ({
                          ...b,
                          // A null bucket (no data) stays null, never null / 60 = 0 minutes.
                          value: b.value === null ? null : b.value / 60,
                      })),
                  }
                : series,
        ),
    };
}

// CHAOS-8272: no session/no org_id must REJECT, never synthesize a tenant
// identity (same idiom as src/lib/feature-flags/fetchers.ts).
async function resolveOrgId(orgId?: string): Promise<string> {
    if (orgId) return orgId;
    const session = await auth();
    const sessionOrgId = session?.user?.org_id as string | undefined;
    if (!sessionOrgId) {
        throw new Error(AuthErrors.OrgIdRequiredFromSession);
    }
    return sessionOrgId;
}

export async function fetchTestOpsData(
    batch: AnalyticsRequestInput,
    isTestMode: boolean = false,
    orgIdOverride?: string,
): Promise<TestOpsData> {
    if (isTestMode) {
        return {
            pipelines: SAMPLE_PIPELINES_DATA,
            tests: SAMPLE_TESTS_DATA,
            coverage: SAMPLE_COVERAGE_DATA,
        };
    }
    const orgId = await resolveOrgId(orgIdOverride);

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
        // A breakdown item value can be null (not reported); it must not fail the whole answer.
        const parsed = CoverageAnalyticsResultSchema.safeParse(res.analytics);
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

/** The input of `testopsJobFailures`: a window of at most 90 days and an optional scope. */
export type JobFailuresInput = {
    /** First day of the window, included ("YYYY-MM-DD"). */
    sinceDate: string;
    /** Last day of the window, included. */
    untilDate: string;
    repoIds?: string[] | null;
    /** Team scope: the repositories these teams own. */
    teamIds?: string[] | null;
    /** 1 to 100. */
    limit?: number;
};

/**
 * The failing workflows and jobs of the window (CHAOS-8514). A failed read, and an answer that is
 * not the served shape, are `{ fetchFailed: true }`: the card then says so and never shows an
 * empty list in its place.
 */
export async function fetchJobFailures(
    input: JobFailuresInput,
    isTestMode: boolean = false,
    orgIdOverride?: string,
): Promise<JobFailuresState> {
    if (isTestMode) {
        return SAMPLE_JOB_FAILURES_DATA;
    }

    const orgId = await resolveOrgId(orgIdOverride);
    try {
        const res = await graphqlFetch<{ testopsJobFailures: unknown }>(
            TESTOPS_JOB_FAILURES_QUERY,
            {
                orgId,
                input: {
                    sinceDate: input.sinceDate,
                    untilDate: input.untilDate,
                    // A scope is sent only when it is set: an empty list would narrow to nothing.
                    ...(input.repoIds?.length ? { repoIds: input.repoIds } : {}),
                    ...(input.teamIds?.length ? { teamIds: input.teamIds } : {}),
                    limit: input.limit ?? 20,
                },
            },
        );
        const parsed = JobFailuresResultSchema.safeParse(res.testopsJobFailures);
        if (!parsed.success) {
            logger.error(
                { err: parsed.error },
                "Job failures failed schema validation; reporting a failed read",
            );
            return { fetchFailed: true };
        }
        return parsed.data;
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch job failures");
        return { fetchFailed: true };
    }
}

/** The input of `coverageBaselines`: the day after the 30 days, and an optional scope. */
export type CoverageBaselinesInput = {
    /** "YYYY-MM-DD"; not included. The baseline is the mean of the 30 days before it. */
    endDate: string;
    repoIds?: string[] | null;
    /** Team scope: the repositories these teams own. */
    teamIds?: string[] | null;
};

/**
 * The coverage baseline of each repository. A failed read (a GraphQL error, or an answer that is
 * not the served shape) is `{ fetchFailed: true }`, never an empty list: an empty list means no
 * repository has a stored coverage row in the 30 days.
 */
export async function fetchCoverageBaselines(
    input: CoverageBaselinesInput,
    isTestMode: boolean = false,
    orgIdOverride?: string,
): Promise<CoverageBaselinesState> {
    if (isTestMode) {
        return SAMPLE_COVERAGE_BASELINES;
    }

    const orgId = await resolveOrgId(orgIdOverride);
    try {
        const res = await graphqlFetch<{ coverageBaselines: unknown }>(
            TESTOPS_COVERAGE_BASELINES_QUERY,
            {
                orgId,
                endDate: input.endDate,
                // A scope is sent only when it is set: an empty list would narrow to nothing.
                ...(input.repoIds?.length ? { repoIds: input.repoIds } : {}),
                ...(input.teamIds?.length ? { teamIds: input.teamIds } : {}),
            },
        );
        const parsed = CoverageBaselinesSchema.safeParse(res.coverageBaselines);
        if (!parsed.success) {
            logger.error(
                { err: parsed.error },
                "Coverage baselines failed schema validation; reporting a failed read",
            );
            return { fetchFailed: true };
        }
        return parsed.data;
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch coverage baselines");
        return { fetchFailed: true };
    }
}
