import "server-only";

import { randomBytes } from "node:crypto";

import {
    authorize,
    authorizeBatch,
    authorizeRepositories,
    type AuthorizeDeps,
    type AuthzOutcome,
    type Transport,
} from "@/lib/auth/authorize/client";
import type { AuthorizeRequest } from "@/lib/auth/authorize/request";
import { logger as defaultLogger } from "@/lib/logger";
import { loadAuthorizeTransport } from "./authorizeTransport";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";

export const CONTEXT_READ_ACTION = "acr.context.read";
export const EVIDENCE_READ_ACTION = "acr.evidence.read";
const CREDENTIAL_ISSUE_ACTION = "acr.credential.issue";
const MAX_BATCH = 100;
const DEFAULT_TIMEOUT_MS = 5_000;

export type RepositoryReadAction = typeof CONTEXT_READ_ACTION | typeof EVIDENCE_READ_ACTION;

export type GrantScopeInput = {
    /** The session access token; the decision point resolves the principal from it. */
    readonly accessToken: string;
    /** The repository read the scopes are for; `acr.context.read` when unset. */
    readonly action?: RepositoryReadAction;
    /** Names to ask about. Inventory is never authority: only an allow decision makes a scope. */
    readonly candidates: readonly string[];
    readonly orgId: string;
};

export type GrantScopeResult = {
    /**
     * The allowed repositories, in the candidates' order. A universal grant allows every candidate,
     * so the scopes are the candidates themselves: byte for byte the legacy catalog scopes.
     */
    readonly repositoryScopes: readonly string[];
    /** The repositories this principal may read, as names (never `*`). */
    readonly visibleRepositories: readonly string[];
};

export type GrantDecisionResult = GrantScopeResult & {
    /** True when an allow carried `repository_scope: organization`: the principal reads every repository. */
    readonly orgWide: boolean;
};

export type GrantScopeDeps = {
    readonly timeoutMs: number;
    readonly transport: Transport | null;
};

export function acrScopesFromGrantsEnabled(): boolean {
    const value = process.env.ACR_SCOPES_FROM_GRANTS?.trim().toLowerCase();
    return value === "1" || value === "true";
}

function unavailable(): AcrRuntimeError {
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.unavailable,
        "Agent Context Runtime is temporarily unavailable.",
        { retryable: true },
    );
}

function defaultDeps(): GrantScopeDeps {
    return { timeoutMs: DEFAULT_TIMEOUT_MS, transport: loadAuthorizeTransport() };
}

function newRequestId(): string {
    return `req_${randomBytes(20).toString("base64url").slice(0, 26)}`;
}

function requestFor(input: GrantScopeInput, key: string): AuthorizeRequest {
    return {
        action: input.action ?? CONTEXT_READ_ACTION,
        principalReference: input.accessToken,
        requestId: newRequestId(),
        resource: { key, organizationId: input.orgId, type: "repository" },
    };
}

type Verdict = { readonly allowed: boolean; readonly orgWide: boolean };

/**
 * A repository read decision as allow / org-wide. A client-side failure refuses: never a partial
 * answer. An allow grants the key only through `repository_scope: organization` or an allowlist that
 * holds the key or `*`; an allow with neither member grants nothing (fail closed).
 */
function verdictOf(outcome: AuthzOutcome, key: string): Verdict {
    if (!outcome.allowed) {
        if (outcome.source === "client") throw unavailable();
        return { allowed: false, orgWide: false };
    }
    const obligations = outcome.decision.obligations;
    if (obligations?.repositoryScope === "organization") return { allowed: true, orgWide: true };
    const allowlist = obligations?.repositoryAllowlist;
    return {
        allowed: allowlist !== undefined && (allowlist.includes(key) || allowlist.includes("*")),
        orgWide: false,
    };
}

export async function resolveRepositoryScopes(
    input: GrantScopeInput,
    deps: GrantScopeDeps = defaultDeps(),
): Promise<GrantScopeResult> {
    const { repositoryScopes, visibleRepositories } = await resolveRepositoryDecisions(input, deps);
    return { repositoryScopes, visibleRepositories };
}

/** resolveRepositoryScopes with the org-wide marker of its decisions. */
export async function resolveRepositoryDecisions(
    input: GrantScopeInput,
    deps: GrantScopeDeps = defaultDeps(),
): Promise<GrantDecisionResult> {
    if (deps.transport === null) throw unavailable();
    const clientDeps: AuthorizeDeps = { timeoutMs: deps.timeoutMs, transport: deps.transport };

    const universal = verdictOf(await authorize(requestFor(input, "*"), clientDeps), "*");
    if (universal.allowed) {
        return {
            orgWide: universal.orgWide,
            repositoryScopes: [...input.candidates],
            visibleRepositories: [...input.candidates],
        };
    }

    const allowed: string[] = [];
    let orgWide = false;
    for (let start = 0; start < input.candidates.length; start += MAX_BATCH) {
        const chunk = input.candidates.slice(start, start + MAX_BATCH);
        const outcomes = await authorizeBatch(
            chunk.map((key) => requestFor(input, key)),
            clientDeps,
        );
        chunk.forEach((key, index) => {
            const outcome = outcomes[index];
            if (outcome === undefined) throw unavailable();
            const verdict = verdictOf(outcome, key);
            if (verdict.allowed) allowed.push(key);
            orgWide = orgWide || verdict.orgWide;
        });
    }
    return { orgWide, repositoryScopes: allowed, visibleRepositories: allowed };
}

/**
 * What the repository listing says a principal may read under one read action. `refused` and `too_large`
 * carry the wire reason (or the client failure) so the caller can log it and map it to an answer.
 */
export type RepositoryListing =
    | { readonly kind: "org-wide" }
    | { readonly kind: "named"; readonly repositories: readonly string[] }
    | { readonly kind: "none"; readonly reason: string }
    | { readonly kind: "too_large" }
    | { readonly kind: "refused"; readonly reason: string; readonly source: "client" | "pdp" };

/** Deny reasons that say "this principal reads nothing here": the per-key reads answer the same. */
const NO_ACCESS_REASONS: ReadonlySet<string> = new Set([
    "delegation_invalid",
    "grant_absent",
    "grant_expired",
    "grant_revoked",
    "impersonation_denied",
    "no_membership",
    "org_mismatch",
    "organization_inactive",
    "platform_role_absent",
    "principal_inactive",
    "repository_not_granted",
    "role_lacks_action",
    "role_scope_mismatch",
    "role_unknown",
    "service_account_inactive",
]);

/**
 * One listing call (`POST /v1/authorize:repositories`): the repositories the principal may read, no catalog read.
 * An allow with `repository_scope: organization` (or an allowlist holding `*`) is org-wide; an allow with an
 * allowlist is the principal's own keys (at most 256); an allow with neither member grants nothing (fail
 * closed). Never a partial list: a client failure or a deny outside the no-access set is `refused`.
 */
export async function readRepositoryListing(
    input: {
        readonly accessToken: string;
        readonly action: RepositoryReadAction;
        readonly orgId: string;
    },
    deps: GrantScopeDeps = defaultDeps(),
): Promise<RepositoryListing> {
    if (deps.transport === null) throw unavailable();
    const outcome = await authorizeRepositories(requestFor({ ...input, candidates: [] }, "*"), {
        timeoutMs: deps.timeoutMs,
        transport: deps.transport,
    });
    if (!outcome.allowed) {
        if (outcome.source === "client") {
            return { kind: "refused", reason: outcome.reason, source: "client" };
        }
        const reason = outcome.decision.reasonCode;
        if (reason === "repository_allowlist_too_large") return { kind: "too_large" };
        return NO_ACCESS_REASONS.has(reason)
            ? { kind: "none", reason }
            : { kind: "refused", reason, source: "pdp" };
    }
    const obligations = outcome.decision.obligations;
    if (obligations?.repositoryScope === "organization") return { kind: "org-wide" };
    const allowlist = obligations?.repositoryAllowlist;
    if (allowlist === undefined) return { kind: "none", reason: "no_scope_member" };
    if (allowlist.includes("*")) return { kind: "org-wide" };
    return { kind: "named", repositories: [...allowlist] };
}

export type CredentialIssueVerdict = Verdict & {
    /**
     * The allow's `repository_allowlist`: the repositories of the principal's live grants whose role holds the
     * action (ops scope.go). Empty for an org-wide allow, a deny, and an allow that carries no list (fail closed).
     */
    readonly repositoryAllowlist: readonly string[];
    /** A deny `repository_allowlist_too_large`: more grants than one decision may list. */
    readonly overLimit: boolean;
};

/**
 * One `acr.credential.issue` decision on the session organization (device approval, consent). A
 * deny is `allowed: false`. No transport, or no valid answer, refuses (unavailable): there is no
 * fallback to the legacy rule while the switch is on. `orgWide` is the allow's
 * `repository_scope: organization` (membership default, wildcard grant, or platform admin).
 */
export async function decideCredentialIssue(
    input: { readonly accessToken: string; readonly orgId: string },
    deps: GrantScopeDeps = defaultDeps(),
): Promise<CredentialIssueVerdict> {
    if (deps.transport === null) throw unavailable();
    const outcome = await authorize(
        {
            action: CREDENTIAL_ISSUE_ACTION,
            principalReference: input.accessToken,
            requestId: newRequestId(),
            resource: { key: input.orgId, organizationId: input.orgId, type: "organization" },
        },
        { timeoutMs: deps.timeoutMs, transport: deps.transport },
    );
    if (!outcome.allowed) {
        if (outcome.source === "client") throw unavailable();
        return {
            allowed: false,
            orgWide: false,
            overLimit: outcome.decision.reasonCode === "repository_allowlist_too_large",
            repositoryAllowlist: [],
        };
    }
    const obligations = outcome.decision.obligations;
    const orgWide = obligations?.repositoryScope === "organization";
    return {
        allowed: true,
        orgWide,
        overLimit: false,
        repositoryAllowlist: orgWide ? [] : (obligations?.repositoryAllowlist ?? []),
    };
}

export type GrantDecisionRoute = "consent" | "context" | "device" | "evidence";
export type GrantDecisionOutcome = "allowed" | "denied" | "no_scopes" | "unavailable";

export interface GrantDecisionLogger {
    info(fields: Record<string, unknown>, message: string): void;
}

export const GRANT_DECISION_MESSAGE = "acr scopes decided from grants";

/**
 * The one Info line per switch-on decision (the prod watcher reads it after the flip). The field set
 * is closed: no token, credential, assertion, code, handle or secret.
 */
export function logGrantDecision(
    record: {
        readonly route: GrantDecisionRoute;
        readonly orgId: string;
        readonly outcome: GrantDecisionOutcome;
        readonly scopes: readonly string[];
        /** "org-wide": a decision carried repository_scope organization; "named": the allowed list. */
        readonly source: "named" | "org-wide" | null;
        /** The action whose decision carried the org-wide marker. */
        readonly markerFrom: string | null;
    },
    log: GrantDecisionLogger = defaultLogger,
): void {
    const wildcard = record.scopes.length === 1 && record.scopes[0] === "*";
    log.info(
        {
            module: "acr-grant-scopes",
            route: record.route,
            orgId: record.orgId,
            outcome: record.outcome,
            scopeCount: wildcard ? null : record.scopes.length,
            scopes: wildcard ? "*" : [...record.scopes],
            source: record.source,
            markerFrom: record.markerFrom,
        },
        GRANT_DECISION_MESSAGE,
    );
}
