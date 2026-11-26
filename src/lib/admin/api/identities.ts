import { AdminApiError, request } from "./_request";
import type { IdentityMapping, IdentityMappingCreate } from "../types";

// The route parameter reaches the page still encoded.
const safeDecode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

export const identitiesApi = {
    list: (token?: string, orgId?: string) =>
        request<IdentityMapping[]>("/identities", {}, token, orgId),

    // The backend serves no GET /identities/{id}: one identity is read from the list route, which
    // names no canonical_id filter and (by default) returns active rows only.
    get: async (id: string, token?: string, orgId?: string) => {
        const rows = await request<IdentityMapping[]>(
            "/identities?active_only=false",
            {},
            token,
            orgId,
        );
        const wanted = safeDecode(id);
        const found = rows.find((row) => row.canonical_id === wanted);
        if (!found) {
            throw new AdminApiError(404, "Not Found", `Identity ${wanted} not found`, "GET");
        }
        return found;
    },

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
