"use server";

import { revalidatePath } from "next/cache";
import { adminApi } from "../api";
import type { Result } from "@/lib/result";
import type {
    PagerDutyApiTokenConnectedResponse,
    PagerDutyAuthorizeResponse,
    PagerDutyClientCredentialsConnectedResponse,
    PagerDutyDisconnectResponse,
    PagerDutyOAuthDataset,
    PagerDutyOAuthCallbackConnectedResponse,
    PagerDutyPreflightResponse,
    PagerDutyRegion,
    PagerDutyServicesResponse,
    PagerDutyStatusResponse,
} from "../pagerduty";
import { getSessionContext, withErrorHandling } from "./_shared";
import { requirePagerDutyCreationEntitlement } from "./canonicalIncidentIngestion";

export async function startPagerDutyOAuth(): Promise<Result<PagerDutyAuthorizeResponse>> {
    return withErrorHandling(async () => {
        await requirePagerDutyCreationEntitlement();
        const { token, orgId } = await getSessionContext();
        return adminApi.pagerDuty.authorize(token, orgId);
    });
}

export async function completePagerDutyOAuth(input: {
    readonly state: string;
    readonly code?: string;
    readonly error?: string;
}): Promise<Result<PagerDutyOAuthCallbackConnectedResponse>> {
    return withErrorHandling(async () => {
        // Ops created the one-time, organization-scoped state during authorization and
        // remains the authority that consumes it. Completion must not re-check the
        // creation entitlement: it may have changed while the user was at PagerDuty.
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.pagerDuty.callback(input, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function getPagerDutyStatus(
    credentialName = "default",
): Promise<Result<PagerDutyStatusResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.pagerDuty.status(credentialName, token, orgId);
    });
}

export async function disconnectPagerDuty(
    credentialName = "default",
): Promise<Result<PagerDutyDisconnectResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.pagerDuty.disconnect(credentialName, token, orgId);
        revalidatePath("/org/admin/integrations", "page");
        return result;
    });
}

export async function preflightPagerDuty(
    credentialName = "default",
    enabledDatasets: readonly PagerDutyOAuthDataset[] = [],
): Promise<Result<PagerDutyPreflightResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.pagerDuty.preflight(credentialName, enabledDatasets, token, orgId);
    });
}

export async function getPagerDutyServices(
    credentialName = "default",
): Promise<Result<PagerDutyServicesResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.pagerDuty.services(credentialName, token, orgId);
    });
}

export async function connectPagerDutyClientCredentials(input: {
    readonly credentialName: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly subdomain: string;
    readonly region: PagerDutyRegion;
}): Promise<Result<PagerDutyClientCredentialsConnectedResponse>> {
    return withErrorHandling(async () => {
        await requirePagerDutyCreationEntitlement();
        const { token, orgId } = await getSessionContext();
        return adminApi.pagerDuty.clientCredentials(
            {
                credential_name: input.credentialName,
                client_id: input.clientId,
                client_secret: input.clientSecret,
                subdomain: input.subdomain,
                region: input.region,
            },
            token,
            orgId,
        );
    });
}

export async function connectPagerDutyApiToken(input: {
    readonly credentialName: string;
    readonly apiToken: string;
    readonly subdomain: string;
    readonly region: PagerDutyRegion;
}): Promise<Result<PagerDutyApiTokenConnectedResponse>> {
    return withErrorHandling(async () => {
        await requirePagerDutyCreationEntitlement();
        const { token, orgId } = await getSessionContext();
        return adminApi.pagerDuty.apiToken(
            {
                credential_name: input.credentialName,
                api_token: input.apiToken,
                subdomain: input.subdomain,
                region: input.region,
            },
            token,
            orgId,
        );
    });
}
