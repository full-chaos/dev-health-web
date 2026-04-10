import { graphqlFetch } from "@/lib/graphql/urqlClient";
import { AnalyticsRequestInput, AnalyticsResult } from "@/lib/graphql/schemas/analytics";
import {
  TESTOPS_PIPELINE_QUERY,
  TESTOPS_TEST_QUERY,
  TESTOPS_COVERAGE_QUERY,
} from "./queries";
import { TestOpsData } from "./types";
import {
  SAMPLE_PIPELINES_DATA,
  SAMPLE_TESTS_DATA,
  SAMPLE_COVERAGE_DATA,
  SAMPLE_RISK_DATA,
} from "./sample-data";

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
      pipelines: SAMPLE_PIPELINES_DATA,
      tests: SAMPLE_TESTS_DATA,
      coverage: SAMPLE_COVERAGE_DATA,
    };
  }
}

export async function fetchCoverageMetrics(
  orgId: string,
  batch: AnalyticsRequestInput,
  isTestMode: boolean = false
) {
  if (isTestMode) {
    return SAMPLE_COVERAGE_DATA;
  }

  try {
    const res = await graphqlFetch<{ analytics: AnalyticsResult }>(TESTOPS_COVERAGE_QUERY, { orgId, batch });
    return res.analytics;
  } catch (error) {
    console.error("Failed to fetch coverage metrics:", error);
    return SAMPLE_COVERAGE_DATA;
  }
}

export async function fetchRiskMetrics(
  orgId: string,
  isTestMode: boolean = false
) {
  if (isTestMode) {
    return SAMPLE_RISK_DATA;
  }

  // In a real implementation, this would call a REST endpoint or GraphQL query
  // For now, we'll just return the sample data as a fallback
  try {
    // const res = await fetch(`/api/v1/orgs/${orgId}/risk`);
    // return await res.json();
    return SAMPLE_RISK_DATA;
  } catch (error) {
    console.error("Failed to fetch risk metrics:", error);
    return SAMPLE_RISK_DATA;
  }
}
