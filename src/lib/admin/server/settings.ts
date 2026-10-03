"use server";

import { failureFromError } from "@/lib/actionFailure";
import { adminApi } from "../api";
import { AdminApiError } from "../api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getClientIpFromEnv } from "@/lib/client-ip";
import { getServerEnv } from "@/lib/config";
import type { ActionResult } from "@/lib/result";
import type {
    Setting,
    SettingCreate,
    SettingUpdate,
    IPAllowlist,
    IPAllowlistCreate,
    IPAllowlistUpdate,
    IPAllowlistListResponse,
    IPCheckResponse,
    RetentionPolicy,
    RetentionPolicyCreate,
    RetentionPolicyUpdate,
    RetentionPolicyListResponse,
    RetentionExecuteResponse,
    LLMSettingsResponse,
    LLMSettingsStatusResponse,
    LLMSettingsUpsert,
    LLMSettingsActionResult,
    LLMBudgetResponse,
    LLMSpendSummaryResponse,
} from "../types";
import { getSessionContext, withErrorHandling } from "./_shared";

// ---- Settings ----

export async function listSettingCategories(): Promise<ActionResult<string[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.settings.listCategories(token, orgId);
    });
}

export async function listSettings(category: string): Promise<ActionResult<Setting[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const response = await adminApi.settings.listByCategory(category, token, orgId);
        return response.settings;
    });
}

export async function createSetting(data: SettingCreate): Promise<ActionResult<Setting>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.settings.create(data, token, orgId);
    });
}

export async function updateSetting(
    category: string,
    key: string,
    data: SettingUpdate,
): Promise<ActionResult<Setting>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.settings.update(category, key, data, token, orgId);
    });
}

export async function deleteSetting(category: string, key: string): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.settings.delete(category, key, token, orgId);
    });
}

export async function getSecuritySettings(): Promise<ActionResult<Setting[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const response = await adminApi.settings.listByCategory("security", token, orgId);
        return response.settings;
    });
}

export async function updateSecuritySetting(
    key: string,
    value: string,
): Promise<ActionResult<Setting>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.settings.update("security", key, { value }, token, orgId);
    });
}

// ---- IP Allowlist ----

export async function listIPAllowlistEntries(
    limit?: number,
    offset?: number,
): Promise<ActionResult<IPAllowlistListResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.ipAllowlist.list(limit ?? 50, offset ?? 0, token, orgId);
    });
}

export async function createIPAllowlistEntry(
    data: IPAllowlistCreate,
): Promise<ActionResult<IPAllowlist>> {
    return withHttpStatus(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.ipAllowlist.create(data, token, orgId);
        revalidatePath("/org/admin/ip-allowlist");
        return result;
    });
}

export async function updateIPAllowlistEntry(
    id: string,
    data: IPAllowlistUpdate,
): Promise<ActionResult<IPAllowlist>> {
    return withHttpStatus(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.ipAllowlist.update(id, data, token, orgId);
        revalidatePath("/org/admin/ip-allowlist");
        return result;
    });
}

export async function deleteIPAllowlistEntry(id: string): Promise<ActionResult<void>> {
    return withHttpStatus(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.ipAllowlist.delete(id, token, orgId);
        revalidatePath("/org/admin/ip-allowlist");
        return result;
    });
}

export async function checkIPAllowed(ipAddress: string): Promise<ActionResult<IPCheckResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.ipAllowlist.check(ipAddress, token, orgId);
    });
}

/**
 * Best-effort detection of the requesting admin's own client IP (CHAOS-2842),
 * derived the same way as rate limiting (`getClientIpFromEnv`: `TRUST_PROXY` + `TRUSTED_PROXY_HOPS`) so it
 * reflects what the backend itself would see. Used only to warn admins before
 * they save an IP allowlist rule that would exclude their own current IP —
 * never treated as an authoritative allow/deny decision.
 */
export async function getCurrentClientIp(): Promise<ActionResult<string>> {
    return withErrorHandling(async () => {
        await getSessionContext();
        const requestHeaders = await headers();
        return getClientIpFromEnv({ headers: requestHeaders }, getServerEnv());
    });
}

// ---- Data Retention Policies ----

export async function listRetentionPolicies(
    limit?: number,
    offset?: number,
): Promise<ActionResult<RetentionPolicyListResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.retention.list(limit ?? 50, offset ?? 0, token, orgId);
    });
}

export async function createRetentionPolicy(
    data: RetentionPolicyCreate,
): Promise<ActionResult<RetentionPolicy>> {
    return withHttpStatus(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.retention.create(data, token, orgId);
        revalidatePath("/org/admin/retention");
        return result;
    });
}

export async function updateRetentionPolicy(
    id: string,
    data: RetentionPolicyUpdate,
): Promise<ActionResult<RetentionPolicy>> {
    return withHttpStatus(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.retention.update(id, data, token, orgId);
        revalidatePath("/org/admin/retention");
        return result;
    });
}

export async function deleteRetentionPolicy(id: string): Promise<ActionResult<void>> {
    return withHttpStatus(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.retention.delete(id, token, orgId);
        revalidatePath("/org/admin/retention");
        return result;
    });
}

export async function executeRetentionPolicy(
    id: string,
    dryRun = true,
): Promise<ActionResult<RetentionExecuteResponse>> {
    return withHttpStatus(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.retention.execute(id, dryRun, token, orgId);
    });
}

export async function listRetentionResourceTypes(): Promise<ActionResult<string[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.retention.resourceTypes(token, orgId);
    });
}

// ---- BYO LLM Settings ----
// These actions preserve the HTTP status so the page can render a locked/upsell
// state for tier/flag gating (402/403) and an inline field error for base_url
// validation (400), rather than collapsing everything into a generic message.

async function withStatusErrorHandling<T>(
    fn: () => Promise<T>,
): Promise<LLMSettingsActionResult<T>> {
    try {
        return { data: await fn() };
    } catch (err) {
        return failureFromError("withStatusErrorHandling", err);
    }
}

export async function getLLMSettings(): Promise<LLMSettingsActionResult<LLMSettingsResponse>> {
    return withStatusErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.llmSettings.get(token, orgId);
    });
}

/**
 * BYO-LLM status badge read (CHAOS-2560/2565). Pure evaluator, no side
 * effects on the GET. The backend endpoint is being built on a sibling
 * branch (CHAOS-2560); callers must treat any error here as "unknown" and
 * fall back to settings-derived wording rather than surfacing it as a hard
 * failure.
 */
export async function getLLMSettingsStatus(): Promise<
    LLMSettingsActionResult<LLMSettingsStatusResponse>
> {
    return withStatusErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.llmSettings.status(token, orgId);
    });
}

/**
 * Enforceable BYO-LLM organization budget status. Unlike the historical spend
 * summary this includes active reservations and is the admission-control view.
 */
export async function getLLMBudget(): Promise<LLMSettingsActionResult<LLMBudgetResponse>> {
    return withStatusErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.llmSettings.budget(token, orgId);
    });
}

export async function upsertLLMSettings(
    data: LLMSettingsUpsert,
): Promise<LLMSettingsActionResult<LLMSettingsResponse>> {
    return withStatusErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.llmSettings.upsert(data, token, orgId);
        revalidatePath("/org/admin/ai");
        return result;
    });
}

export async function deleteLLMSettings(): Promise<LLMSettingsActionResult<{ deleted: boolean }>> {
    return withStatusErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.llmSettings.remove(token, orgId);
        revalidatePath("/org/admin/ai");
        return result;
    });
}

/**
 * Runs the BYO preflight against the saved configuration (CHAOS-3265).
 * Independent of Ask Dev's provider-selection arbitration — gated only on a
 * saved BYO configuration existing (the backend 404s otherwise), never on
 * whether BYO currently wins Ask Dev's arbitration.
 */
export async function runLLMSettingsReadiness(): Promise<
    LLMSettingsActionResult<LLMSettingsStatusResponse>
> {
    return withStatusErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.llmSettings.runReadiness(token, orgId);
        revalidatePath("/org/admin/ai/byo-llm");
        return result;
    });
}

// Org-scoped per-run spend summary (CHAOS-2564). Uses withStatusErrorHandling
// (not the generic withErrorHandling) so a tier/flag gate (402/403) surfaces
// as a distinguishable locked state rather than a generic load error.
export async function getLLMSpendSummary(): Promise<
    LLMSettingsActionResult<LLMSpendSummaryResponse>
> {
    return withStatusErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.llmSettings.spend(token, orgId);
    });
}

// ---- IP allowlist and retention: mutations that report the HTTP status ----
// The pages show the served text only for a validation answer (a 4xx, for example a bad CIDR) and
// one plain sentence for a 5xx or a network failure, so these results carry `status` (CHAOS-8239).

async function withHttpStatus<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
    try {
        return { data: await fn() };
    } catch (err) {
        return failureFromError("withHttpStatus", err);
    }
}
