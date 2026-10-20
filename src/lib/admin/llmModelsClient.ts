import type { LLMModelListResponse, LLMSettingsActionResult } from "./types";

export const LLM_MODELS_PATH = "/api/v1/admin/llm-settings/models";

// A plain browser read through the web proxy, not a Server Action: Next runs Server Actions one
// after another per tab, so a slow provider would hold up every save behind the picker.
export async function fetchLLMModels(
    signal: AbortSignal,
): Promise<LLMSettingsActionResult<LLMModelListResponse>> {
    const response = await fetch(LLM_MODELS_PATH, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
    });
    if (!response.ok) {
        return {
            error: "The provider's model list is not available right now.",
            status: response.status,
        };
    }
    return { data: (await response.json()) as LLMModelListResponse };
}
