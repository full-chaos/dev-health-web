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

export async function runAskDevReadiness(): Promise<ActionResult<AskDevAdminResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.askDev.runReadiness(token, orgId);
        revalidatePath("/org/admin/ai");
        return result;
    });
}

export async function getAskDevUsage(
    since?: string,
): Promise<ActionResult<AskDevAdminUsageResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.askDev.usage(since, token, orgId);
    });
}
