import { request } from "./_request";
import type {
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
  Membership,
  MembershipCreate,
  MembershipUpdateRole,
} from "../types";

export const orgsApi = {
  list: (token?: string, headerOrgId?: string) =>
    request<Organization[]>("/orgs", {}, token, headerOrgId),

  get: (orgId: string, token?: string, headerOrgId?: string) =>
    request<Organization>(`/orgs/${orgId}`, {}, token, headerOrgId),

  create: (data: OrganizationCreate, token?: string, headerOrgId?: string) =>
    request<Organization>(
      "/orgs",
      { method: "POST", body: JSON.stringify(data) },
      token,
      headerOrgId,
    ),

  update: (orgId: string, data: OrganizationUpdate, token?: string, headerOrgId?: string) =>
    request<Organization>(
      `/orgs/${orgId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
      headerOrgId,
    ),

  delete: (orgId: string, token?: string, headerOrgId?: string) =>
    request<void>(`/orgs/${orgId}`, { method: "DELETE" }, token, headerOrgId),

  members: {
    list: (orgId: string, token?: string, headerOrgId?: string) =>
      request<Membership[]>(`/orgs/${orgId}/members`, {}, token, headerOrgId),

    add: (orgId: string, data: MembershipCreate, token?: string, headerOrgId?: string) =>
      request<Membership>(
        `/orgs/${orgId}/members`,
        { method: "POST", body: JSON.stringify(data) },
        token,
        headerOrgId,
      ),

    updateRole: (
      orgId: string,
      userId: string,
      data: MembershipUpdateRole,
      token?: string,
      headerOrgId?: string,
    ) =>
      request<Membership>(
        `/orgs/${orgId}/members/${userId}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        headerOrgId,
      ),

    remove: (orgId: string, userId: string, token?: string, headerOrgId?: string) =>
      request<void>(`/orgs/${orgId}/members/${userId}`, { method: "DELETE" }, token, headerOrgId),

    transferOwnership: (
      orgId: string,
      newOwnerUserId: string,
      token?: string,
      headerOrgId?: string,
    ) =>
      request<void>(
        `/orgs/${orgId}/transfer-ownership`,
        { method: "POST", body: JSON.stringify({ new_owner_user_id: newOwnerUserId }) },
        token,
        headerOrgId,
      ),
  },
};
