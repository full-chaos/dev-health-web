import "server-only";

import { randomBytes } from "node:crypto";

import {
    authorize,
    authorizeBatch,
    type AuthorizeDeps,
    type AuthzOutcome,
    type Transport,
} from "@/lib/auth/authorize/client";
import type { AuthorizeRequest } from "@/lib/auth/authorize/request";
import { loadAuthorizeTransport } from "./authorizeTransport";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";

const CONTEXT_READ_ACTION = "acr.context.read";
const MAX_BATCH = 100;
const DEFAULT_TIMEOUT_MS = 5_000;

export type GrantScopeInput = {
    /** The session access token; the decision point resolves the principal from it. */
    readonly accessToken: string;
    /** Names to ask about. Inventory is never authority: only an allow decision makes a scope. */
    readonly candidates: readonly string[];
    readonly orgId: string;
};

export type GrantScopeResult = {
    /** `["*"]` alone for a universal grant, else the allowed repositories, sorted. */
    readonly repositoryScopes: readonly string[];
    /** The repositories this principal may read, as names (never `*`). */
    readonly visibleRepositories: readonly string[];
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

function requestFor(input: GrantScopeInput, key: string): AuthorizeRequest {
    return {
        action: CONTEXT_READ_ACTION,
        principalReference: input.accessToken,
        requestId: `req_${randomBytes(20).toString("base64url").slice(0, 26)}`,
        resource: { key, organizationId: input.orgId, type: "repository" },
    };
}

function allows(outcome: AuthzOutcome, key: string): boolean {
    if (!outcome.allowed) {
        if (outcome.source === "client") throw unavailable();
        return false;
    }
    const allowlist = outcome.decision.obligations?.repositoryAllowlist;
    return allowlist === undefined || allowlist.includes(key) || allowlist.includes("*");
}

export async function resolveRepositoryScopes(
    input: GrantScopeInput,
    deps: GrantScopeDeps = { timeoutMs: DEFAULT_TIMEOUT_MS, transport: loadAuthorizeTransport() },
): Promise<GrantScopeResult> {
    if (deps.transport === null) throw unavailable();
    const clientDeps: AuthorizeDeps = { timeoutMs: deps.timeoutMs, transport: deps.transport };

    if (allows(await authorize(requestFor(input, "*"), clientDeps), "*")) {
        return { repositoryScopes: ["*"], visibleRepositories: [...input.candidates] };
    }

    const allowed: string[] = [];
    for (let start = 0; start < input.candidates.length; start += MAX_BATCH) {
        const chunk = input.candidates.slice(start, start + MAX_BATCH);
        const outcomes = await authorizeBatch(
            chunk.map((key) => requestFor(input, key)),
            clientDeps,
        );
        chunk.forEach((key, index) => {
            const outcome = outcomes[index];
            if (outcome === undefined) throw unavailable();
            if (allows(outcome, key)) allowed.push(key);
        });
    }
    return { repositoryScopes: allowed, visibleRepositories: allowed };
}
