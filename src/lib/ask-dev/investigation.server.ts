import "server-only";

import { auth } from "@/lib/auth";
import { AcrRuntimeClient, type InvestigationStreamRequest } from "@/lib/acr/client";
import { loadAcrRuntimeConfig } from "@/lib/acr/config";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import { sessionOrError } from "@/lib/acr/service";
import { resolveAskDevAuthorization, type OpsAuthorization } from "@/lib/acr/ops";
import { validateAcrContract } from "@/lib/acr/contracts";

const REQUEST_SCHEMA = "context_fabric_investigation_request.v1.schema.json";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** Longest wait for ACR to answer with headers (admission). I-11 replaces it with the run deadline. */
export const HEADER_WAIT_MS = 15_000;

export type PreparedInvestigation = {
    readonly authorization: OpsAuthorization;
    readonly body: string;
    readonly client: AcrRuntimeClient;
    readonly submissionId?: string;
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
    const submissionId = optionalUuid(input.submissionId);
    const threadId = optionalUuid(input.threadId);
    if (!validateAcrContract(REQUEST_SCHEMA, input.body).valid) throw invalidRequest();
    const authorization = await resolveAskDevAuthorization({
        accessToken: session.accessToken,
        orgId: session.orgId,
        signal: input.signal,
        subject: session.subject,
    });
    if (authorization.repositoryScopes.length === 0) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.noRepository,
            "Connect a repository to ask Dev a question.",
            { status: 409 },
        );
    }
    return {
        authorization,
        body: JSON.stringify(input.body),
        client: new AcrRuntimeClient(loadAcrRuntimeConfig()),
        ...(submissionId === undefined ? {} : { submissionId }),
        ...(threadId === undefined ? {} : { threadId }),
    };
}

export function streamRequest(
    prepared: PreparedInvestigation,
    input: { readonly requestId: string; readonly signal: AbortSignal },
): InvestigationStreamRequest {
    return {
        authorization: prepared.authorization,
        body: prepared.body,
        headerWaitMs: HEADER_WAIT_MS,
        requestId: input.requestId,
        signal: input.signal,
        ...(prepared.submissionId === undefined ? {} : { submissionId: prepared.submissionId }),
        ...(prepared.threadId === undefined ? {} : { threadId: prepared.threadId }),
    };
}
