import { AnalyticsResult } from "@/lib/graphql/schemas/analytics";

export type TestOpsData = {
  pipelines: AnalyticsResult;
  tests: AnalyticsResult;
  coverage: AnalyticsResult;
};
