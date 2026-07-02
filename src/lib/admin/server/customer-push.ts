"use server";

import { adminApi } from "../api";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import type {
    CustomerPushSource,
    CustomerPushSourceCreate,
    CustomerPushSourceUpdate,
    CustomerPushToken,
    CustomerPushTokenCreate,
    CustomerPushTokenCreateResponse,
    CustomerPushBatchDetail,
    CustomerPushBatchListParams,
    CustomerPushBatchListResponse,
    CustomerPushValidateResponse,
    CustomerPushSchemaListResponse,
    CustomerPushSchemaDetailResponse,
} from "../types";
import { getSessionContext, withErrorHandling } from "./_shared";

/**
 * GET /customer-push/sources has no server-side system filter (see
 * api/customer-push.ts) — filter client-side here so every caller gets a
 * correctly per-provider-scoped list without repeating the filter.
 */
export async function listCustomerPushSources(
    system?: string,
): Promise<ActionResult<CustomerPushSource[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const sources = await adminApi.customerPush.listSources(token, orgId);
        return system ? sources.filter((s) => s.system === system) : sources;
    });
}

export async function createCustomerPushSource(
    data: CustomerPushSourceCreate,
): Promise<ActionResult<CustomerPushSource>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.customerPush.createSource(data, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function getCustomerPushSource(
    sourceId: string,
): Promise<ActionResult<CustomerPushSource>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.getSource(sourceId, token, orgId);
    });
}

export async function updateCustomerPushSource(
    sourceId: string,
    data: CustomerPushSourceUpdate,
): Promise<ActionResult<CustomerPushSource>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.customerPush.updateSource(sourceId, data, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function listCustomerPushTokens(
    sourceId: string,
): Promise<ActionResult<CustomerPushToken[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.listTokens(sourceId, token, orgId);
    });
}

export async function createCustomerPushToken(
    sourceId: string,
    data: CustomerPushTokenCreate,
): Promise<ActionResult<CustomerPushTokenCreateResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.customerPush.createToken(sourceId, data, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function rotateCustomerPushToken(
    tokenId: string,
): Promise<ActionResult<CustomerPushTokenCreateResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.customerPush.rotateToken(tokenId, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function revokeCustomerPushToken(
    tokenId: string,
): Promise<ActionResult<CustomerPushToken>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.customerPush.revokeToken(tokenId, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function listCustomerPushBatches(
    sourceId: string,
    params: CustomerPushBatchListParams = {},
): Promise<ActionResult<CustomerPushBatchListResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.listBatches(sourceId, params, token, orgId);
    });
}

export async function getCustomerPushBatch(
    ingestionId: string,
): Promise<ActionResult<CustomerPushBatchDetail>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.getBatch(ingestionId, token, orgId);
    });
}

export async function listCustomerPushSchemas(): Promise<
    ActionResult<CustomerPushSchemaListResponse>
> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.listSchemas(token, orgId);
    });
}

export async function getCustomerPushSchema(
    version: string,
): Promise<ActionResult<CustomerPushSchemaDetailResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.getSchema(version, token, orgId);
    });
}

export async function validateCustomerPushPayload(
    sourceId: string,
    envelope: unknown,
): Promise<ActionResult<CustomerPushValidateResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.validate(sourceId, envelope, token, orgId);
    });
}
