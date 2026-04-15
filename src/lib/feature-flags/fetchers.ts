import type { FeatureFlagsData } from "./types";
import { SAMPLE_FEATURE_FLAGS_DATA } from "./sample-data";

// TODO(CHAOS-1198): Replace with real GraphQL fetch once merged
export async function fetchFeatureFlagsData(
  _dateRange: { startDate: string; endDate: string },
  _isTestMode: boolean = false,
): Promise<FeatureFlagsData> {
  return SAMPLE_FEATURE_FLAGS_DATA;
}
