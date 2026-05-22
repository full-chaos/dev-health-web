import { request } from "./_request";
import type {
  TeamMapping,
  TeamMappingCreate,
  TeamMappingUpdate,
  TeamDiscoverResponse,
  TeamImportRequest,
  TeamImportResponse,
  PendingChangesResponse,
} from "../types";

export const teamsApi = {
  list: (token?: string, orgId?: string) => request<TeamMapping[]>("/teams", {}, token, orgId),

  get: (teamId: string, token?: string, orgId?: string) =>
    request<TeamMapping>(`/teams/${teamId}`, {}, token, orgId),

  create: (data: TeamMappingCreate, token?: string, orgId?: string) =>
    request<TeamMapping>("/teams", { method: "POST", body: JSON.stringify(data) }, token, orgId),

  update: (teamId: string, data: TeamMappingUpdate, token?: string, orgId?: string) =>
    request<TeamMapping>(
      `/teams/${teamId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
      orgId,
    ),

  delete: (teamId: string, token?: string, orgId?: string) =>
    request<void>(`/teams/${teamId}`, { method: "DELETE" }, token, orgId),

  discover: (provider: string, token?: string, orgId?: string) =>
    request<TeamDiscoverResponse>(`/teams/discover?provider=${provider}`, {}, token, orgId),

  import: (data: TeamImportRequest, token?: string, orgId?: string) =>
    request<TeamImportResponse>(
      "/teams/import",
      { method: "POST", body: JSON.stringify(data) },
      token,
      orgId,
    ),

  pendingChanges: (token?: string, orgId?: string) =>
    request<PendingChangesResponse>("/teams/pending-changes", {}, token, orgId),

  approveChanges: (
    teamId: string,
    changeIndices?: number[],
    approveAll = false,
    token?: string,
    orgId?: string,
  ) =>
    request<{ approved: number }>(
      `/teams/${teamId}/approve-changes`,
      {
        method: "POST",
        body: JSON.stringify({
          change_indices: changeIndices,
          approve_all: approveAll,
        }),
      },
      token,
      orgId,
    ),

  dismissChanges: (
    teamId: string,
    changeIndices?: number[],
    dismissAll = false,
    token?: string,
    orgId?: string,
  ) =>
    request<{ dismissed: number }>(
      `/teams/${teamId}/dismiss-changes`,
      {
        method: "POST",
        body: JSON.stringify({
          change_indices: changeIndices,
          dismiss_all: dismissAll,
        }),
      },
      token,
      orgId,
    ),

  triggerDriftSync: (token?: string, orgId?: string) =>
    request<{ status: string }>("/teams/trigger-drift-sync", { method: "POST" }, token, orgId),
};
