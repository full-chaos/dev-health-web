"use server";

import { failureFromError } from "@/lib/actionFailure";
import { adminApi } from "../api";
import type { LLMModelListResponse, LLMSettingsActionResult } from "../types";
import { getSessionContext } from "./_shared";

// The provider's model ids for the saved BYO key. Read only: the picker never writes a setting.
export async function listLLMModels(): Promise<LLMSettingsActionResult<LLMModelListResponse>> {
    try {
        const { token, orgId } = await getSessionContext();
        return { data: await adminApi.llmSettings.models(token, orgId) };
    } catch (err) {
        return failureFromError("listLLMModels", err);
    }
}
