import { request } from "./_request";
import type { User, UserCreate, UserUpdate } from "../types";

export const usersApi = {
    list: (token?: string, orgId?: string, q?: string, activeOnly = false) => {
        const params = new URLSearchParams();
        if (q && q.trim().length > 0) {
            params.set("q", q.trim());
        }
        params.set("active_only", String(activeOnly));
        return request<User[]>(`/users?${params.toString()}`, {}, token, orgId);
    },

    get: (userId: string, token?: string, orgId?: string) =>
        request<User>(`/users/${userId}`, {}, token, orgId),

    create: (data: UserCreate, token?: string, orgId?: string) =>
        request<User>("/users", { method: "POST", body: JSON.stringify(data) }, token, orgId),

    update: (userId: string, data: UserUpdate, token?: string, orgId?: string) =>
        request<User>(
            `/users/${userId}`,
            { method: "PATCH", body: JSON.stringify(data) },
            token,
            orgId,
        ),

    setPassword: (
        userId: string,
        password: string,
        adminPassword: string,
        token?: string,
        orgId?: string,
    ) =>
        request<void>(
            `/users/${userId}/password`,
            { method: "POST", body: JSON.stringify({ admin_password: adminPassword, password }) },
            token,
            orgId,
        ),

    delete: (userId: string, token?: string, orgId?: string) =>
        request<void>(`/users/${userId}`, { method: "DELETE" }, token, orgId),
};
