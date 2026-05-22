"use server";

import { adminApi } from "../api";
import type { ActionResult } from "@/lib/result";
import type { IdentityMapping, IdentityMappingCreate, IdentityMappingUpdate } from "../types";
import { getSessionContext, withErrorHandling } from "./_shared";

export async function listIdentities(): Promise<ActionResult<IdentityMapping[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.list(token, orgId);
  });
}

export async function createIdentity(
  data: IdentityMappingCreate,
): Promise<ActionResult<IdentityMapping>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.create(data, token, orgId);
  });
}

export async function getIdentity(id: string): Promise<ActionResult<IdentityMapping>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.get(id, token, orgId);
  });
}

export async function updateIdentity(
  id: string,
  data: IdentityMappingUpdate,
): Promise<ActionResult<IdentityMapping>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.update(id, data, token, orgId);
  });
}

export async function deleteIdentity(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.delete(id, token, orgId);
  });
}
