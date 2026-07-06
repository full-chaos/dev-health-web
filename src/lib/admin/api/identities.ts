import { request } from "./_request";
import type { IdentityMapping, IdentityMappingCreate } from "../types";

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

    // No PATCH /identities/{id} route exists on the backend — identity
    // updates go through the same POST /identities upsert as create, keyed
    // on `canonical_id` in the body (see create_or_update_identity).
    update: (data: IdentityMappingCreate, token?: string, orgId?: string) =>
        request<IdentityMapping>(
            "/identities",
            { method: "POST", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    delete: (id: string, token?: string, orgId?: string) =>
        request<void>(`/identities/${id}`, { method: "DELETE" }, token, orgId),
};
