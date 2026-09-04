import { request } from "./_request";
import type {
    AskDevAdminResponse,
    AskDevAdminSettingsPatch,
    AskDevAdminUsageResponse,
} from "../types";

export const askDevAdminApi = {
    get: (token?: string, orgId?: string) =>
        request<AskDevAdminResponse>("/ask-dev", {}, token, orgId),

    updateSettings: (data: AskDevAdminSettingsPatch, token?: string, orgId?: string) =>
        request<AskDevAdminResponse>(
            "/ask-dev/settings",
            { method: "PATCH", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    // NOTE (CHAOS-3265): `POST /ask-dev/readiness` was removed entirely — the
    // org surface no longer exposes any platform-provider preflight action.
    // Platform preflight now lives under `platformApi.askDevReadiness`;
    // BYO preflight now lives under `llmSettingsApi.runReadiness`.

    usage: (since?: string, token?: string, orgId?: string) => {
        const query = since ? `?since=${encodeURIComponent(since)}` : "";
        return request<AskDevAdminUsageResponse>(`/ask-dev/usage${query}`, {}, token, orgId);
    },
};
