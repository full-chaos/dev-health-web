import "server-only";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import type { IssuanceProvenance } from "./assertion";
import { ACR_BROWSER_SCOPE, type AcrBrowserClientConfig } from "@/lib/ask-dev/acr-browser-config";
import { AcrRuntimeClient, type OAuthAuthorizeAnswer, type OAuthConsentPreview } from "./client";
import {
    issuanceProvenanceClaimsEnabled,
    loadAcrRuntimeConfig,
    loadFirstPartyBrowserClient,
    serverAcrClientConfig,
} from "./config";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";
import {
    compareScopeBytes,
    type OpsAuthorization,
    resolveIssuanceProvenance,
    resolveOpsAuthorization,
    resolveOpsCredentialIssuanceAuthorization,
} from "./ops";
import { contextPacketRequest, parseContextPacketForm, parseEvidenceSelection } from "./protocol";

const repositoryScope = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u;
// Opaque handle minted by ACR for the /acr/authorize flow — 43 base64url
// characters (the un-padded encoding of a 256-bit value).
const oauthHandlePattern = /^[A-Za-z0-9_-]{43}$/u;
// Web's consent page: ACR's 302 from /authorize names it (`ACR_OAUTH_CONSENT_URL`).
const OAUTH_CONSENT_PATH = "/acr/authorize";
/**
 * One user's silent authorizations (CHAOS-12474), on the limiter `/api/acr/authorize` uses. ACR
 * allows `/authorize` 10 a minute per source, and web is one source for all its users, so one user
 * must not take all of them: this leaves 4 for everyone else. A person needs far fewer. One attempt
 * runs per tab, every act in the tab shares it, and a reload keeps the family, so only a new tab
 * spends one: 5 new tabs and a Try again fit in a minute.
 *
 * Redis counts it, so every web replica shares one budget. It fails closed: with Redis unreachable
 * each attempt is refused, and a tab that already holds a token is not affected.
 */
const ASK_DEV_AUTHORIZE_LIMIT = {
    failClosed: true,
    maxRequests: 6,
    namespace: "ask-dev-authorize-user",
    windowMs: 60_000,
};

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
 * The session and the provenance a `credential:issue` assertion signs (CHAOS-12095, design T4c).
 * The web server derives them from its own session and a fresh Ops status read. Nothing here reads
 * the request the browser sent.
 */
async function readIssuanceContext(signal: AbortSignal): Promise<IssuanceContext> {
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
    return { provenance, session };
}

/**
 * Every `credential:issue` call starts here. It refuses while the session impersonates, by the
 * impersonation state: a same-org impersonation is refused too (chris decision 6).
 */
async function issuanceContext(signal: AbortSignal): Promise<IssuanceContext> {
    const context = await readIssuanceContext(signal);
    const { provenance, session } = context;
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
    return context;
}

type IssuanceCall = {
    readonly authorization: OpsAuthorization;
    readonly context: IssuanceContext;
};

/**
 * The authorization of ONE `credential:issue` call. Each call reads the session and the Ops
 * impersonation status again, so a context is never reused for a later call: an impersonation
 * that starts between a preview and its approval refuses the approval.
 */
async function freshIssuance(
    repositoryScopes: readonly string[],
    signal: AbortSignal,
): Promise<IssuanceCall> {
    const context = await issuanceContext(signal);
    const authorization = await resolveOpsCredentialIssuanceAuthorization({
        accessToken: context.session.accessToken,
        orgId: context.session.orgId,
        // The claims follow ACR_OAUTH_ISSUER (an ACR without their parser refuses them); the
        // impersonation refusal in issuanceContext does not.
        provenance: issuanceProvenanceClaimsEnabled() ? context.provenance : undefined,
        repositoryScopes,
        signal,
        subject: context.session.subject,
    });
    return { authorization, context };
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
    const { authorization } = await freshIssuance(requestedScopes, input.signal);
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
    const { authorization } = await freshIssuance(["*"], input.signal);
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

async function previewConsent(handle: string, signal: AbortSignal): Promise<OAuthConsentPreview> {
    const { authorization } = await freshIssuance(["*"], signal);
    return new AcrRuntimeClient(loadAcrRuntimeConfig()).oauthConsentPreview({
        authorization,
        body: JSON.stringify({ action: "preview", handle }),
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
    return previewConsent(canonicalHandle(input.handle), input.signal);
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
    const preview = await previewConsent(handle, input.signal);
    if (!isFirstPartyBrowserClient(preview)) return { kind: "review", preview };
    const { authorization, context } = await freshIssuance(["*"], input.signal);
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
    const decision = await new AcrRuntimeClient(loadAcrRuntimeConfig()).oauthConsentDecide({
        authorization,
        body: JSON.stringify({ action: "approve", handle, repository_scopes: ["*"] }),
        signal: input.signal,
    });
    logger.info(
        { module: "acr-consent", orgId: context.session.orgId, userId: context.session.subject },
        "acr browser consent approved with no click",
    );
    return { kind: "approved", redirectUrl: decision.redirectUrl };
}

/** Why the silent step gave no code (CHAOS-12474). Each is a name, with no ACR text in it. */
export type AskDevAuthorizeFailure =
    /** No browser client here (`ACR_OAUTH_ISSUER` or the web origin is unset). */
    | "client_off"
    | "impersonating"
    | "not_entitled"
    /** ACR's limit on `/authorize` or on its consent route. */
    | "rate_limited"
    /** This user's budget on this route: no ACR call was made. */
    | "user_rate_limited"
    /** ACR refused the request: a 303, a 400, or a handle it would not approve. */
    | "acr_refused"
    /** ACR answered 5xx, or nothing, or a dependency of the session read failed. */
    | "acr_unavailable"
    /** ACR's 302 did not name web's own consent page with one good handle. */
    | "bad_location"
    /** ACR's approval did not name web's own callback with exactly a code, a state and an iss. */
    | "bad_redirect"
    /** The first-party client reached the review step, which it never does. */
    | "consent_review";

export type AskDevAuthorization =
    | {
          readonly kind: "authorized";
          readonly code: string;
          readonly state: string;
          readonly iss: string;
      }
    | {
          readonly kind: "refused";
          readonly reason: AskDevAuthorizeFailure;
          readonly retryAfterSeconds?: number | undefined;
      };

function refused(
    reason: AskDevAuthorizeFailure,
    retryAfterSeconds?: number,
): Extract<AskDevAuthorization, { kind: "refused" }> {
    return { kind: "refused", reason, retryAfterSeconds };
}

/**
 * The handle in `Location`, when that is web's own consent page and carries `handle` and nothing
 * else: anything else is a named failure, so a redirect ACR did not mean for here is never used.
 */
function consentHandle(location: string | null, webOrigin: string): string | null {
    if (location === null) return null;
    let url: URL;
    try {
        url = new URL(location);
    } catch {
        return null;
    }
    if (
        url.origin !== webOrigin ||
        url.pathname !== OAUTH_CONSENT_PATH ||
        url.username !== "" ||
        url.password !== "" ||
        url.hash !== "" ||
        [...url.searchParams.keys()].join() !== "handle"
    ) {
        return null;
    }
    const handle = url.searchParams.get("handle") ?? "";
    return oauthHandlePattern.test(handle) ? handle : null;
}

/**
 * The code in ACR's approval redirect, when that URL is the client's exact redirect and holds a
 * code, a state and an iss, and nothing else. The URL itself never leaves this function.
 */
function authorizationCode(
    redirectUrl: string,
    client: AcrBrowserClientConfig,
): { readonly code: string; readonly state: string; readonly iss: string } | null {
    let url: URL;
    try {
        url = new URL(redirectUrl);
    } catch {
        return null;
    }
    if (
        `${url.origin}${url.pathname}` !== client.redirectUri ||
        url.username !== "" ||
        url.password !== "" ||
        url.hash !== "" ||
        [...url.searchParams.keys()].sort().join() !== "code,iss,state"
    ) {
        return null;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const iss = url.searchParams.get("iss");
    return code && state && iss ? { code, state, iss } : null;
}

/** ACR's `/authorize` answer as a handle, or the name of what it was instead. */
function handleOf(
    answer: OAuthAuthorizeAnswer,
    client: AcrBrowserClientConfig,
): string | Extract<AskDevAuthorization, { kind: "refused" }> {
    if (answer.status === 302) {
        return consentHandle(answer.location, client.webOrigin) ?? refused("bad_location");
    }
    if (answer.status === 429) return refused("rate_limited", answer.retryAfterSeconds);
    // A refusal redirect (303) carries an error for a browser. It is read as a refusal, never
    // followed.
    return refused(answer.status >= 500 ? "acr_unavailable" : "acr_refused");
}

function authorizeFailure(error: unknown): Extract<AskDevAuthorization, { kind: "refused" }> {
    if (!(error instanceof AcrRuntimeError)) return refused("acr_unavailable");
    switch (error.code) {
        case acrRuntimeErrorCodes.unauthenticated:
            throw error;
        case acrRuntimeErrorCodes.notEntitled:
            return refused("not_entitled");
        case acrRuntimeErrorCodes.rateLimited:
            return refused("rate_limited", error.retryAfterSeconds);
        case acrRuntimeErrorCodes.invalidRequest:
        case acrRuntimeErrorCodes.expired:
        case acrRuntimeErrorCodes.alreadyCompleted:
            return refused("acr_refused");
        default:
            return error.status === 429
                ? refused("rate_limited", error.retryAfterSeconds)
                : refused("acr_unavailable");
    }
}

/**
 * The silent step's server side (CHAOS-12474; ruling on the design amendment). The browser stays
 * the OAuth public client: it holds the verifier and runs `/token`. This runs `/authorize` from the
 * signed-in session, with what the browser cannot choose (client, redirect, resource, scope) from
 * this server's config, and gives back the code.
 *
 * In order: the session and a fresh impersonation read, so an impersonating session makes no ACR
 * call and gets no code (T13 c5); then this user's budget, which nobody else can spend; then ACR's
 * `GET /authorize`, on the server's own ACR origin as every server call is, which gives a handle;
 * then T4c's `openOAuthConsent`, which approves the first-party client with no click. A first-party
 * client that reaches review is a loud failure.
 *
 * Throws only `unauthenticated`: the route's 401.
 */
export async function authorizeAskDevBrowser(input: {
    readonly codeChallenge: string;
    readonly state: string;
    readonly signal: AbortSignal;
}): Promise<AskDevAuthorization> {
    const client = serverAcrClientConfig();
    if (client === undefined) return refused("client_off");
    try {
        const { provenance, session } = await readIssuanceContext(input.signal);
        if (provenance.impersonating) return refused("impersonating");
        const budget = await checkRateLimit(session.subject, ASK_DEV_AUTHORIZE_LIMIT);
        if (budget.limited) return refused("user_rate_limited", budget.retryAfter);
        const answer = await new AcrRuntimeClient(loadAcrRuntimeConfig()).oauthAuthorize({
            query: {
                response_type: "code",
                client_id: client.clientId,
                redirect_uri: client.redirectUri,
                code_challenge: input.codeChallenge,
                code_challenge_method: "S256",
                state: input.state,
                resource: client.issuer,
                scope: ACR_BROWSER_SCOPE,
            },
            signal: input.signal,
        });
        const handle = handleOf(answer, client);
        if (typeof handle !== "string") return handle;
        const opening = await openOAuthConsent({ handle, signal: input.signal });
        if (opening.kind !== "approved") return refused("consent_review");
        const code = authorizationCode(opening.redirectUrl, client);
        return code === null ? refused("bad_redirect") : { kind: "authorized", ...code };
    } catch (error) {
        return authorizeFailure(error);
    }
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
    if (input.action === "deny") {
        // Denial carries no repository grant — the assertion still needs a
        // repository_scopes claim, so it is bound org-wide like preview.
        const { authorization } = await freshIssuance(["*"], input.signal);
        return new AcrRuntimeClient(loadAcrRuntimeConfig()).oauthConsentDecide({
            authorization,
            body: JSON.stringify({ action: "deny", handle }),
            signal: input.signal,
        });
    }
    const requestedScopes = canonicalApprovalScopes(input.repositoryScopes ?? ["*"]);
    const preview = await previewConsent(handle, input.signal);
    const { authorization, context } = await freshIssuance(requestedScopes, input.signal);
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
    return new AcrRuntimeClient(loadAcrRuntimeConfig()).oauthConsentDecide({
        authorization,
        body: JSON.stringify({ action: "approve", handle, repository_scopes: requestedScopes }),
        signal: input.signal,
    });
}
