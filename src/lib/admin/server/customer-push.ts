"use server";

import { adminApi, AdminApiError } from "../api";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/result";
import { CUSTOMER_PUSH_INGEST_FEATURE } from "@/lib/billing/features";
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

type CustomerPushIngestEntitlement = {
    tier: string;
    features: Record<string, boolean>;
    enabled: boolean;
};

export async function getCustomerPushIngestEntitlement(): Promise<
    Result<CustomerPushIngestEntitlement>
> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        if (!orgId) {
            throw new AdminApiError(400, "Bad Request", "No organization ID in session");
        }

        const entitlements = await adminApi.licensing.entitlements(orgId, token, orgId);
        return {
            tier: entitlements.tier,
            features: entitlements.features,
            enabled: entitlements.features[CUSTOMER_PUSH_INGEST_FEATURE] === true,
        };
    });
}

/**
 * GET /customer-push/sources has no server-side `system` filter — filter
 * client-side here so every caller gets a correctly per-provider-scoped
 * list without repeating the filter.
 */
export async function listCustomerPushSources(
    system?: string,
): Promise<Result<CustomerPushSource[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const sources = await adminApi.customerPush.listSources(token, orgId);
        return system ? sources.filter((s) => s.system === system) : sources;
    });
}

export async function createCustomerPushSource(
    data: CustomerPushSourceCreate,
): Promise<Result<CustomerPushSource>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.customerPush.createSource(data, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function getCustomerPushSource(sourceId: string): Promise<Result<CustomerPushSource>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.getSource(sourceId, token, orgId);
    });
}

export async function updateCustomerPushSource(
    sourceId: string,
    data: CustomerPushSourceUpdate,
): Promise<Result<CustomerPushSource>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.customerPush.updateSource(sourceId, data, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function listCustomerPushTokens(
    sourceId: string,
): Promise<Result<CustomerPushToken[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.listTokens(sourceId, token, orgId);
    });
}

export async function createCustomerPushToken(
    sourceId: string,
    data: CustomerPushTokenCreate,
): Promise<Result<CustomerPushTokenCreateResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.customerPush.createToken(sourceId, data, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function rotateCustomerPushToken(
    tokenId: string,
): Promise<Result<CustomerPushTokenCreateResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.customerPush.rotateToken(tokenId, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function revokeCustomerPushToken(tokenId: string): Promise<Result<CustomerPushToken>> {
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
): Promise<Result<CustomerPushBatchListResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.listBatches(sourceId, params, token, orgId);
    });
}

export async function getCustomerPushBatch(
    ingestionId: string,
): Promise<Result<CustomerPushBatchDetail>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.getBatch(ingestionId, token, orgId);
    });
}

export async function listCustomerPushSchemas(): Promise<Result<CustomerPushSchemaListResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.listSchemas(token, orgId);
    });
}

export async function getCustomerPushSchema(
    version: string,
): Promise<Result<CustomerPushSchemaDetailResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.getSchema(version, token, orgId);
    });
}

export async function validateCustomerPushPayload(
    sourceId: string,
    envelope: unknown,
): Promise<Result<CustomerPushValidateResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.customerPush.validate(sourceId, envelope, token, orgId);
    });
}
