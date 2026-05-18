import { request } from "./_request";
import type {
  User,
  UserCreate,
  UserUpdate,
} from "../types";

export const usersApi = {
  list: (token?: string, orgId?: string, q?: string) => {
    const params = new URLSearchParams();
    if (q && q.trim().length > 0) {
      params.set("q", q.trim());
    }
    const query = params.toString();
    const path = query ? `/users?${query}` : "/users";
    return request<User[]>(path, {}, token, orgId);
  },

  get: (userId: string, token?: string, orgId?: string) =>
    request<User>(`/users/${userId}`, {}, token, orgId),

  create: (data: UserCreate, token?: string, orgId?: string) =>
    request<User>(
      "/users",
      { method: "POST", body: JSON.stringify(data) },
      token,
      orgId
    ),

  update: (userId: string, data: UserUpdate, token?: string, orgId?: string) =>
    request<User>(
      `/users/${userId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
      orgId
    ),

  setPassword: (userId: string, password: string, token?: string, orgId?: string) =>
    request<void>(
      `/users/${userId}/password`,
      { method: "POST", body: JSON.stringify({ password }) },
      token,
      orgId
    ),

  delete: (userId: string, token?: string, orgId?: string) =>
    request<void>(`/users/${userId}`, { method: "DELETE" }, token, orgId),
};
