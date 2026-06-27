"use server";

import { adminApi } from "../api";
import type { ActionResult } from "@/lib/result";
import type { SetupStatus } from "@/lib/onboarding/types";
import { getSessionContext, withErrorHandling } from "./_shared";

/**
 * CHAOS-2678 / C2: fetch the org's first-run setup status for the dashboard's
 * setup-aware surface. Wrapped in {@link withErrorHandling} so a backend/auth
 * failure degrades to a skipped banner rather than crashing the cockpit.
 */
export async function getSetupStatus(): Promise<ActionResult<SetupStatus>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.setup.status(token, orgId);
    });
}
