import "server-only";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { IssuanceProvenance } from "./assertion";
import { AcrRuntimeClient, type OAuthConsentPreview } from "./client";
import {
    issuanceProvenanceClaimsEnabled,
    loadAcrRuntimeConfig,
    loadFirstPartyBrowserClient,
} from "./config";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";
import {
    compareScopeBytes,
    resolveIssuanceProvenance,
    resolveOpsAuthorization,
    resolveOpsCredentialIssuanceAuthorization,
} from "./ops";
import { contextPacketRequest, parseContextPacketForm, parseEvidenceSelection } from "./protocol";

const repositoryScope = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u;
// Opaque handle minted by ACR for the /acr/authorize flow — 43 base64url
// characters (the un-padded encoding of a 256-bit value).
const oauthHandlePattern = /^[A-Za-z0-9_-]{43}$/u;

export type WebSession = {
    readonly accessToken: string;
    readonly orgId: string;
    readonly subject: string;
    readonly isPlatformAdmin: boolean;
};

export function sessionOrError(session: Awaited<ReturnType<typeof auth>>): WebSession {
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
    return {
        accessToken,
        isPlatformAdmin: session.user.is_superuser === true,
        orgId,
        subject,
    };
}

async function authorizedRuntime(input: {
    readonly repository: string;
    readonly signal: AbortSignal;
}): Promise<{
    readonly client: AcrRuntimeClient;
    readonly authorization: Awaited<ReturnType<typeof resolveOpsAuthorization>>;
    readonly isPlatformAdmin: boolean;
}> {
    const session = sessionOrError(await auth());
    const authorization = await resolveOpsAuthorization({
        accessToken: session.accessToken,
        orgId: session.orgId,
        platformValidation: session.isPlatformAdmin,
        selectedRepository: input.repository,
        signal: input.signal,
        subject: session.subject,
    });
    return {
        authorization,
        client: new AcrRuntimeClient(loadAcrRuntimeConfig()),
        isPlatformAdmin: session.isPlatformAdmin,
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
        body: JSON.stringify(
            contextPacketRequest(form, capabilities.limits, runtime.isPlatformAdmin),
        ),
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
        platformValidation: session?.user?.is_superuser === true,
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

function invalidOAuthConsentRequest(): AcrRuntimeError {
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.invalidRequest,
        "The authorization request is invalid.",
        { status: 400 },
    );
}

function canonicalHandle(handle: string): string {
    if (!oauthHandlePattern.test(handle)) throw invalidOAuthConsentRequest();
    return handle;
}

type IssuanceContext = {
    readonly provenance: IssuanceProvenance;
    readonly session: WebSession;
};

/**
 * Every `credential:issue` call starts here (CHAOS-12095, design T4c). The web server derives the
 * provenance it signs from its own session and a fresh Ops status read, and refuses while the
 * session impersonates, by the impersonation state: a same-org impersonation is refused too
 * (chris decision 6). Nothing here reads the request the browser sent.
 */
async function issuanceContext(signal: AbortSignal): Promise<IssuanceContext> {
    const rawSession = await auth();
    const session = sessionOrError(rawSession);
    const realOrgId = rawSession?.user.real_org_id;
    const provenance = await resolveIssuanceProvenance({
        accessToken: session.accessToken,
        sessionImpersonating:
            rawSession?.user.is_impersonating === true ||
            (realOrgId !== undefined && realOrgId !== session.orgId),
        signal,
        subject: session.subject,
    });
    if (provenance.impersonating) {
        logger.warn(
            { module: "acr-consent", orgId: session.orgId, userId: session.subject },
            "acr credential issue refused: the session is impersonating",
        );
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.notEntitled,
            "Approval is unavailable while impersonating.",
            {
                status: 403,
            },
        );
    }
    return { provenance, session };
}

function issuanceAuthorization(
    context: IssuanceContext,
    repositoryScopes: readonly string[],
    signal: AbortSignal,
): ReturnType<typeof resolveOpsCredentialIssuanceAuthorization> {
    return resolveOpsCredentialIssuanceAuthorization({
        accessToken: context.session.accessToken,
        orgId: context.session.orgId,
        // The claims follow ACR_OAUTH_ISSUER (an ACR without their parser refuses them); the
        // impersonation refusal in issuanceContext does not.
        provenance: issuanceProvenanceClaimsEnabled() ? context.provenance : undefined,
        repositoryScopes,
        signal,
        subject: context.session.subject,
    });
}

function canonicalApprovalScopes(scopes: readonly string[]): readonly string[] {
    if (scopes.length === 1 && scopes[0] === "*") return scopes;
    const sorted = [...scopes].sort(compareScopeBytes);
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
    readonly repositoryScopes: readonly string[];
    readonly signal: AbortSignal;
    readonly userCode: string;
}): Promise<{ readonly status: "approved" }> {
    const requestedScopes = canonicalApprovalScopes(input.repositoryScopes);
    const context = await issuanceContext(input.signal);
    const authorization = await issuanceAuthorization(context, requestedScopes, input.signal);
    const body = JSON.stringify({
        repository_scopes: requestedScopes,
        schema_version: "device_approval_request.v1",
        user_code: input.userCode,
    });
    return new AcrRuntimeClient(loadAcrRuntimeConfig()).deviceApproval({
        authorization,
        body,
        signal: input.signal,
    });
}

export async function previewDeviceAuthorization(input: {
    readonly signal: AbortSignal;
    readonly userCode: string;
}): Promise<{
    readonly organizationIdHint?: string;
    readonly repositoryHints: readonly string[];
}> {
    const context = await issuanceContext(input.signal);
    const authorization = await issuanceAuthorization(context, ["*"], input.signal);
    const body = JSON.stringify({
        schema_version: "device_approval_preview_request.v1",
        user_code: input.userCode,
    });
    return new AcrRuntimeClient(loadAcrRuntimeConfig()).deviceApprovalPreview({
        authorization,
        body,
        signal: input.signal,
    });
}

async function previewWith(
    context: IssuanceContext,
    handle: string,
    signal: AbortSignal,
): Promise<OAuthConsentPreview> {
    const authorization = await issuanceAuthorization(context, ["*"], signal);
    return new AcrRuntimeClient(loadAcrRuntimeConfig()).oauthConsentPreview({
        authorization,
        body: JSON.stringify({ action: "preview", handle }),
        signal,
    });
}

async function approveWith(
    context: IssuanceContext,
    handle: string,
    repositoryScopes: readonly string[],
    signal: AbortSignal,
): Promise<{ readonly redirectUrl: string }> {
    const authorization = await issuanceAuthorization(context, repositoryScopes, signal);
    return new AcrRuntimeClient(loadAcrRuntimeConfig()).oauthConsentDecide({
        authorization,
        body: JSON.stringify({ action: "approve", handle, repository_scopes: repositoryScopes }),
        signal,
    });
}

/**
 * The first-party browser client (CHAOS-12095): ACR bound the request to its own issuer, which it
 * binds for that client only (CHAOS-12123), the code comes back to this web origin, and the client
 * is not self-asserted. Every value compared comes from ACR's preview and this server's config.
 */
function isFirstPartyBrowserClient(preview: OAuthConsentPreview): boolean {
    const client = loadFirstPartyBrowserClient();
    return (
        client !== undefined &&
        !preview.clientSelfAsserted &&
        preview.resource === client.resource &&
        preview.redirectOrigin === client.webOrigin
    );
}

export async function previewOAuthConsent(input: {
    readonly handle: string;
    readonly signal: AbortSignal;
}): Promise<OAuthConsentPreview> {
    const handle = canonicalHandle(input.handle);
    const context = await issuanceContext(input.signal);
    return previewWith(context, handle, input.signal);
}

export type OAuthConsentOpening =
    | { readonly kind: "approved"; readonly redirectUrl: string }
    | { readonly kind: "review"; readonly preview: OAuthConsentPreview };

/**
 * The consent page's server step. A third-party (MCP) client gets the preview to review and choose
 * repositories. The first-party browser client gets no click (chris decision 2): a valid web
 * session approves it here, server to server through ACR's consent route, with the live org scope
 * grant (`["*"]`; ACR re-checks the scope on each call). That approval needs the session's `sid`.
 */
export async function openOAuthConsent(input: {
    readonly handle: string;
    readonly signal: AbortSignal;
}): Promise<OAuthConsentOpening> {
    const handle = canonicalHandle(input.handle);
    const context = await issuanceContext(input.signal);
    const preview = await previewWith(context, handle, input.signal);
    if (!isFirstPartyBrowserClient(preview)) return { kind: "review", preview };
    if (context.provenance.sessionId === undefined) {
        logger.warn(
            {
                module: "acr-consent",
                orgId: context.session.orgId,
                userId: context.session.subject,
            },
            "acr browser consent refused: the session has no sid; sign in again",
        );
        throw invalidOAuthConsentRequest();
    }
    const decision = await approveWith(context, handle, ["*"], input.signal);
    logger.info(
        { module: "acr-consent", orgId: context.session.orgId, userId: context.session.subject },
        "acr browser consent approved with no click",
    );
    return { kind: "approved", redirectUrl: decision.redirectUrl };
}

/**
 * The consent page's buttons. Approve is for third-party clients only: the first-party browser
 * client's grant is never chosen by the browser, so an approve for it is refused here.
 */
export async function decideOAuthConsent(input: {
    readonly action: "approve" | "deny";
    readonly handle: string;
    readonly repositoryScopes?: readonly string[];
    readonly signal: AbortSignal;
}): Promise<{ readonly redirectUrl: string }> {
    const handle = canonicalHandle(input.handle);
    const requestedScopes =
        input.action === "approve"
            ? canonicalApprovalScopes(input.repositoryScopes ?? ["*"])
            : undefined;
    const context = await issuanceContext(input.signal);
    if (requestedScopes === undefined) {
        // Denial carries no repository grant — the assertion still needs a
        // repository_scopes claim, so it is bound org-wide like preview.
        const authorization = await issuanceAuthorization(context, ["*"], input.signal);
        return new AcrRuntimeClient(loadAcrRuntimeConfig()).oauthConsentDecide({
            authorization,
            body: JSON.stringify({ action: "deny", handle }),
            signal: input.signal,
        });
    }
    const preview = await previewWith(context, handle, input.signal);
    if (isFirstPartyBrowserClient(preview)) {
        logger.warn(
            {
                module: "acr-consent",
                orgId: context.session.orgId,
                userId: context.session.subject,
            },
            "acr consent approve refused: the first-party browser client is approved by the server only",
        );
        throw invalidOAuthConsentRequest();
    }
    return approveWith(context, handle, requestedScopes, input.signal);
}
