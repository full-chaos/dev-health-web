import { request } from "./_request";
import type {
    LLMPurpose,
    LLMPurposeSettings,
    LLMPurposeUpsert,
    LLMBudgetResponse,
    LLMSettingsResponse,
    LLMSettingsStatusResponse,
    LLMSettingsUpsert,
    LLMSpendSummaryResponse,
} from "../types";

/** GET/PUT /llm-settings/own-model: whether the saved BYO config is in use; `configured` = a config is saved. */
export interface OwnModelSetting {
    enabled: boolean;
    configured: boolean;
}

/** GET/PUT /llm-settings/prompt-cache: the org's opt-in to the Anthropic prompt cache; `anthropic` = the saved config Ask Dev uses is on that provider. */
export interface PromptCacheSetting {
    enabled: boolean;
    configured: boolean;
    anthropic: boolean;
}

/** GET/PUT /llm-settings/service-model: the org's on/off for ACR AI features (acr_service_model). */
export interface ServiceModelSetting {
    feature: "acr_service_model";
    enabled: boolean;
    eligible: boolean;
    ineligible_reason:
        "feature_not_registered" | "tier_required" | "agent_context_runtime_required" | null;
    /** "managed": billing or support set it; the toggle answers 409 and only support can change it. */
    control: "none" | "self_service" | "managed";
    override: boolean | null;
    required_tier: string;
    current_tier: string;
}

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

    upsertPurpose: (data: LLMPurposeUpsert, token?: string, orgId?: string) =>
        request<LLMPurposeSettings>(
            "/llm-settings",
            { method: "PUT", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    removePurpose: (purpose: LLMPurpose, token?: string, orgId?: string) =>
        request<{ deleted: boolean; purpose: string }>(
            `/llm-settings?purpose=${encodeURIComponent(purpose)}`,
            { method: "DELETE" },
            token,
            orgId,
        ),

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

    ownModel: (token?: string, orgId?: string) =>
        request<OwnModelSetting>("/llm-settings/own-model", {}, token, orgId),

    setOwnModel: (enabled: boolean, token?: string, orgId?: string) =>
        request<OwnModelSetting>(
            "/llm-settings/own-model",
            { method: "PUT", body: JSON.stringify({ enabled }) },
            token,
            orgId,
        ),

    promptCache: (token?: string, orgId?: string) =>
        request<PromptCacheSetting>("/llm-settings/prompt-cache", {}, token, orgId),

    setPromptCache: (enabled: boolean, token?: string, orgId?: string) =>
        request<PromptCacheSetting>(
            "/llm-settings/prompt-cache",
            { method: "PUT", body: JSON.stringify({ enabled }) },
            token,
            orgId,
        ),

    serviceModel: (token?: string, orgId?: string) =>
        request<ServiceModelSetting>("/llm-settings/service-model", {}, token, orgId),

    setServiceModel: (enabled: boolean, token?: string, orgId?: string) =>
        request<ServiceModelSetting>(
            "/llm-settings/service-model",
            { method: "PUT", body: JSON.stringify({ enabled }) },
            token,
            orgId,
        ),
};
