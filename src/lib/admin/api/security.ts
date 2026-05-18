import { request } from "./_request";
import type {
  IPAllowlist,
  IPAllowlistCreate,
  IPAllowlistUpdate,
  IPAllowlistListResponse,
  IPCheckResponse,
} from "../types";

export const ipAllowlistApi = {
  list: (limit = 50, offset = 0, token?: string, orgId?: string) =>
    request<IPAllowlistListResponse>(
      `/ip-allowlist?limit=${limit}&offset=${offset}`,
      {},
      token,
      orgId
    ),

  get: (id: string, token?: string, orgId?: string) =>
    request<IPAllowlist>(`/ip-allowlist/${id}`, {}, token, orgId),

  create: (data: IPAllowlistCreate, token?: string, orgId?: string) =>
    request<IPAllowlist>(
      "/ip-allowlist",
      { method: "POST", body: JSON.stringify(data) },
      token,
      orgId
    ),

  update: (id: string, data: IPAllowlistUpdate, token?: string, orgId?: string) =>
    request<IPAllowlist>(
      `/ip-allowlist/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
      orgId
    ),

  delete: (id: string, token?: string, orgId?: string) =>
    request<void>(`/ip-allowlist/${id}`, { method: "DELETE" }, token, orgId),

  check: (ipAddress: string, token?: string, orgId?: string) =>
    request<IPCheckResponse>(
      "/ip-allowlist/check",
      { method: "POST", body: JSON.stringify({ ip_address: ipAddress }) },
      token,
      orgId
    ),
};
