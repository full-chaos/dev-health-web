import type { LLMModelListResponse, LLMSettingsActionResult } from "./types";

export const LLM_MODELS_PATH = "/api/v1/admin/llm-settings/models";

// A plain browser read through the web proxy, not a Server Action: Next runs Server Actions one
// after another per tab, so a slow provider would hold up every save behind the picker.
export async function fetchLLMModels(
    signal: AbortSignal,
    provider?: string,
): Promise<LLMSettingsActionResult<LLMModelListResponse>> {
    const url = provider
        ? `${LLM_MODELS_PATH}?provider=${encodeURIComponent(provider)}`
        : LLM_MODELS_PATH;
    const response = await fetch(url, {
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
