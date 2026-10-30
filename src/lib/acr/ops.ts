import "server-only";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { getBackendUrl } from "@/lib/origin";
import type { IssuanceProvenance } from "./assertion";
import { fetchBoundedJson } from "./http";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";
import { ACR_REPOSITORY_SCOPES_QUERY } from "./queries";

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
                values: z.array(
                    z
                        .object({
                            __typename: z.string().optional(),
                            count: z.number(),
                            value: z.string(),
                        })
                        .strict(),
                ),
            }),
        }),
    })
    .loose();

const impersonationStatusSchema = z.object({ is_impersonating: z.boolean() }).loose();

/** The Ops session id form ACR accepts as `sid`: 1-256 printable ASCII characters, no space. */
const sessionIdPattern = /^[\x21-\x7e]{1,256}$/u;

export type OpsAuthorization = {
    /** Set for `credential:issue` only (CHAOS-12095); signed as `sid` and `impersonating`. */
    readonly provenance?: IssuanceProvenance;
    readonly orgId: string;
    readonly repositoryScopes: readonly string[];
    readonly subject: string;
};

type ResolveOpsAuthorizationInput = {
    readonly accessToken: string;
    readonly orgId: string;
    /** Platform validation is independently authorized by the superuser route guard. */
    readonly platformValidation?: boolean;
    readonly selectedRepository?: string;
    readonly signal: AbortSignal;
    readonly subject: string;
    /**
     * Ask Dev only: the longest each setup read (entitlement, scopes) may take right now. Called
     * once per read so a read that starts late gets what is left of the run deadline, not a
     * fixed 5 s. Unset: 5 s.
     */
    readonly stepTimeoutMs?: () => number;
};

type ResolveOpsCredentialIssuanceAuthorizationInput = {
    readonly accessToken: string;
    readonly orgId: string;
    readonly provenance: IssuanceProvenance;
    readonly repositoryScopes: readonly string[];
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

export function compareScopeBytes(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalRepositoryScopes(values: readonly string[]): readonly string[] {
    const canonical = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u;
    const sorted = [...values].sort(compareScopeBytes);
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

async function requireAcrEntitlement(input: {
    readonly accessToken: string;
    readonly orgId: string;
    readonly signal: AbortSignal;
}): Promise<void> {
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
}

/**
 * Ask Dev needs BOTH `agent_context_runtime` and `ask_dev`. Same shape as
 * {@link requireAcrEntitlement} on purpose: the auth-profile gate walks this body for the fetch,
 * the parse and the rejecting condition. Read fresh on every call; nothing is cached.
 */
async function requireAskDevEntitlements(input: {
    readonly accessToken: string;
    readonly orgId: string;
    readonly signal: AbortSignal;
    readonly stepTimeoutMs?: () => number;
}): Promise<void> {
    const entitlement = await fetchBoundedJson({
        headers: opsHeaders(input.accessToken),
        method: "GET",
        signal: input.signal,
        timeoutMs: input.stepTimeoutMs?.() ?? 5_000,
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
        !parsedEntitlement.data.features.agent_context_runtime ||
        parsedEntitlement.data.features.ask_dev !== true
    ) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.notEntitled,
            "Agent Context Runtime is not available for this organization.",
            { status: 403 },
        );
    }
}

/**
 * Authorizes credential issuance from authenticated organization identity and
 * entitlement only. Repository analytics are inventory, never an authorization
 * source. ACR binds the supplied grant to this organization in the assertion.
 */
export async function resolveOpsCredentialIssuanceAuthorization(
    input: ResolveOpsCredentialIssuanceAuthorizationInput,
): Promise<OpsAuthorization> {
    await requireAcrEntitlement(input);
    return {
        orgId: input.orgId,
        provenance: input.provenance,
        repositoryScopes: input.repositoryScopes,
        subject: input.subject,
    };
}

/**
 * The claims of the Ops access token the web server holds in its sealed session. The token
 * reached this server from Ops, never from the browser, and the browser cannot read or change
 * the session that carries it; Ops checks its signature on every Ops call. `undefined` when it
 * is not a JWT.
 */
function opsTokenClaims(accessToken: string): Readonly<Record<string, unknown>> | undefined {
    const parts = accessToken.split(".");
    if (parts.length !== 3 || !parts[1]) return undefined;
    try {
        const value: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        return typeof value === "object" && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Derives the provenance of a `credential:issue` assertion (CHAOS-12095, design T4c) on the web
 * server only: `sessionId` is the `sid` of the server's own Ops session token, and
 * `impersonating` is true when ANY of these says so — a fresh Ops impersonation status read, the
 * session's impersonation state, an org that differs from the real org, or an Ops token minted
 * for an impersonation (`impersonating_user_id`). The status read is not cached; a failed read
 * fails closed. Nothing here reads the request the browser sent.
 */
export async function resolveIssuanceProvenance(input: {
    readonly accessToken: string;
    readonly sessionImpersonating: boolean;
    readonly signal: AbortSignal;
    readonly subject: string;
}): Promise<IssuanceProvenance> {
    const status = await fetchBoundedJson({
        headers: opsHeaders(input.accessToken),
        method: "GET",
        signal: input.signal,
        timeoutMs: 5_000,
        url: backendUrl("/api/v1/admin/impersonate/status"),
    });
    const parsed = status.status === 200 ? impersonationStatusSchema.safeParse(status.value) : null;
    if (!parsed?.success) {
        logger.warn(
            {
                module: "acr-issuance",
                reason: parsed ? "malformed" : "status",
                status: status.status,
                userId: input.subject,
            },
            "acr credential issue refused: impersonation status read failed",
        );
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unavailable,
            "Agent Context Runtime is temporarily unavailable.",
            { retryable: true },
        );
    }
    const claims = opsTokenClaims(input.accessToken);
    const impersonatedToken =
        typeof claims?.["impersonating_user_id"] === "string" &&
        claims["impersonating_user_id"] !== "";
    const rawSessionId = claims?.["sid"];
    const sessionId =
        typeof rawSessionId === "string" && sessionIdPattern.test(rawSessionId)
            ? rawSessionId
            : undefined;
    if (rawSessionId !== undefined && sessionId === undefined) {
        logger.warn(
            { module: "acr-issuance", reason: "unusable_sid", userId: input.subject },
            "acr credential issue: the Ops session token has an unusable sid; none is signed",
        );
    }
    const impersonating =
        parsed.data.is_impersonating || input.sessionImpersonating || impersonatedToken;
    return sessionId === undefined ? { impersonating } : { impersonating, sessionId };
}

export async function resolveOpsAuthorization(
    input: ResolveOpsAuthorizationInput,
): Promise<OpsAuthorization> {
    if (input.platformValidation !== true) {
        await requireAcrEntitlement(input);
    }
    return readRepositoryScopes(input);
}

/**
 * Ask Dev authorization: BOTH `agent_context_runtime` and `ask_dev` must be on, read fresh from
 * ops on every call (nothing is cached, so a revoked entitlement denies the next request). There
 * is no platform-validation bypass: an Ask Dev run is always scoped to the caller's own org.
 * The repository list may be empty; the caller decides what an empty list means.
 */
export async function resolveAskDevAuthorization(
    input: Omit<ResolveOpsAuthorizationInput, "platformValidation" | "selectedRepository">,
): Promise<OpsAuthorization> {
    await requireAskDevEntitlements(input);
    return readRepositoryScopes(input);
}

async function readRepositoryScopes(
    input: ResolveOpsAuthorizationInput,
): Promise<OpsAuthorization> {
    const scopes = await fetchBoundedJson({
        body: JSON.stringify({
            query: ACR_REPOSITORY_SCOPES_QUERY,
            variables: { orgId: input.orgId },
        }),
        headers: opsHeaders(input.accessToken),
        method: "POST",
        signal: input.signal,
        timeoutMs: input.stepTimeoutMs?.() ?? 5_000,
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
