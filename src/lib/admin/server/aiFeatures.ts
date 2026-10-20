"use server";

import { failureFromError } from "@/lib/actionFailure";
import { revalidatePath } from "next/cache";
import { adminApi } from "../api";
import type { ServiceModelSetting } from "../api/llm-settings";
import type { LLMSettingsActionResult } from "../types";
import { getSessionContext } from "./_shared";

// The org's on/off for ACR AI features (acr_service_model). The status is kept so the
// page can tell a managed setting (409) and a plan gate (402/403) from a failed read.

export async function getServiceModelSetting(): Promise<
    LLMSettingsActionResult<ServiceModelSetting>
> {
    try {
        const { token, orgId } = await getSessionContext();
        return { data: await adminApi.llmSettings.serviceModel(token, orgId) };
    } catch (err) {
        return failureFromError("getServiceModelSetting", err);
    }
}

export async function setServiceModelSetting(
    enabled: boolean,
): Promise<LLMSettingsActionResult<ServiceModelSetting>> {
    try {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.llmSettings.setServiceModel(enabled, token, orgId);
        revalidatePath("/org/admin/ai");
        return { data: result };
    } catch (err) {
        return failureFromError("setServiceModelSetting", err);
    }
}
