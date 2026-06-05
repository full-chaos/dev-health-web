"use server";

import { fetchFeatureFlagList } from "@/lib/feature-flags/fetchers";
import type { FeatureFlagListResult } from "@/lib/feature-flags/types";

export async function fetchFlagPage(offset: number, limit: number): Promise<FeatureFlagListResult> {
    return fetchFeatureFlagList(offset, limit);
}
