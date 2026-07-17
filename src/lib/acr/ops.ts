import "server-only";

import { z } from "zod";

import { getBackendUrl } from "@/lib/origin";
import { fetchBoundedJson } from "./http";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";

const ACR_REPOSITORY_SCOPES_QUERY = `query ACRRepositoryScopes($orgId: String!) {
  catalog(orgId: $orgId, dimension: REPO) {
    values {
      value
      count
    }
  }
}`;

const entitlementSchema = z
    .object({
        features: z.object({ agent_context_runtime: z.boolean() }).loose(),
        is_valid: z.boolean(),
    })
    .loose();

const scopesSchema = z
    .object({
        data: z.object({
            catalog: z.object({
                values: z.array(z.object({ count: z.number(), value: z.string() }).strict()),
            }),
        }),
    })
    .loose();

export type OpsAuthorization = {
    readonly orgId: string;
    readonly repositoryScopes: readonly string[];
    readonly subject: string;
};

type ResolveOpsAuthorizationInput = {
    readonly accessToken: string;
    readonly orgId: string;
    readonly selectedRepository?: string;
    readonly signal: AbortSignal;
    readonly subject: string;
};

function backendUrl(path: string): URL {
    try {
        return new URL(path, getBackendUrl());
    } catch (error) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unavailable,
            "Agent Context Runtime is temporarily unavailable.",
            { cause: error, retryable: true },
        );
    }
}

function canonicalRepositoryScopes(values: readonly string[]): readonly string[] {
    const canonical = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u;
    const sorted = [...values].sort((left, right) => left.localeCompare(right));
    if (
        values.some((value) => value !== value.toLowerCase() || !canonical.test(value)) ||
        values.some((value, index) => value !== sorted[index]) ||
        new Set(values).size !== values.length
    ) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unavailable,
            "Agent Context Runtime is temporarily unavailable.",
            { retryable: true },
        );
    }
    return values;
}

function opsHeaders(accessToken: string): Readonly<Record<string, string>> {
    return {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    };
}

export async function resolveOpsAuthorization(
    input: ResolveOpsAuthorizationInput,
): Promise<OpsAuthorization> {
    const entitlement = await fetchBoundedJson({
        headers: opsHeaders(input.accessToken),
        method: "GET",
        signal: input.signal,
        timeoutMs: 5_000,
        url: backendUrl(`/api/v1/licensing/entitlements/${encodeURIComponent(input.orgId)}`),
    });
    if (entitlement.status !== 200) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unavailable,
            "Agent Context Runtime is temporarily unavailable.",
            { retryable: true },
        );
    }
    const parsedEntitlement = entitlementSchema.safeParse(entitlement.value);
    if (
        !parsedEntitlement.success ||
        !parsedEntitlement.data.is_valid ||
        !parsedEntitlement.data.features.agent_context_runtime
    ) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.notEntitled,
            "Agent Context Runtime is not available for this organization.",
            { status: 403 },
        );
    }
    const scopes = await fetchBoundedJson({
        body: JSON.stringify({
            query: ACR_REPOSITORY_SCOPES_QUERY,
            variables: { orgId: input.orgId },
        }),
        headers: opsHeaders(input.accessToken),
        method: "POST",
        signal: input.signal,
        timeoutMs: 5_000,
        url: backendUrl("/graphql"),
    });
    if (scopes.status !== 200) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unavailable,
            "Agent Context Runtime is temporarily unavailable.",
            { retryable: true },
        );
    }
    const parsedScopes = scopesSchema.safeParse(scopes.value);
    if (!parsedScopes.success) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unavailable,
            "Agent Context Runtime is temporarily unavailable.",
            { retryable: true },
        );
    }
    const repositoryScopes = canonicalRepositoryScopes(
        parsedScopes.data.data.catalog.values.map((value) => value.value),
    );
    if (
        input.selectedRepository !== undefined &&
        !repositoryScopes.includes(input.selectedRepository)
    ) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.repositoryNotAvailable,
            "The selected repository is not available.",
            { status: 404 },
        );
    }
    return { orgId: input.orgId, repositoryScopes, subject: input.subject };
}
