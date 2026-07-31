"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import { adminApi } from "../api";
import type {
    AskDevAdminResponse,
    AskDevAdminSettingsPatch,
    AskDevAdminUsageResponse,
} from "../types";
import { getSessionContext, withErrorHandling } from "./_shared";

export async function getAskDevAdmin(): Promise<ActionResult<AskDevAdminResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.askDev.get(token, orgId);
    });
}

export async function updateAskDevAdminSettings(
    data: AskDevAdminSettingsPatch,
): Promise<ActionResult<AskDevAdminResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.askDev.updateSettings(data, token, orgId);
        revalidatePath("/org/admin/ai");
        return result;
    });
}

// NOTE (CHAOS-3265): `runAskDevReadiness` was removed — the org Ask Dev
// surface no longer exposes a platform-provider preflight action. See
// `runPlatformAskDevReadiness` (src/lib/admin/server/platform.ts) and
// `runLLMSettingsReadiness` (src/lib/admin/server/settings.ts).

export async function getAskDevUsage(
    since?: string,
): Promise<ActionResult<AskDevAdminUsageResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.askDev.usage(since, token, orgId);
    });
}
