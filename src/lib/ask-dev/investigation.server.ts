import "server-only";

import { randomUUID } from "node:crypto";

import { auth } from "@/lib/auth";
import { AcrRuntimeClient, type InvestigationStreamRequest } from "@/lib/acr/client";
import { loadAcrRuntimeConfig } from "@/lib/acr/config";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import { sessionOrError } from "@/lib/acr/service";
import { resolveAskDevAuthorization, type OpsAuthorization } from "@/lib/acr/ops";
import { validateAcrContract } from "@/lib/acr/contracts";
import { logger } from "@/lib/logger";
import { HEADER_WAIT_MAX_MS, SETUP_STEP_MAX_MS, type RunDeadline } from "./deadline";

const REQUEST_SCHEMA = "context_fabric_investigation_request.v1.schema.json";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export type PreparedInvestigation = {
    readonly authorization: OpsAuthorization;
    readonly body: string;
    readonly client: AcrRuntimeClient;
    /** Always set: the client's id, or one minted here. ACR counts its shared limits only for runs that carry one. */
    readonly submissionId: string;
    readonly threadId?: string;
};

function invalidRequest(): AcrRuntimeError {
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.invalidRequest,
        "The context request is invalid.",
        { status: 400 },
    );
}

function optionalUuid(value: string | null): string | undefined {
    if (value === null || value === "") return undefined;
    if (!UUID.test(value)) throw invalidRequest();
    return value;
}

/**
 * The per-call auth chain. It runs on EVERY request and nothing it learns is cached:
 *   1. a session with an access token, an org and a subject (else 401);
 *   2. no impersonation: an impersonated session never starts a run (else 403);
 *   3. the request body against the pinned request schema (else 400);
 *   4. BOTH entitlements `agent_context_runtime` and `ask_dev`, read fresh from ops (off or
 *      revoked: 403);
 *   5. the caller's repository scopes, read fresh from ops (an empty list: `no_repository`);
 * after which a fresh single-use assertion is signed when the stream opens.
 */
export async function prepareInvestigation(input: {
    readonly body: unknown;
    readonly signal: AbortSignal;
    readonly submissionId: string | null;
    readonly threadId: string | null;
    /** The run's absolute deadline; each setup read is bounded by what is left of it. */
    readonly deadline: RunDeadline;
}): Promise<PreparedInvestigation> {
    const rawSession = await auth();
    const session = sessionOrError(rawSession);
    if (
        rawSession?.user.real_org_id !== undefined &&
        session.orgId !== rawSession.user.real_org_id
    ) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.notEntitled,
            "Ask Dev is unavailable while impersonating.",
            { status: 403 },
        );
    }
    // A create without an id is still a submission: leaving the header out must not skip ACR's
    // concurrency and allowance counting. A supplied but invalid id is refused, never replaced.
    // A header that is present but empty is a supplied id that is not a UUID: refused, not minted.
    if (input.submissionId === "") throw invalidRequest();
    const submissionId = optionalUuid(input.submissionId) ?? randomUUID();
    const threadId = optionalUuid(input.threadId);
    if (!validateAcrContract(REQUEST_SCHEMA, input.body).valid) throw invalidRequest();
    const authorization = await resolveAskDevAuthorization({
        accessToken: session.accessToken,
        orgId: session.orgId,
        signal: input.signal,
        stepTimeoutMs: () => input.deadline.boundedMs(SETUP_STEP_MAX_MS),
        subject: session.subject,
    });
    if (authorization.repositoryScopes.length === 0) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.noRepository,
            "No repository is available to you here. Connect a repository, or ask an admin for access to one.",
            { status: 409 },
        );
    }
    return {
        authorization,
        body: JSON.stringify(input.body),
        client: new AcrRuntimeClient(loadAcrRuntimeConfig()),
        submissionId,
        ...(threadId === undefined ? {} : { threadId }),
    };
}

/**
 * The upstream call for a prepared run, sized from what is left of the deadline NOW (after
 * setup): the budget header is `floor(D - now - 5 s)` seconds and the header wait is
 * `min(15 s, D - now)`. When the budget is below ACR's minimum it throws `budget_exhausted` and
 * ACR is never called.
 */
export function streamRequest(
    prepared: PreparedInvestigation,
    input: {
        readonly requestId: string;
        readonly signal: AbortSignal;
        readonly deadline: RunDeadline;
    },
): InvestigationStreamRequest {
    const budget = input.deadline.waitBudget();
    if (!budget.ok) {
        logger.warn(
            {
                request_id: input.requestId,
                phase: "setup",
                branch: "budget_exhausted",
                elapsed_ms: input.deadline.elapsedMs(),
                remaining_ms: input.deadline.remainingMs(),
                run_timeout_ms: input.deadline.runTimeoutMs,
                wait_budget_seconds: budget.seconds,
            },
            "ask-dev run budget exhausted by setup; ACR not called",
        );
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.budgetExhausted,
            "Dev ran out of time before the question could start.",
            { retryable: true },
        );
    }
    logger.info(
        {
            request_id: input.requestId,
            elapsed_ms: input.deadline.elapsedMs(),
            run_timeout_ms: input.deadline.runTimeoutMs,
            wait_budget_seconds: budget.seconds,
        },
        "ask-dev run budget computed after setup",
    );
    return {
        authorization: prepared.authorization,
        body: prepared.body,
        headerWaitMs: input.deadline.boundedMs(HEADER_WAIT_MAX_MS),
        requestId: input.requestId,
        signal: input.signal,
        waitBudgetSeconds: budget.seconds,
        submissionId: prepared.submissionId,
        ...(prepared.threadId === undefined ? {} : { threadId: prepared.threadId }),
    };
}
