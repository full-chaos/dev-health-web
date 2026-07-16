import "server-only";

import { auth } from "@/lib/auth";
import { AcrRuntimeClient } from "./client";
import { loadAcrRuntimeConfig } from "./config";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";
import { resolveOpsAuthorization } from "./ops";
import { contextPacketRequest, parseContextPacketForm, parseEvidenceSelection } from "./protocol";

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
