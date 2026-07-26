import "server-only";

import { auth } from "@/lib/auth";
import { AcrRuntimeClient } from "./client";
import { loadAcrRuntimeConfig } from "./config";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";
import { resolveOpsAuthorization } from "./ops";
import { contextPacketRequest, parseContextPacketForm, parseEvidenceSelection } from "./protocol";

const deviceUserCode = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/u;
const repositoryScope = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u;

type WebSession = {
    readonly accessToken: string;
    readonly orgId: string;
    readonly subject: string;
    readonly isAdmin: boolean;
};

function sessionOrError(session: Awaited<ReturnType<typeof auth>>): WebSession {
    const accessToken = session?.access_token;
    const orgId = session?.user?.org_id;
    const subject = session?.user?.id;
    if (!accessToken || !orgId || !subject) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unauthenticated,
            "Authentication is required.",
            {
                status: 401,
            },
        );
    }
    return { accessToken, isAdmin: session.user.is_superuser === true, orgId, subject };
}

async function authorizedRuntime(input: {
    readonly repository: string;
    readonly signal: AbortSignal;
}): Promise<{
    readonly client: AcrRuntimeClient;
    readonly authorization: Awaited<ReturnType<typeof resolveOpsAuthorization>>;
    readonly isAdmin: boolean;
}> {
    const session = sessionOrError(await auth());
    const authorization = await resolveOpsAuthorization({
        accessToken: session.accessToken,
        orgId: session.orgId,
        selectedRepository: input.repository,
        signal: input.signal,
        subject: session.subject,
    });
    return {
        authorization,
        client: new AcrRuntimeClient(loadAcrRuntimeConfig()),
        isAdmin: session.isAdmin,
    };
}

export async function createContextPacket(input: {
    readonly body: unknown;
    readonly signal: AbortSignal;
}): Promise<unknown> {
    const form = parseContextPacketForm(input.body);
    const runtime = await authorizedRuntime({ repository: form.repository, signal: input.signal });
    const capabilities = await runtime.client.capabilities({
        authorization: runtime.authorization,
        signal: input.signal,
    });
    return runtime.client.contextPacket({
        authorization: runtime.authorization,
        body: JSON.stringify(contextPacketRequest(form, capabilities.limits, runtime.isAdmin)),
        signal: input.signal,
    });
}

export async function listAuthorizedRepositories(orgId: string): Promise<readonly string[]> {
    const session = await auth();
    const accessToken = session?.access_token;
    const subject = session?.user?.id;
    if (!accessToken || !subject) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unauthenticated,
            "Authentication is required.",
            { status: 401 },
        );
    }
    const authorization = await resolveOpsAuthorization({
        accessToken,
        orgId,
        signal: new AbortController().signal,
        subject,
    });
    return authorization.repositoryScopes;
}

export async function getExpandedEvidence(input: {
    readonly evidenceRefId: string;
    readonly repository: string | null;
    readonly signal: AbortSignal;
}): Promise<unknown> {
    const selection = parseEvidenceSelection({
        evidenceRefId: input.evidenceRefId,
        repository: input.repository,
    });
    const runtime = await authorizedRuntime({
        repository: selection.repository,
        signal: input.signal,
    });
    await runtime.client.capabilities({
        authorization: runtime.authorization,
        signal: input.signal,
    });
    return runtime.client.evidence({
        authorization: runtime.authorization,
        evidenceRefId: selection.evidenceRefId,
        signal: input.signal,
    });
}

function invalidApprovalRequest(): AcrRuntimeError {
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.invalidRequest,
        "The device approval request is invalid.",
        {
            status: 400,
        },
    );
}

function canonicalApprovalScopes(scopes: readonly string[]): readonly string[] {
    const sorted = [...scopes].sort((left, right) => left.localeCompare(right));
    if (
        scopes.length === 0 ||
        scopes.length > 100 ||
        scopes.some((scope) => !repositoryScope.test(scope)) ||
        sorted.some((scope, index) => scope !== scopes[index]) ||
        new Set(scopes).size !== scopes.length
    ) {
        throw invalidApprovalRequest();
    }
    return scopes;
}

export async function approveDeviceAuthorization(input: {
    readonly repositoryHints?: readonly string[];
    readonly repositoryScopes: readonly string[];
    readonly signal: AbortSignal;
    readonly userCode: string;
}): Promise<{ readonly status: "approved" }> {
    if (!deviceUserCode.test(input.userCode)) throw invalidApprovalRequest();
    const requestedScopes = canonicalApprovalScopes(input.repositoryScopes);
    const hintedScopes =
        input.repositoryHints === undefined
            ? undefined
            : canonicalApprovalScopes(input.repositoryHints);
    const rawSession = await auth();
    const session = sessionOrError(rawSession);
    if (
        rawSession?.user.real_org_id !== undefined &&
        session.orgId !== rawSession.user.real_org_id
    ) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.notEntitled,
            "Approval is unavailable while impersonating.",
            {
                status: 403,
            },
        );
    }
    const authorization = await resolveOpsAuthorization({
        accessToken: session.accessToken,
        orgId: session.orgId,
        signal: input.signal,
        subject: session.subject,
    });
    if (
        requestedScopes.some((scope) => !authorization.repositoryScopes.includes(scope)) ||
        (hintedScopes !== undefined &&
            requestedScopes.some((scope) => !hintedScopes.includes(scope)))
    ) {
        throw invalidApprovalRequest();
    }
    const body = JSON.stringify({
        repository_scopes: requestedScopes,
        schema_version: "device_approval_request.v1",
        user_code: input.userCode,
    });
    return new AcrRuntimeClient(loadAcrRuntimeConfig()).deviceApproval({
        authorization: { ...authorization, repositoryScopes: requestedScopes },
        body,
        signal: input.signal,
    });
}
