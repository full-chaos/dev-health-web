import { request } from "./_request";
import type { AuditLogListResponse, AuditLogFilter } from "../types";

export const auditApi = {
    list: (filters?: AuditLogFilter, limit = 50, offset = 0, token?: string, orgId?: string) => {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
                if (value != null) params.set(key, String(value));
            });
        }
        return request<AuditLogListResponse>(`/audit-logs?${params.toString()}`, {}, token, orgId);
    },

    get: (id: string, token?: string, orgId?: string) =>
        request<AuditLogListResponse["items"][0]>(`/audit-logs/${id}`, {}, token, orgId),
};

export const platformAuditApi = {
    list: (
        filters?: AuditLogFilter,
        limit?: number,
        offset?: number,
        token?: string,
        orgId?: string,
    ) => {
        const params = new URLSearchParams();
        if (limit) params.set("limit", String(limit));
        if (offset) params.set("offset", String(offset));
        if (filters) {
            Object.entries(filters).forEach(([k, v]) => {
                if (v != null) params.set(k, String(v));
            });
        }
        return request<AuditLogListResponse>(
            `/platform/audit-logs?${params.toString()}`,
            {},
            token,
            orgId,
        );
    },
};
