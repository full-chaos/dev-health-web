"use server";

import { adminApi } from "../api";
import { revalidatePath } from "next/cache";
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
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.ipAllowlist.create(data, token, orgId);
    revalidatePath("/admin/ip-allowlist");
    return result;
  });
}

export async function updateIPAllowlistEntry(
  id: string,
  data: IPAllowlistUpdate,
): Promise<ActionResult<IPAllowlist>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.ipAllowlist.update(id, data, token, orgId);
    revalidatePath("/admin/ip-allowlist");
    return result;
  });
}

export async function deleteIPAllowlistEntry(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.ipAllowlist.delete(id, token, orgId);
    revalidatePath("/admin/ip-allowlist");
    return result;
  });
}

export async function checkIPAllowed(ipAddress: string): Promise<ActionResult<IPCheckResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.ipAllowlist.check(ipAddress, token, orgId);
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
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.retention.create(data, token, orgId);
    revalidatePath("/admin/retention");
    return result;
  });
}

export async function updateRetentionPolicy(
  id: string,
  data: RetentionPolicyUpdate,
): Promise<ActionResult<RetentionPolicy>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.retention.update(id, data, token, orgId);
    revalidatePath("/admin/retention");
    return result;
  });
}

export async function deleteRetentionPolicy(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.retention.delete(id, token, orgId);
    revalidatePath("/admin/retention");
    return result;
  });
}

export async function executeRetentionPolicy(
  id: string,
  dryRun = true,
): Promise<ActionResult<RetentionExecuteResponse>> {
  return withErrorHandling(async () => {
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
