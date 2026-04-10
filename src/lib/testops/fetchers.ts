import { graphqlFetch } from "@/lib/graphql/urqlClient";
import { AnalyticsRequestInput } from "@/lib/graphql/schemas/analytics";
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
      graphqlFetch<{ analytics: any }>(TESTOPS_PIPELINE_QUERY, { orgId, batch }),
      graphqlFetch<{ analytics: any }>(TESTOPS_TEST_QUERY, { orgId, batch }),
      graphqlFetch<{ analytics: any }>(TESTOPS_COVERAGE_QUERY, { orgId, batch }),
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
