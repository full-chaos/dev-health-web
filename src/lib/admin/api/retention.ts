import { request } from "./_request";
import type {
    RetentionPolicy,
    RetentionPolicyCreate,
    RetentionPolicyUpdate,
    RetentionPolicyListResponse,
    RetentionExecuteResponse,
} from "../types";

export const retentionApi = {
    list: (limit = 50, offset = 0, token?: string, orgId?: string) =>
        request<RetentionPolicyListResponse>(
            `/retention-policies?limit=${limit}&offset=${offset}`,
            {},
            token,
            orgId,
        ),

    get: (id: string, token?: string, orgId?: string) =>
        request<RetentionPolicy>(`/retention-policies/${id}`, {}, token, orgId),

    create: (data: RetentionPolicyCreate, token?: string, orgId?: string) =>
        request<RetentionPolicy>(
            "/retention-policies",
            { method: "POST", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    update: (id: string, data: RetentionPolicyUpdate, token?: string, orgId?: string) =>
        request<RetentionPolicy>(
            `/retention-policies/${id}`,
            { method: "PATCH", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    delete: (id: string, token?: string, orgId?: string) =>
        request<void>(`/retention-policies/${id}`, { method: "DELETE" }, token, orgId),

    execute: (id: string, dryRun = true, token?: string, orgId?: string) =>
        request<RetentionExecuteResponse>(
            `/retention-policies/${id}/execute`,
            { method: "POST", body: JSON.stringify({ dry_run: dryRun }) },
            token,
            orgId,
        ),

    resourceTypes: (token?: string, orgId?: string) =>
        request<string[]>("/retention-policies/resource-types", {}, token, orgId),
};
