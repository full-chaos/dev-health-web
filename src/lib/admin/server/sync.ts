"use server";

import { adminApi } from "../api";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import type {
    SyncConfig,
    SyncConfigCreate,
    SyncConfigUpdate,
    SyncJob,
    BackfillResponse,
    BackfillJob,
    DiscoveredReposResponse,
    SyncConfigBatchCreate,
    SyncConfigBatchResponse,
} from "../types";
import { getSessionContext, withErrorHandling } from "./_shared";

export async function listSyncConfigs(): Promise<ActionResult<SyncConfig[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.syncConfigs.list(token, orgId);
    });
}

export async function createSyncConfig(data: SyncConfigCreate): Promise<ActionResult<SyncConfig>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.syncConfigs.create(data, token, orgId);
        revalidatePath("/org/admin/sync");
        return result;
    });
}

export async function listReposForCredential(
    credentialId: string,
    owner: string,
): Promise<ActionResult<DiscoveredReposResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.credentials.listRepos(credentialId, owner, token, orgId);
    });
}

export async function batchCreateSyncConfigs(
    data: SyncConfigBatchCreate | { base: Omit<SyncConfigBatchCreate, "repos">; repos: string[] },
): Promise<ActionResult<SyncConfigBatchResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        // Normalize: accept both flat { name, provider, repos } and nested { base: {...}, repos }
        const normalized: SyncConfigBatchCreate =
            "base" in data ? { ...data.base, repos: data.repos } : data;
        const result = await adminApi.syncConfigs.batchCreate(normalized, token, orgId);
        revalidatePath("/org/admin/sync");
        return result;
    });
}

export async function getSyncConfig(id: string): Promise<ActionResult<SyncConfig>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.syncConfigs.get(id, token, orgId);
    });
}

export async function updateSyncConfig(
    id: string,
    data: SyncConfigUpdate,
): Promise<ActionResult<SyncConfig>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.syncConfigs.update(id, data, token, orgId);
        revalidatePath("/org/admin/sync");
        revalidatePath(`/org/admin/sync/${id}`);
        return result;
    });
}

export async function triggerBackfill(
    configId: string,
    since: string,
    before: string,
): Promise<ActionResult<BackfillResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const res = await adminApi.syncConfigs.backfill(configId, { since, before }, token, orgId);
        revalidatePath("/org/admin/sync");
        return res;
    });
}

export async function getBackfillJobStatus(jobId: string): Promise<ActionResult<BackfillJob>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return await adminApi.syncConfigs.getBackfillJob(jobId, token, orgId);
    });
}

export async function deleteSyncConfig(id: string): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.syncConfigs.delete(id, token, orgId);
        revalidatePath("/org/admin/sync");
        return result;
    });
}

export async function triggerSync(id: string): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.syncConfigs.trigger(id, token, orgId);
        revalidatePath("/org/admin/sync");
        revalidatePath(`/org/admin/sync/${id}`);
        return result;
    });
}

export async function getSyncJobs(id: string): Promise<ActionResult<SyncJob[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.syncConfigs.jobs(id, token, orgId);
    });
}

export async function toggleSyncActive(
    id: string,
    isActive: boolean,
): Promise<ActionResult<SyncConfig>> {
    return updateSyncConfig(id, { is_active: isActive });
}
