import { request, licensingRequest } from "./_request";
import type {
  OrgEntitlements,
  FeatureFlag,
  FeatureOverride,
  FeatureOverrideCreate,
} from "../types";

export const licensingApi = {
  entitlements: (orgId: string, token?: string, headerOrgId?: string) =>
    licensingRequest<OrgEntitlements>(`/entitlements/${orgId}`, {}, token, headerOrgId),

  featureFlags: (token?: string, orgId?: string) =>
    request<FeatureFlag[]>("/feature-flags", {}, token, orgId),

  overrides: {
    list: (orgId: string, token?: string, headerOrgId?: string) =>
      request<FeatureOverride[]>(`/orgs/${orgId}/feature-overrides`, {}, token, headerOrgId),

    create: (orgId: string, data: FeatureOverrideCreate, token?: string, headerOrgId?: string) =>
      request<FeatureOverride>(
        `/orgs/${orgId}/feature-overrides`,
        { method: "POST", body: JSON.stringify(data) },
        token,
        headerOrgId
      ),

    delete: (orgId: string, overrideId: string, token?: string, headerOrgId?: string) =>
      request<void>(`/orgs/${orgId}/feature-overrides/${overrideId}`, { method: "DELETE" }, token, headerOrgId),
  },
};
