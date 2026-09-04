"use server";

import { auth } from "@/lib/auth";
import { AuthErrors } from "@/lib/constants/errors";
import { fetchFeatureFlagList } from "@/lib/feature-flags/fetchers";
import type { FeatureFlagListResult } from "@/lib/feature-flags/types";

// CHAOS-4728: Next.js resolves a Server Action id via a global module map
// with no page-ownership check (action-handler.js getActionModIdOrError) —
// layout/middleware guards never run before a direct action POST. This
// action must reject on its own; it cannot rely on fetchFeatureFlagList's
// internal resolveOrgId check upstream of it.
export async function fetchFlagPage(offset: number, limit: number): Promise<FeatureFlagListResult> {
    const session = await auth();
    if (!session?.user?.org_id) {
        throw new Error(AuthErrors.Unauthorized);
    }
    return fetchFeatureFlagList(offset, limit);
}
