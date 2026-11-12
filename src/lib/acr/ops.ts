import "server-only";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { isRepositoryKey } from "@/lib/auth/authorize/repositoryKey";
import { getBackendUrl } from "@/lib/origin";
import type { IssuanceProvenance } from "./assertion";
import { fetchBoundedJson } from "./http";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";
import {
    acrScopesFromGrantsEnabled,
    CONTEXT_READ_ACTION,
    decideCredentialIssue,
    EVIDENCE_READ_ACTION,
    type GrantDecisionOutcome,
    logGrantDecision,
    readRepositoryListing,
    resolveRepositoryDecisions,
} from "./grantScopes";
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
    /** Names the principal may read; the same list as `repositoryScopes` (a universal grant sends every candidate). */
    readonly visibleRepositories?: readonly string[];
};

type ResolveOpsAuthorizationInput = {
    readonly accessToken: string;
    readonly orgId: string;
    /**
     * The read these scopes are for (ACR_SCOPES_FROM_GRANTS on: its decisions decide them). Unset:
     * "context" (`acr.context.read`).
     */
    readonly read?: "context" | "evidence";
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
};

type ResolveOpsCredentialIssuanceAuthorizationInput = {
    readonly accessToken: string;
    readonly orgId: string;
    /** Unset: the assertion carries no provenance claims (see `issuanceProvenanceClaimsEnabled`). */
    readonly provenance: IssuanceProvenance | undefined;
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

/**
 * A scope list as ACR takes it: every value a repository key (2-20 segments, the one rule ops, the
 * decision point and ACR hold), sorted by bytes, no repeat; anything else refuses (unavailable).
 */
function canonicalRepositoryScopes(values: readonly string[]): readonly string[] {
    const sorted = [...values].sort(compareScopeBytes);
    if (
        values.some((value) => value !== value.toLowerCase() || !isRepositoryKey(value)) ||
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

function opsUnavailable(cause?: unknown): AcrRuntimeError {
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.unavailable,
        "Agent Context Runtime is temporarily unavailable.",
        { cause, retryable: true },
    );
}

/**
 * CHAOS-13332: an Ops status is judged before its body is read. A deliberate refusal (401/403) is
 * the non-retryable `not_entitled` 403, as the entitlement answer below is; a retry cannot
 * succeed. Any other non-200 is an outage, whatever its body.
 */
function opsStatusError(status: number): AcrRuntimeError | null {
    if (status === 200) return null;
    if (status === 401 || status === 403) {
        return new AcrRuntimeError(
            acrRuntimeErrorCodes.notEntitled,
            "Agent Context Runtime is not available for this organization.",
            { retryable: false, status: 403 },
        );
    }
    return opsUnavailable();
}

/** The Ops read options: the status is judged first, and a body that is not JSON is an outage. */
const OPS_ANSWER = { classifyStatus: opsStatusError, unreadableBody: opsUnavailable } as const;

async function requireAcrEntitlement(input: {
    readonly accessToken: string;
    readonly orgId: string;
    readonly signal: AbortSignal;
}): Promise<void> {
    const entitlement = await fetchBoundedJson({
        ...OPS_ANSWER,
        headers: opsHeaders(input.accessToken),
        method: "GET",
        signal: input.signal,
        timeoutMs: 5_000,
        url: backendUrl(`/api/v1/licensing/entitlements/${encodeURIComponent(input.orgId)}`),
    });
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
        ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
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
 * for an impersonation (an `act` claim naming the real actor: contracts/auth/v1 access-token.v1). The status read is not cached; a failed read
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
    const act = claims?.["act"];
    const impersonatedToken =
        typeof act === "object" &&
        act !== null &&
        typeof (act as { sub?: unknown }).sub === "string" &&
        (act as { sub: string }).sub !== "";
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
 * The analytics catalog's repository names: inventory, never authority. A name becomes a scope only
 * as a candidate that a decision allows (switch on) or as the legacy catalog scope (switch off).
 */
async function readCatalogCandidates(input: {
    readonly accessToken: string;
    readonly orgId: string;
    readonly signal: AbortSignal;
}): Promise<readonly string[]> {
    const scopes = await fetchBoundedJson({
        ...OPS_ANSWER,
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
    const parsedScopes = scopesSchema.safeParse(scopes.value);
    if (!parsedScopes.success) {
        const errors = (scopes.value as { errors?: unknown } | null)?.errors;
        const first: unknown = Array.isArray(errors) ? errors[0] : undefined;
        const message = (first as { message?: unknown } | undefined)?.message;
        logger.warn(
            {
                graphqlErrors: Array.isArray(errors) ? errors.length : 0,
                graphqlMessage: typeof message === "string" ? message.slice(0, 120) : null,
                module: "acr-catalog",
                orgId: input.orgId,
                reason: "catalog_unreadable",
                status: scopes.status,
            },
            "acr read refused: repository catalog unreadable",
        );
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unavailable,
            "Agent Context Runtime is temporarily unavailable.",
            { retryable: true },
        );
    }
    return canonicalRepositoryScopes(
        parsedScopes.data.data.catalog.values.map((value) => value.value),
    );
}

function issueRefused(): AcrRuntimeError {
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.notEntitled,
        "Approval is unavailable for this account.",
        { status: 403 },
    );
}

function grantLimitRefused(): AcrRuntimeError {
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.grantLimitExceeded,
        "More repository grants than one credential may list.",
        { status: 403 },
    );
}

/**
 * ACR_SCOPES_FROM_GRANTS on (D6857-2): the decision and the repository scopes of one
 * `credential:issue` call (device approval, consent). `acr.credential.issue` on the session
 * organization decides first: a deny refuses (403; over the allowlist bound, grant_limit_exceeded).
 * The organization-wide `["*"]` is sent only when a decision carries `repository_scope: organization`.
 * A `["*"]` request with a named allow takes the allow's own `repository_allowlist` (the live grant
 * set; no catalog read, no read decision); an empty list refuses (403). Named requests keep their
 * per-key `acr.context.read` decisions. Requested names are never widened: an org-wide caller sends
 * them as asked. Every outcome logs one Info line (logGrantDecision).
 */
export async function resolveDecidedIssuanceScopes(input: {
    readonly accessToken: string;
    readonly orgId: string;
    readonly requested: readonly string[];
    readonly route: "consent" | "device";
    readonly signal: AbortSignal;
}): Promise<readonly string[]> {
    let logged = false;
    const log = (
        outcome: GrantDecisionOutcome,
        scopes: readonly string[],
        source: "named" | "org-wide" | null,
        markerFrom: string | null,
    ) => {
        logged = true;
        logGrantDecision({
            markerFrom,
            orgId: input.orgId,
            outcome,
            route: input.route,
            scopes,
            source,
        });
    };
    const session = { accessToken: input.accessToken, orgId: input.orgId };
    const wildcard = input.requested.length === 1 && input.requested[0] === "*";
    try {
        const issue = await decideCredentialIssue(session);
        if (!issue.allowed) {
            log("denied", [], null, null);
            throw issue.overLimit ? grantLimitRefused() : issueRefused();
        }
        if (issue.orgWide) {
            log("allowed", input.requested, "org-wide", "acr.credential.issue");
            return input.requested;
        }
        if (wildcard) {
            const granted = canonicalRepositoryScopes(issue.repositoryAllowlist);
            if (granted.length === 0) {
                log("no_scopes", [], "named", null);
                throw issueRefused();
            }
            log("allowed", granted, "named", null);
            return granted;
        }
        const { orgWide, repositoryScopes: named } = await resolveRepositoryDecisions({
            ...session,
            candidates: input.requested,
        });
        if (orgWide) {
            log("allowed", input.requested, "org-wide", CONTEXT_READ_ACTION);
            return input.requested;
        }
        if (named.length === 0) {
            log("no_scopes", [], "named", null);
            throw issueRefused();
        }
        log("allowed", named, "named", null);
        return named;
    } catch (error) {
        if (!logged) log("unavailable", [], null, null);
        throw error;
    }
}

/**
 * ACR_SCOPES_FROM_GRANTS on: the scopes of a context or evidence read, from that read's own decisions
 * (`acr.context.read`, `acr.evidence.read`; D6857-2). An org-wide allow allows every catalog name,
 * so the scopes are the catalog list, byte for byte the legacy scopes. One Info line per read.
 */
async function decidedReadScopes(
    input: ResolveOpsAuthorizationInput,
    candidates: readonly string[],
): Promise<{
    readonly repositoryScopes: readonly string[];
    readonly visibleRepositories: readonly string[];
}> {
    const route = input.read ?? "context";
    const action = route === "evidence" ? EVIDENCE_READ_ACTION : CONTEXT_READ_ACTION;
    const log = (outcome: GrantDecisionOutcome, scopes: readonly string[], orgWide: boolean) =>
        logGrantDecision({
            markerFrom: orgWide ? action : null,
            orgId: input.orgId,
            outcome,
            route,
            scopes,
            source: outcome === "unavailable" ? null : orgWide ? "org-wide" : "named",
        });
    let result;
    try {
        result = await resolveRepositoryDecisions({
            accessToken: input.accessToken,
            action,
            candidates,
            orgId: input.orgId,
        });
    } catch (error) {
        log("unavailable", [], false);
        throw error;
    }
    log(
        result.repositoryScopes.length > 0 ? "allowed" : "no_scopes",
        result.repositoryScopes,
        result.orgWide,
    );
    return result;
}

/**
 * ACR_SCOPES_FROM_GRANTS on, a context or evidence read: the scopes from the ops read listing, not the
 * catalog (the catalog refuses above 100 repositories). Org-wide is `["*"]`: no name is listed, so the
 * selected repository is not checked here (ACR checks it). Named is the principal's own keys (at most
 * 256). Each refusal has its own answer and one warn line with the reason: the cap is 403
 * grant_limit_exceeded; a deny that says "reads nothing" is an empty scope list (a selected repository is
 * then 404); anything else (client failure, a deny that is not an access answer) is 503 unavailable.
 */
async function readListedScopes(
    input: ResolveOpsAuthorizationInput & { readonly read: "context" | "evidence" },
): Promise<OpsAuthorization> {
    const action = input.read === "evidence" ? EVIDENCE_READ_ACTION : CONTEXT_READ_ACTION;
    const refuse = (reason: string, source: string): never => {
        logger.warn(
            { module: "acr-read-listing", orgId: input.orgId, reason, route: input.read, source },
            "acr read refused: repository listing unavailable",
        );
        logGrantDecision({
            markerFrom: null,
            orgId: input.orgId,
            outcome: "unavailable",
            route: input.read,
            scopes: [],
            source: null,
        });
        throw opsUnavailable();
    };
    let listing;
    try {
        listing = await readRepositoryListing({
            accessToken: input.accessToken,
            action,
            orgId: input.orgId,
        });
    } catch {
        return refuse("no_transport", "client");
    }
    const done = (
        repositoryScopes: readonly string[],
        outcome: GrantDecisionOutcome,
        source: "named" | "org-wide",
        visibleRepositories?: readonly string[],
    ): OpsAuthorization => {
        logGrantDecision({
            markerFrom: source === "org-wide" ? action : null,
            orgId: input.orgId,
            outcome,
            route: input.read,
            scopes: repositoryScopes,
            source,
        });
        return {
            orgId: input.orgId,
            repositoryScopes,
            subject: input.subject,
            ...(visibleRepositories === undefined ? {} : { visibleRepositories }),
        };
    };
    switch (listing.kind) {
        case "org-wide":
            return done(["*"], "allowed", "org-wide");
        case "named": {
            const names = canonicalRepositoryScopes(listing.repositories);
            if (
                input.selectedRepository !== undefined &&
                !names.includes(input.selectedRepository)
            ) {
                done(names, names.length > 0 ? "allowed" : "no_scopes", "named", names);
                throw selectedNotAvailable();
            }
            return done(names, names.length > 0 ? "allowed" : "no_scopes", "named", names);
        }
        case "none":
            done([], "no_scopes", "named", []);
            if (input.selectedRepository !== undefined) throw selectedNotAvailable();
            return {
                orgId: input.orgId,
                repositoryScopes: [],
                subject: input.subject,
                visibleRepositories: [],
            };
        case "too_large":
            logger.warn(
                {
                    module: "acr-read-listing",
                    orgId: input.orgId,
                    reason: "repository_allowlist_too_large",
                    route: input.read,
                },
                "acr read refused: more readable repositories than one listing may hold",
            );
            logGrantDecision({
                markerFrom: null,
                orgId: input.orgId,
                outcome: "denied",
                route: input.read,
                scopes: [],
                source: null,
            });
            throw grantLimitRefused();
        case "refused":
            return refuse(listing.reason, listing.source);
    }
}

function selectedNotAvailable(): AcrRuntimeError {
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.repositoryNotAvailable,
        "The selected repository is not available.",
        { status: 404 },
    );
}

async function readRepositoryScopes(
    input: ResolveOpsAuthorizationInput,
): Promise<OpsAuthorization> {
    if (input.read !== undefined && acrScopesFromGrantsEnabled()) {
        return readListedScopes({ ...input, read: input.read });
    }
    const candidates = await readCatalogCandidates(input);
    const { repositoryScopes, visibleRepositories } = acrScopesFromGrantsEnabled()
        ? await decidedReadScopes(input, candidates)
        : { repositoryScopes: candidates, visibleRepositories: candidates };
    if (
        input.selectedRepository !== undefined &&
        !visibleRepositories.includes(input.selectedRepository)
    ) {
        throw selectedNotAvailable();
    }
    return { orgId: input.orgId, repositoryScopes, subject: input.subject, visibleRepositories };
}
