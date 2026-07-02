import { request } from "./_request";
import type {
    CustomerPushSource,
    CustomerPushSourceCreate,
    CustomerPushSourceUpdate,
    CustomerPushToken,
    CustomerPushTokenCreate,
    CustomerPushTokenCreateResponse,
    CustomerPushBatchDetail,
    CustomerPushBatchListParams,
    CustomerPushBatchListResponse,
    CustomerPushValidateResponse,
    CustomerPushSchemaListResponse,
    CustomerPushSchemaDetailResponse,
} from "../types";

export const customerPushApi = {
    /**
     * GET /customer-push/sources has NO server-side system filter — it
     * always returns every source for the org. Callers that need
     * per-provider scoping must filter client-side (see
     * server/customer-push.ts).
     */
    listSources: (token?: string, orgId?: string) =>
        request<CustomerPushSource[]>("/customer-push/sources", {}, token, orgId),

    createSource: (data: CustomerPushSourceCreate, token?: string, orgId?: string) =>
        request<CustomerPushSource>(
            "/customer-push/sources",
            { method: "POST", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    getSource: (sourceId: string, token?: string, orgId?: string) =>
        request<CustomerPushSource>(`/customer-push/sources/${sourceId}`, {}, token, orgId),

    updateSource: (
        sourceId: string,
        data: CustomerPushSourceUpdate,
        token?: string,
        orgId?: string,
    ) =>
        request<CustomerPushSource>(
            `/customer-push/sources/${sourceId}`,
            { method: "PATCH", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    listTokens: (sourceId: string, token?: string, orgId?: string) =>
        request<CustomerPushToken[]>(`/customer-push/sources/${sourceId}/tokens`, {}, token, orgId),

    createToken: (
        sourceId: string,
        data: CustomerPushTokenCreate,
        token?: string,
        orgId?: string,
    ) =>
        request<CustomerPushTokenCreateResponse>(
            `/customer-push/sources/${sourceId}/tokens`,
            { method: "POST", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    rotateToken: (tokenId: string, token?: string, orgId?: string) =>
        request<CustomerPushTokenCreateResponse>(
            `/customer-push/tokens/${tokenId}/rotate`,
            { method: "POST" },
            token,
            orgId,
        ),

    revokeToken: (tokenId: string, token?: string, orgId?: string) =>
        request<CustomerPushToken>(
            `/customer-push/tokens/${tokenId}/revoke`,
            { method: "POST" },
            token,
            orgId,
        ),

    listBatches: (
        sourceId: string,
        params: CustomerPushBatchListParams,
        token?: string,
        orgId?: string,
    ) => {
        const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
        const qs = new URLSearchParams(entries as [string, string][]).toString();
        return request<CustomerPushBatchListResponse>(
            `/customer-push/sources/${sourceId}/batches${qs ? `?${qs}` : ""}`,
            {},
            token,
            orgId,
        );
    },

    getBatch: (ingestionId: string, token?: string, orgId?: string) =>
        request<CustomerPushBatchDetail>(`/customer-push/batches/${ingestionId}`, {}, token, orgId),

    listSchemas: (token?: string, orgId?: string) =>
        request<CustomerPushSchemaListResponse>("/customer-push/schemas", {}, token, orgId),

    getSchema: (version: string, token?: string, orgId?: string) =>
        request<CustomerPushSchemaDetailResponse>(
            `/customer-push/schemas/${encodeURIComponent(version)}`,
            {},
            token,
            orgId,
        ),

    validate: (sourceId: string, envelope: unknown, token?: string, orgId?: string) =>
        request<CustomerPushValidateResponse>(
            `/customer-push/sources/${sourceId}/validate`,
            { method: "POST", body: JSON.stringify(envelope) },
            token,
            orgId,
        ),
};
