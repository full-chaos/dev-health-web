import { request } from "./_request";
import type { IdentityMapping, IdentityMappingCreate, IdentityMappingUpdate } from "../types";

export const identitiesApi = {
    list: (token?: string, orgId?: string) =>
        request<IdentityMapping[]>("/identities", {}, token, orgId),

    get: (id: string, token?: string, orgId?: string) =>
        request<IdentityMapping>(`/identities/${id}`, {}, token, orgId),

    create: (data: IdentityMappingCreate, token?: string, orgId?: string) =>
        request<IdentityMapping>(
            "/identities",
            { method: "POST", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    update: (id: string, data: IdentityMappingUpdate, token?: string, orgId?: string) =>
        request<IdentityMapping>(
            `/identities/${id}`,
            { method: "PATCH", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    delete: (id: string, token?: string, orgId?: string) =>
        request<void>(`/identities/${id}`, { method: "DELETE" }, token, orgId),
};
