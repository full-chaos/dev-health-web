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
    SyncConfigRepositorySelection,
    SyncConfigRepositorySelectionUpdate,
    SyncTriggerResult,
    SyncRun,
    SyncRunUnitSummary,
    SyncCoverageSummary,
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

export async function getSyncConfigRepositories(
    id: string,
): Promise<ActionResult<SyncConfigRepositorySelection>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.syncConfigs.getRepositories(id, token, orgId);
    });
}

export async function updateSyncConfigRepositories(
    id: string,
    data: SyncConfigRepositorySelectionUpdate,
): Promise<ActionResult<SyncConfigRepositorySelection>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.syncConfigs.updateRepositories(id, data, token, orgId);
        revalidatePath("/org/admin/sync");
        revalidatePath(`/org/admin/sync/${id}`);
        revalidatePath(`/org/admin/sync/${id}/edit`);
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
        revalidatePath(`/org/admin/sync/${configId}`);
        return res;
    });
}

/**
 * Non-terminal BackfillJob statuses — mirrors BackfillStatus's isTerminal check.
 * Fanout backfills report the planner's SyncRun lifecycle (planned →
 * dispatching → running → success | partial_failed | failed); the legacy
 * per-chunk BackfillJob path reports pending | running | completed | failed.
 * Both families are treated as active here since the persisted status field
 * is a plain string mirrored verbatim from whichever backend path handled the
 * request (see ops routers/sync.py ~L539/584, sync/planner.py ~L161,
 * models/integrations.py ~L38).
 */
const ACTIVE_BACKFILL_STATUSES = new Set(["pending", "planned", "dispatching", "running"]);

/**
 * Discover a persisted in-progress backfill for `configId` so its status
 * survives navigation (CHAOS-2795). The `/backfill-jobs` endpoint has no
 * server-side sync_config_id filter, so this fetches the most recent org-wide
 * page (newest first) and filters client-side — a long-running backfill
 * buried past the page size would be missed, an accepted limitation of the
 * existing API surface.
 */
export async function getActiveBackfillJob(
    configId: string,
): Promise<ActionResult<BackfillJob | null>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.syncConfigs.listBackfillJobs(token, orgId, { limit: 50 });
        const active = result.items.find(
            (job) => job.sync_config_id === configId && ACTIVE_BACKFILL_STATUSES.has(job.status),
        );
        return active ?? null;
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

export async function triggerSync(id: string): Promise<ActionResult<SyncTriggerResult>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.syncConfigs.trigger(id, token, orgId);
        revalidatePath("/org/admin/sync");
        revalidatePath(`/org/admin/sync/${id}`);
        return result;
    });
}

export async function getSyncRunStatus(runId: string): Promise<ActionResult<SyncRun>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.syncConfigs.getSyncRun(runId, token, orgId);
    });
}

export async function getSyncRunUnits(runId: string): Promise<ActionResult<SyncRunUnitSummary>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.syncConfigs.getSyncRunUnits(runId, token, orgId);
    });
}

export async function getSyncCoverage(id: string): Promise<ActionResult<SyncCoverageSummary>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.syncConfigs.getSyncCoverage(id, token, orgId);
    });
}

export async function getSyncJobs(
    id: string,
    limit?: number,
    offset?: number,
): Promise<ActionResult<SyncJob[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.syncConfigs.jobs(id, token, orgId, { limit, offset });
    });
}

export async function toggleSyncActive(
    id: string,
    isActive: boolean,
): Promise<ActionResult<SyncConfig>> {
    return updateSyncConfig(id, { is_active: isActive });
}
