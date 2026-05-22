import { request } from "./_request";
import type {
  SyncConfig,
  SyncConfigCreate,
  SyncConfigUpdate,
  SyncJob,
  BackfillResponse,
  BackfillJob,
  SyncConfigBatchCreate,
  SyncConfigBatchResponse,
} from "../types";

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

  delete: (id: string, token?: string, orgId?: string) =>
    request<void>(`/sync-configs/${id}`, { method: "DELETE" }, token, orgId),

  trigger: (id: string, token?: string, orgId?: string) =>
    request<void>(`/sync-configs/${id}/trigger`, { method: "POST" }, token, orgId),

  backfill: (id: string, data: { since: string; before: string }, token?: string, orgId?: string) =>
    request<BackfillResponse>(
      `/sync-configs/${id}/backfill`,
      { method: "POST", body: JSON.stringify(data) },
      token,
      orgId,
    ),

  getBackfillJob: (jobId: string, token?: string, orgId?: string) =>
    request<BackfillJob>(`/backfill-jobs/${jobId}`, { method: "GET" }, token, orgId),

  jobs: (id: string, token?: string, orgId?: string) =>
    request<SyncJob[]>(`/sync-configs/${id}/jobs`, {}, token, orgId),

  batchCreate: (data: SyncConfigBatchCreate, token?: string, orgId?: string) =>
    request<SyncConfigBatchResponse>(
      "/sync-configs/batch",
      { method: "POST", body: JSON.stringify(data) },
      token,
      orgId,
    ),
};
