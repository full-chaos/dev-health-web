import { request } from "./_request";
import type {
    SyncConfig,
    SyncConfigCreate,
    SyncConfigUpdate,
    SyncJob,
    BackfillResponse,
    BackfillJob,
    BackfillJobListResponse,
    SyncConfigBatchCreate,
    SyncConfigBatchResponse,
    SyncConfigRepositorySelection,
    SyncConfigRepositorySelectionUpdate,
    SyncTriggerResult,
    SyncRun,
    SyncRunUnitSummary,
    SyncCoverageSummary,
} from "../types";

export interface SyncJobsListParams {
    limit?: number;
    offset?: number;
}

function jobListPath(id: string, params: SyncJobsListParams = {}): string {
    const query = new URLSearchParams({
        limit: String(params.limit ?? 50),
        offset: String(params.offset ?? 0),
    });
    return `/sync-configs/${id}/jobs?${query.toString()}`;
}

export const syncConfigsApi = {
    list: (token?: string, orgId?: string) =>
        request<SyncConfig[]>("/sync-configs", {}, token, orgId),

    get: (id: string, token?: string, orgId?: string) =>
        request<SyncConfig>(`/sync-configs/${id}`, {}, token, orgId),

    create: (data: SyncConfigCreate, token?: string, orgId?: string) =>
        request<SyncConfig>(
            "/sync-configs",
            { method: "POST", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    update: (id: string, data: SyncConfigUpdate, token?: string, orgId?: string) =>
        request<SyncConfig>(
            `/sync-configs/${id}`,
            { method: "PATCH", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    getRepositories: (id: string, token?: string, orgId?: string) =>
        request<SyncConfigRepositorySelection>(
            `/sync-configs/${id}/repositories`,
            {},
            token,
            orgId,
        ),

    updateRepositories: (
        id: string,
        data: SyncConfigRepositorySelectionUpdate,
        token?: string,
        orgId?: string,
    ) =>
        request<SyncConfigRepositorySelection>(
            `/sync-configs/${id}/repositories`,
            { method: "PUT", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    delete: (id: string, token?: string, orgId?: string) =>
        request<void>(`/sync-configs/${id}`, { method: "DELETE" }, token, orgId),

    trigger: (id: string, token?: string, orgId?: string) =>
        request<SyncTriggerResult>(`/sync-configs/${id}/trigger`, { method: "POST" }, token, orgId),

    getSyncRun: (runId: string, token?: string, orgId?: string) =>
        request<SyncRun>(`/sync-runs/${runId}`, { method: "GET" }, token, orgId),

    getSyncRunUnits: (runId: string, token?: string, orgId?: string) =>
        request<SyncRunUnitSummary>(`/sync-runs/${runId}/units`, { method: "GET" }, token, orgId),

    getSyncCoverage: (id: string, token?: string, orgId?: string) =>
        request<SyncCoverageSummary>(
            `/sync-configs/${id}/coverage`,
            { method: "GET" },
            token,
            orgId,
        ),

    backfill: (
        id: string,
        data: { since: string; before: string },
        token?: string,
        orgId?: string,
    ) =>
        request<BackfillResponse>(
            `/sync-configs/${id}/backfill`,
            { method: "POST", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    getBackfillJob: (jobId: string, token?: string, orgId?: string) =>
        request<BackfillJob>(`/backfill-jobs/${jobId}`, { method: "GET" }, token, orgId),

    /**
     * List backfill jobs org-wide (newest first, no server-side sync_config_id
     * filter today — callers filter client-side, per admin/routers/sync.py's
     * `GET /backfill-jobs`). Used to discover a persisted in-progress backfill
     * for a config so its status survives navigation (CHAOS-2795).
     */
    listBackfillJobs: (token?: string, orgId?: string, params: SyncJobsListParams = {}) =>
        request<BackfillJobListResponse>(
            `/backfill-jobs?${new URLSearchParams({
                limit: String(params.limit ?? 50),
                offset: String(params.offset ?? 0),
            }).toString()}`,
            { method: "GET" },
            token,
            orgId,
        ),

    jobs: (id: string, token?: string, orgId?: string, params?: SyncJobsListParams) =>
        request<SyncJob[]>(jobListPath(id, params), {}, token, orgId),

    batchCreate: (data: SyncConfigBatchCreate, token?: string, orgId?: string) =>
        request<SyncConfigBatchResponse>(
            "/sync-configs/batch",
            { method: "POST", body: JSON.stringify(data) },
            token,
            orgId,
        ),
};
