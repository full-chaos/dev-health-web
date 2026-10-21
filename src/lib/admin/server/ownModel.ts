"use server";

import { failureFromError } from "@/lib/actionFailure";
import { revalidatePath } from "next/cache";
import { adminApi } from "../api";
import type { OwnModelSetting } from "../api/llm-settings";
import type { LLMSettingsActionResult } from "../types";
import { getSessionContext } from "./_shared";

// The org's on/off for its saved BYO model. Off keeps the saved config and stops using it.

export async function getOwnModelSetting(): Promise<LLMSettingsActionResult<OwnModelSetting>> {
    try {
        const { token, orgId } = await getSessionContext();
        return { data: await adminApi.llmSettings.ownModel(token, orgId) };
    } catch (err) {
        return failureFromError("getOwnModelSetting", err);
    }
}

export async function setOwnModelSetting(
    enabled: boolean,
): Promise<LLMSettingsActionResult<OwnModelSetting>> {
    try {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.llmSettings.setOwnModel(enabled, token, orgId);
        revalidatePath("/org/admin/ai");
        return { data: result };
    } catch (err) {
        return failureFromError("setOwnModelSetting", err);
    }
}
