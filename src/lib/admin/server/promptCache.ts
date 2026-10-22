"use server";

import { failureFromError } from "@/lib/actionFailure";
import { revalidatePath } from "next/cache";
import { adminApi } from "../api";
import type { PromptCacheSetting } from "../api/llm-settings";
import type { LLMSettingsActionResult } from "../types";
import { getSessionContext } from "./_shared";

// The org's opt-in to the Anthropic prompt cache. Off by default; it applies to Anthropic models only.

export async function getPromptCacheSetting(): Promise<
    LLMSettingsActionResult<PromptCacheSetting>
> {
    try {
        const { token, orgId } = await getSessionContext();
        return { data: await adminApi.llmSettings.promptCache(token, orgId) };
    } catch (err) {
        return failureFromError("getPromptCacheSetting", err);
    }
}

export async function setPromptCacheSetting(
    enabled: boolean,
): Promise<LLMSettingsActionResult<PromptCacheSetting>> {
    try {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.llmSettings.setPromptCache(enabled, token, orgId);
        revalidatePath("/org/admin/ai");
        return { data: result };
    } catch (err) {
        return failureFromError("setPromptCacheSetting", err);
    }
}
