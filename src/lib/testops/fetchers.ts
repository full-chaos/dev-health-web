import { graphqlFetch } from "@/lib/graphql/urqlClient";
import { AnalyticsRequestInput, AnalyticsResult } from "@/lib/graphql/schemas/analytics";
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

export async function fetchTestOpsData(
  orgId: string,
  batch: AnalyticsRequestInput,
  isTestMode: boolean = false
): Promise<TestOpsData> {
  if (isTestMode) {
    return {
      pipelines: SAMPLE_PIPELINES_DATA,
      tests: SAMPLE_TESTS_DATA,
      coverage: SAMPLE_COVERAGE_DATA,
    };
  }

  try {
    const [pipelinesRes, testsRes, coverageRes] = await Promise.all([
      graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_PIPELINE_QUERY, { orgId, batch }),
      graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_TEST_QUERY, { orgId, batch }),
      graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_COVERAGE_QUERY, { orgId, batch }),
    ]);

    return {
      pipelines: pipelinesRes.analytics,
      tests: testsRes.analytics,
      coverage: coverageRes.analytics,
    };
  } catch (error) {
    console.error("Failed to fetch TestOps data:", error);
    return {
      pipelines: EMPTY_ANALYTICS,
      tests: EMPTY_ANALYTICS,
      coverage: EMPTY_ANALYTICS,
    };
  }
}

export async function fetchCoverageMetrics(
  orgId: string,
  batch: AnalyticsRequestInput,
  isTestMode: boolean = false
): Promise<AnalyticsResult> {
  if (isTestMode) {
    return SAMPLE_COVERAGE_DATA;
  }

  try {
    const res = await graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_COVERAGE_QUERY, { orgId, batch });
    return res.analytics;
  } catch (error) {
    console.error("Failed to fetch coverage metrics:", error);
    return EMPTY_ANALYTICS;
  }
}

export async function fetchRiskMetrics(
  orgId: string,
  batch: AnalyticsRequestInput,
  isTestMode: boolean = false
) {
  if (isTestMode) {
    return SAMPLE_RISK_DATA;
  }

  try {
    const res = await graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_RISK_QUERY, { orgId, batch });
    const analytics = res.analytics;

    const pipelineSuccess = analytics.timeseries.find(t => t.measure === "PIPELINE_SUCCESS_RATE")?.buckets || [];
    const testFlake = analytics.timeseries.find(t => t.measure === "TEST_FLAKE_RATE")?.buckets || [];
    const coverage = analytics.timeseries.find(t => t.measure === "COVERAGE_LINE_PCT")?.buckets || [];

    const latestPipelineSuccess = pipelineSuccess.length > 0 ? pipelineSuccess[pipelineSuccess.length - 1].value : 0;
    const latestTestFlake = testFlake.length > 0 ? testFlake[testFlake.length - 1].value : 0;
    const latestCoverage = coverage.length > 0 ? coverage[coverage.length - 1].value : 0;

    const testPassRateImplied = Math.max(0, 100 - latestTestFlake);
    const releaseConfidence = (latestPipelineSuccess / 100) * (testPassRateImplied / 100) * (latestCoverage / 100);

    const failureRate = Math.max(0, 100 - latestPipelineSuccess);
    const qualityDragHours = (latestTestFlake * 2) + (failureRate * 1.5);

    const timeseries = pipelineSuccess.map((bucket, i) => {
      const pSuccess = bucket.value;
      const tFlake = testFlake[i]?.value || 0;
      const cov = coverage[i]?.value || 0;
      const tPass = Math.max(0, 100 - tFlake);
      const riskScore = 1 - ((pSuccess / 100) * (tPass / 100) * (cov / 100));
      return {
        date: bucket.date,
        riskScore: Math.max(0, Math.min(1, riskScore))
      };
    });

    const qualityDragBreakdown = [
      { category: "Failure Rework", hours: failureRate * 1.0 },
      { category: "Flake Investigation", hours: latestTestFlake * 1.5 },
      { category: "Queue Wait", hours: failureRate * 0.3 },
      { category: "Retry Overhead", hours: latestTestFlake * 0.5 },
    ];

    const quadrantData = analytics.breakdowns.find(b => b.measure === "PIPELINE_SUCCESS_RATE")?.items.map(item => ({
      id: item.key,
      pipeline_success_rate: item.value,
      test_pass_rate: 100 - latestTestFlake
    })) || [];

    return {
      release_confidence: releaseConfidence,
      quality_drag_hours: qualityDragHours,
      pipeline_stability: latestPipelineSuccess / 100,
      timeseries,
      quality_drag_breakdown: qualityDragBreakdown,
      quadrant_data: quadrantData
    };
  } catch (error) {
    console.error("Failed to fetch risk metrics:", error);
    return null;
  }
}
