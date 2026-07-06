import { request } from "./_request";
import type { LLMSettingsResponse, LLMSettingsStatusResponse, LLMSettingsUpsert } from "../types";

// Admin BYO-LLM settings endpoints. The backend force-encrypts and masks the
// api_key, and tier/flag gates GET/PUT (402/403) while always allowing DELETE
// cleanup. See ops admin/routers/settings.py for the contract.
export const llmSettingsApi = {
    get: (token?: string, orgId?: string) =>
        request<LLMSettingsResponse>("/llm-settings", {}, token, orgId),

    upsert: (data: LLMSettingsUpsert, token?: string, orgId?: string) =>
        request<LLMSettingsResponse>(
            "/llm-settings",
            { method: "PUT", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    remove: (token?: string, orgId?: string) =>
        request<{ deleted: boolean }>("/llm-settings", { method: "DELETE" }, token, orgId),

    // Pure status evaluator (CHAOS-2560, plan correction C2) — no AuditLog side
    // effects. Backend is being built on a sibling branch; callers must treat a
    // failure as "unknown" and degrade gracefully rather than blocking the UI.
    status: (token?: string, orgId?: string) =>
        request<LLMSettingsStatusResponse>("/llm-settings/status", {}, token, orgId),
};
