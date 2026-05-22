"use server";

import { adminApi } from "../api";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import type {
  IntegrationCredential,
  IntegrationCredentialCreate,
  TestConnectionResponse,
} from "../types";
import { getSessionContext, withErrorHandling } from "./_shared";

export async function listCredentials(): Promise<ActionResult<IntegrationCredential[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.credentials.list(token, orgId);
  });
}

export async function createCredential(
  data: IntegrationCredentialCreate,
): Promise<ActionResult<IntegrationCredential>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.credentials.create(data, token, orgId);
    revalidatePath("/admin/integrations", "page");
    return result;
  });
}

export async function testConnection(
  provider: string,
  options: { name?: string; credentialId?: string; credentials?: Record<string, unknown> } = {},
): Promise<ActionResult<TestConnectionResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.credentials.test(provider, options, token, orgId);
    revalidatePath("/admin/integrations", "page");
    return result;
  });
}

export async function deleteCredential(
  provider: string,
  name: string,
): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.credentials.delete(provider, name, token, orgId);
    revalidatePath("/admin/integrations", "page");
    return result;
  });
}
