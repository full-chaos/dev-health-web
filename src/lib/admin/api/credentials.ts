import { request } from "./_request";
import type {
  IntegrationCredential,
  IntegrationCredentialCreate,
  IntegrationCredentialUpdate,
  TestConnectionResponse,
  DiscoveredReposResponse,
} from "../types";

export const credentialsApi = {
  list: (token?: string, orgId?: string) =>
    request<IntegrationCredential[]>("/credentials", {}, token, orgId),

  get: (provider: string, name: string, token?: string, orgId?: string) =>
    request<IntegrationCredential>(`/credentials/${provider}/${name}`, {}, token, orgId),

  create: (data: IntegrationCredentialCreate, token?: string, orgId?: string) =>
    request<IntegrationCredential>(
      "/credentials",
      { method: "POST", body: JSON.stringify(data) },
      token,
      orgId
    ),

  update: (provider: string, name: string, data: IntegrationCredentialUpdate, token?: string, orgId?: string) =>
    request<IntegrationCredential>(
      `/credentials/${provider}/${name}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
      orgId
    ),

  delete: (provider: string, name: string, token?: string, orgId?: string) =>
    request<void>(`/credentials/${provider}/${name}`, { method: "DELETE" }, token, orgId),

  test: (provider: string, options?: { name?: string; credentialId?: string; credentials?: Record<string, unknown> }, token?: string, orgId?: string) =>
    request<TestConnectionResponse>(
      "/credentials/test",
      { method: "POST", body: JSON.stringify({ provider, name: options?.name ?? "default", credential_id: options?.credentialId, credentials: options?.credentials }) },
      token,
      orgId
    ),

  listRepos: (credentialId: string, owner: string, token?: string, orgId?: string) =>
    request<DiscoveredReposResponse>(
      `/credentials/${credentialId}/repos?owner=${encodeURIComponent(owner)}`,
      {},
      token,
      orgId
    ),
};
