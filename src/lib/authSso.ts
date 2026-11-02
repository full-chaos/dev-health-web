import "server-only";
import { readAnswerTokens, wireConfigUsable, type WireConfig } from "@/lib/authServiceWire";
import { resolveTokenClass } from "@/lib/authServiceClient";
import type { CallResult } from "@/lib/authServiceOutcome";
import { logSessionBranch, thrownErrorName } from "@/lib/authSessionLog";
import { getServerEnv } from "@/lib/config";
import { deadlineFetch } from "@/lib/serverDeadline";

// Enterprise SSO (OIDC, SAML) spoken to auth-service on the go-api compat wire (CHAOS-10878). The
// tokens of the answer never leave the server: a route calls complete*, seals the session into a
// ticket (sealSsoTicket in auth.ts) and signs in through the `sso` provider. The login cookies are
// bound to exact paths of the web origin, so only the two login-nonce cookies cross between the
// browser and the backend. A refusal is read from the body's `reason` only.

export type SsoFailureCode =
    | "sso_not_member"
    | "sso_identity_conflict"
    | "sso_not_licensed"
    | "sso_unavailable"
    | "sso_failed";

export interface SsoSession {
    readonly userId: string;
    readonly email?: string;
    readonly orgId: string;
    readonly role?: string;
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly expiresIn?: number;
    readonly accessExp?: number;
    readonly sid?: string;
    readonly sessionAccessToken?: string;
    readonly sessionExp?: number;
    readonly actorSub?: string;
}

export type SsoStartResult =
    | { kind: "ok"; redirectUrl: string; setCookies: string[] }
    | { kind: "refused"; code: SsoFailureCode }
    | { kind: "disabled" };

export type SsoCompleteResult =
    | { kind: "ok"; session: SsoSession; clearCookies: string[] }
    | { kind: "refused"; code: SsoFailureCode; clearCookies: string[] }
    | { kind: "disabled" };

const COOKIE_PREFIXES = ["dho_oidc_login_nonce_", "dho_saml_login_nonce_"] as const;
const PROVIDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined =>
    typeof v === "string" && v !== "" ? v : undefined;

export function ssoEnabled(): boolean {
    const raw = getServerEnv().AUTH_SSO_ENABLED;
    return raw === "true" || raw === "1";
}

const hasNoncePrefix = (name: string): boolean => COOKIE_PREFIXES.some((p) => name.startsWith(p));

/** The Cookie header for the backend: the login-nonce cookies of the request, nothing else. */
export function ssoCookieHeader(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const kept = header
        .split(";")
        .map((part) => part.trim())
        .filter((part) => hasNoncePrefix(part.split("=")[0] ?? ""));
    return kept.length === 0 ? undefined : kept.join("; ");
}

/** The Set-Cookie lines to relay to the browser: the login-nonce cookies, unchanged. */
export function ssoSetCookies(setCookies: readonly string[]): string[] {
    return setCookies.filter((line) => hasNoncePrefix(line.split("=")[0]?.trim() ?? ""));
}

const isTransient = (status: number): boolean =>
    status === 408 || status === 425 || status === 429 || status >= 500;

export function classifySsoRefusal(result: CallResult): SsoFailureCode {
    if ("thrown" in result) return "sso_unavailable";
    const { status, body } = result;
    if (isTransient(status)) return "sso_unavailable";
    if (status === 402) return "sso_not_licensed";
    if (status === 409) return "sso_identity_conflict";
    if (status === 403) {
        const detail = isObject(body) && isObject(body.detail) ? body.detail : undefined;
        return detail?.reason === "membership_required" ? "sso_not_member" : "sso_failed";
    }
    return "sso_failed";
}

interface Sent {
    readonly result: CallResult;
    readonly setCookies: string[];
}

async function post(
    cfg: WireConfig,
    path: string,
    body: unknown,
    cookie: string | undefined,
): Promise<Sent> {
    try {
        const res = await deadlineFetch("auth")(`${cfg.backendUrl}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(cookie === undefined ? {} : { Cookie: cookie }),
            },
            body: JSON.stringify(body),
        });
        let parsed: unknown;
        try {
            parsed = await res.json();
        } catch {
            parsed = undefined;
        }
        return {
            result: { status: res.status, body: parsed },
            setCookies: ssoSetCookies(res.headers.getSetCookie()),
        };
    } catch (error) {
        logSessionBranch({
            operation: "sso_login",
            branch: "login_unavailable",
            errorName: thrownErrorName(error),
        });
        return { result: { thrown: true }, setCookies: [] };
    }
}

const ok2xx = (result: CallResult): result is { status: number; body: unknown } =>
    "status" in result && result.status >= 200 && result.status < 300;

function idpUrl(value: unknown): string | undefined {
    const raw = text(value);
    if (raw === undefined) return undefined;
    try {
        const url = new URL(raw);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

async function start(
    cfg: WireConfig,
    providerId: string,
    route: "oidc/authorize" | "saml/initiate",
    body: unknown,
): Promise<SsoStartResult> {
    if (!ssoEnabled()) return { kind: "disabled" };
    if (!PROVIDER_ID.test(providerId)) return { kind: "refused", code: "sso_failed" };
    const [protocol, step] = route.split("/");
    const sent = await post(cfg, `/api/v1/auth/${protocol}/${providerId}/${step}`, body, undefined);
    if (!ok2xx(sent.result)) return { kind: "refused", code: classifySsoRefusal(sent.result) };
    const answer = sent.result.body;
    const redirectUrl = idpUrl(
        isObject(answer)
            ? route === "oidc/authorize"
                ? answer.authorization_url
                : answer.redirect_url
            : undefined,
    );
    if (redirectUrl === undefined) return { kind: "refused", code: "sso_failed" };
    return { kind: "ok", redirectUrl, setCookies: sent.setCookies };
}

export function startOidc(
    input: { readonly providerId: string; readonly redirectUri: string },
    cfg: WireConfig,
): Promise<SsoStartResult> {
    return start(cfg, input.providerId, "oidc/authorize", { redirect_uri: input.redirectUri });
}

export function startSaml(
    input: { readonly providerId: string },
    cfg: WireConfig,
): Promise<SsoStartResult> {
    return start(cfg, input.providerId, "saml/initiate", {});
}

async function readSession(body: unknown, cfg: WireConfig): Promise<SsoSession | SsoFailureCode> {
    if (!isObject(body)) return "sso_failed";
    const accessToken = text(body.access_token);
    const refreshToken = text(body.refresh_token);
    const userId = text(body.user_id);
    const orgId = text(body.org_id);
    if (!accessToken || !refreshToken || !userId || !orgId) {
        logSessionBranch({ operation: "sso_login", branch: "login_invalid_response" });
        return "sso_failed";
    }
    const tokens = await readAnswerTokens(
        { accessToken, sessionAccessToken: body.session_access_token },
        cfg,
        "sso_login",
    );
    if (!tokens.ok) {
        if (tokens.reason === "unavailable") return "sso_unavailable";
        // A refused service token logged its own branch.
        if (tokens.cause !== "session") {
            logSessionBranch({
                operation: "sso_login",
                branch: tokens.cause === "shape" ? "token_shape_refused" : "login_invalid_response",
            });
        }
        return "sso_failed";
    }
    // Under eddsa the verified token names the org: an answer that says another one is refused.
    if (resolveTokenClass(cfg.tokenClassRaw) === "eddsa" && tokens.orgId !== orgId) {
        logSessionBranch({ operation: "sso_login", branch: "sso_org_mismatch" });
        return "sso_failed";
    }
    const email = text(body.email);
    const role = text(body.role);
    const expiresIn =
        typeof body.expires_in === "number" &&
        Number.isInteger(body.expires_in) &&
        body.expires_in > 0
            ? body.expires_in
            : undefined;
    return {
        userId,
        ...(email === undefined ? {} : { email }),
        orgId,
        ...(role === undefined ? {} : { role }),
        accessToken,
        refreshToken,
        ...(expiresIn === undefined ? {} : { expiresIn }),
        ...(tokens.accessExp === undefined ? {} : { accessExp: tokens.accessExp }),
        ...(tokens.sid === undefined ? {} : { sid: tokens.sid }),
        ...(tokens.session.kind === "ok"
            ? { sessionAccessToken: tokens.session.token, sessionExp: tokens.session.exp }
            : {}),
        ...(typeof tokens.actor === "string" ? { actorSub: tokens.actor } : {}),
    };
}

async function complete(
    cfg: WireConfig,
    providerId: string,
    route: "oidc/callback" | "saml/acs",
    body: unknown,
    cookies: string | undefined,
): Promise<SsoCompleteResult> {
    if (!ssoEnabled()) return { kind: "disabled" };
    if (!PROVIDER_ID.test(providerId))
        return { kind: "refused", code: "sso_failed", clearCookies: [] };
    if (!wireConfigUsable(cfg, "sso_login")) {
        return { kind: "refused", code: "sso_unavailable", clearCookies: [] };
    }
    const [protocol, step] = route.split("/");
    const sent = await post(
        cfg,
        `/api/v1/auth/${protocol}/${providerId}/${step}`,
        body,
        ssoCookieHeader(cookies),
    );
    const clearCookies = sent.setCookies;
    if (!ok2xx(sent.result)) {
        return { kind: "refused", code: classifySsoRefusal(sent.result), clearCookies };
    }
    const session = await readSession(sent.result.body, cfg);
    return typeof session === "string"
        ? { kind: "refused", code: session, clearCookies }
        : { kind: "ok", session, clearCookies };
}

export function completeOidc(
    input: {
        readonly providerId: string;
        readonly code: string;
        readonly state: string;
        readonly cookies: string | undefined;
    },
    cfg: WireConfig,
): Promise<SsoCompleteResult> {
    return complete(
        cfg,
        input.providerId,
        "oidc/callback",
        { code: input.code, state: input.state },
        input.cookies,
    );
}

export function completeSaml(
    input: {
        readonly providerId: string;
        readonly samlResponse: string;
        readonly relayState?: string;
        readonly cookies: string | undefined;
    },
    cfg: WireConfig,
): Promise<SsoCompleteResult> {
    return complete(
        cfg,
        input.providerId,
        "saml/acs",
        {
            SAMLResponse: input.samlResponse,
            ...(input.relayState === undefined ? {} : { RelayState: input.relayState }),
        },
        input.cookies,
    );
}
