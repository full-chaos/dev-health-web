import { request } from "./_request";
import type {
    LLMBudgetResponse,
    LLMSettingsResponse,
    LLMSettingsStatusResponse,
    LLMSettingsUpsert,
    LLMSpendSummaryResponse,
} from "../types";

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

    // Org-scoped per-run spend summary (CHAOS-2564). Tier/flag-gated the same
    // way as the settings CRUD above (402/403); see admin/routers/settings.py.
    spend: (token?: string, orgId?: string) =>
        request<LLMSpendSummaryResponse>("/llm-settings/spend", {}, token, orgId),

    // Pure status evaluator (CHAOS-2560, plan correction C2) — no AuditLog side
    // effects. Callers must treat a failure as "unknown" and degrade gracefully
    // rather than blocking the UI.
    status: (token?: string, orgId?: string) =>
        request<LLMSettingsStatusResponse>("/llm-settings/status", {}, token, orgId),

    // Runs the BYO preflight against the saved configuration (CHAOS-3265).
    // Independent of Ask Dev's provider-selection arbitration — gated only on
    // a saved BYO configuration existing (404 otherwise), never on `active`.
    runReadiness: (token?: string, orgId?: string) =>
        request<LLMSettingsStatusResponse>(
            "/llm-settings/readiness",
            { method: "POST" },
            token,
            orgId,
        ),

    // Enforceable calendar-month organization ceiling. This is intentionally
    // separate from the ClickHouse spend-summary endpoint: active reservations
    // participate in admission before provider calls complete.
    budget: (token?: string, orgId?: string) =>
        request<LLMBudgetResponse>("/llm-settings/budget", {}, token, orgId),
};
