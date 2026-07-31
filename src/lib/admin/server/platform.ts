"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import { adminApi } from "../api";
import type { PlatformAskDevReadinessResponse } from "../types";
import { requireSuperuserToken, withErrorHandling } from "./_shared";

/**
 * Platform Ask Dev readiness (CHAOS-3265). Superuser-only, no org scope — the
 * operator/platform-owned Ask Dev provider, never an organization's BYO
 * configuration. Mirrors the `getOrgEntitlements`/`requireSuperuserToken`
 * pattern used for platform-scoped licensing actions.
 */
export async function getPlatformAskDevReadiness(): Promise<
    ActionResult<PlatformAskDevReadinessResponse>
> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        return adminApi.platform.askDevReadiness.get(token);
    });
}

export async function runPlatformAskDevReadiness(): Promise<
    ActionResult<PlatformAskDevReadinessResponse>
> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        const result = await adminApi.platform.askDevReadiness.run(token);
        revalidatePath("/superadmin/ai/ask-dev");
        return result;
    });
}
