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

    runReadiness: (token?: string, orgId?: string) =>
        request<AskDevAdminResponse>("/ask-dev/readiness", { method: "POST" }, token, orgId),

    usage: (since?: string, token?: string, orgId?: string) => {
        const query = since ? `?since=${encodeURIComponent(since)}` : "";
        return request<AskDevAdminUsageResponse>(`/ask-dev/usage${query}`, {}, token, orgId);
    },
};
