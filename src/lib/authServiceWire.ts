import "server-only";
import { parseStrictJson } from "@/lib/auth/accesstoken/strictjson";
import type { VerifyContext } from "@/lib/auth/accesstoken/verify";
import { publishedKeysFor } from "@/lib/authKeySource";
import {
    readAccessToken,
    readSessionAccessToken,
    resolveTokenClass,
    type AccessTokenOk,
    type SessionAccessTokenRead,
    type TokenClass,
} from "@/lib/authServiceClient";
import {
    classifyLogin,
    classifyLogout,
    classifyRefresh,
    singleFlightRefresh,
    type CallResult,
    type LogoutOutcome,
    type SessionUser,
} from "@/lib/authServiceOutcome";
import { logSessionBranch, thrownErrorName } from "@/lib/authSessionLog";
import { getServerEnv } from "@/lib/config";
import { getBackendUrl } from "@/lib/origin";
import { deadlineFetch } from "@/lib/serverDeadline";

// The credentials login and the logout, spoken to auth-service on the go-api compat wire
// (CHAOS-10876). Outcomes are the closed tables of authServiceOutcome; this module adds the call,
// the access-token class rules and the key set. A log line holds an operation, a branch, a status
// and an error name, never a token, an address or a password.

export type WireOperation = "login" | "refresh" | "switch_org" | "change_password" | "social_login";

export interface WireConfig {
    /** AUTH_ACCESS_TOKEN_CLASS as set; unset = hs256_compat. */
    readonly tokenClassRaw: string | undefined;
    /** AUTH_ACCESS_TOKEN_ISSUER, the pinned issuer; needed under class eddsa. */
    readonly issuer: string | undefined;
    readonly backendUrl: string;
    readonly nowSeconds?: () => number;
}

const nowOf = (cfg: WireConfig): number => cfg.nowSeconds?.() ?? Math.floor(Date.now() / 1000);

interface Sent {
    readonly result: CallResult;
    readonly errorName?: string;
}

async function send(url: string, init: RequestInit): Promise<Sent> {
    try {
        const res = await deadlineFetch("auth")(url, init);
        let body: unknown;
        try {
            body = await res.json();
        } catch {
            body = undefined;
        }
        return { result: { status: res.status, body } };
    } catch (error) {
        return { result: { thrown: true }, errorName: thrownErrorName(error) };
    }
}

export async function callAuthService(url: string, init: RequestInit): Promise<CallResult> {
    return (await send(url, init)).result;
}

const statusOf = (result: CallResult): { status?: number } =>
    "status" in result ? { status: result.status } : {};

export { resetKeySourceForTests as resetKeySetCacheForTests } from "@/lib/authKeySource";

function tokenKid(token: string): string | undefined {
    const header = token.split(".")[0];
    if (!header || !/^[A-Za-z0-9_-]+$/.test(header)) return undefined;
    try {
        const parsed: unknown = parseStrictJson(
            new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(header, "base64url")),
        );
        const kid = (parsed as { kid?: unknown } | null)?.kid;
        return typeof kid === "string" ? kid : undefined;
    } catch {
        return undefined;
    }
}

type Config = { ok: true; tokenClass: TokenClass } | { ok: false };

function checkConfig(cfg: WireConfig, operation: WireOperation): Config {
    const tokenClass = resolveTokenClass(cfg.tokenClassRaw);
    if (tokenClass === null || (tokenClass === "eddsa" && !cfg.issuer)) {
        logSessionBranch({ operation, branch: "auth_config_invalid" });
        return { ok: false };
    }
    return { ok: true, tokenClass };
}

type Issued =
    | { ok: true; read: AccessTokenOk; ctx: VerifyContext }
    | { ok: false; reason: "refused"; cause: "shape" | "verify" }
    | { ok: false; reason: "unavailable" };

async function readIssuedAccessToken(
    token: string,
    tokenClass: TokenClass,
    cfg: WireConfig,
    operation: WireOperation,
): Promise<Issued> {
    let ctx: VerifyContext = {
        issuer: cfg.issuer ?? "",
        audience: "dev-health-api",
        nowSeconds: nowOf(cfg),
        publishedKeys: [],
        removedKids: [],
    };
    if (tokenClass === "eddsa") {
        const answer = await publishedKeysFor(
            ctx.issuer,
            tokenKid(token),
            () => nowOf(cfg),
            operation,
        );
        if (!answer.ok) {
            return answer.reason === "unavailable"
                ? { ok: false, reason: "unavailable" }
                : { ok: false, reason: "refused", cause: "verify" };
        }
        // The key read can take time: the token is judged at the time it ended.
        ctx = { ...ctx, nowSeconds: nowOf(cfg), publishedKeys: answer.keys };
    }
    const read = readAccessToken(token, tokenClass, ctx);
    if (!read.ok) return { ok: false, reason: "refused", cause: read.reason };
    return { ok: true, read, ctx };
}

const SESSION_REFUSAL_BRANCH = {
    malformed: "session_token_malformed",
    verify: "session_token_unverified",
    sid_mismatch: "session_token_sid_mismatch",
    sub_mismatch: "session_token_sub_mismatch",
    exp_mismatch: "session_token_exp_mismatch",
} as const;

export type AnswerTokens =
    | {
          ok: true;
          accessExp?: number;
          sid?: string;
          sub?: string;
          orgId?: string;
          actor?: string | null;
          session:
              | { kind: "absent" }
              | { kind: "ignored" }
              | { kind: "ok"; token: string; exp: number; sid: string };
      }
    | { ok: false; reason: "refused"; cause: "shape" | "verify" | "session" }
    | { ok: false; reason: "unavailable" };

// The tokens of one auth-service answer, read by the class setting: the access token as before, then
// session_access_token (aud auth-service) against it with the same keys and the same clock. Under
// hs256_compat the field is ignored and counted; under eddsa it is checked, kept apart from the
// access token, and an absent one is accepted and counted. The log lines are closed branches.
export async function readAnswerTokens(
    answer: { readonly accessToken: string; readonly sessionAccessToken?: unknown },
    cfg: WireConfig,
    operation: WireOperation,
): Promise<AnswerTokens> {
    const tokenClass = resolveTokenClass(cfg.tokenClassRaw);
    if (tokenClass === null) return { ok: false, reason: "unavailable" };
    const issued = await readIssuedAccessToken(answer.accessToken, tokenClass, cfg, operation);
    if (!issued.ok) return issued;
    const session: SessionAccessTokenRead = readSessionAccessToken(
        answer.sessionAccessToken,
        issued.read,
        tokenClass,
        issued.ctx,
    );
    if (session.kind === "refused") {
        logSessionBranch({ operation, branch: SESSION_REFUSAL_BRANCH[session.reason] });
        return { ok: false, reason: "refused", cause: "session" };
    }
    if (session.kind === "ignored")
        logSessionBranch({ operation, branch: "session_token_ignored" });
    if (session.kind === "absent" && tokenClass === "eddsa") {
        logSessionBranch({ operation, branch: "session_token_missing" });
    }
    const { read } = issued;
    return {
        ok: true,
        ...(read.exp === undefined ? {} : { accessExp: read.exp }),
        ...(read.sid === undefined ? {} : { sid: read.sid }),
        ...(read.sub === undefined ? {} : { sub: read.sub }),
        ...(read.orgId === undefined ? {} : { orgId: read.orgId }),
        ...(read.actor === undefined ? {} : { actor: read.actor }),
        session,
    };
}

export interface PasswordCredentials {
    readonly email: string;
    readonly password: string;
    readonly org_id?: string;
}

export type PasswordLoginResult =
    | {
          kind: "ok";
          accessToken: string;
          refreshToken: string;
          expiresIn?: number;
          needsOnboarding: boolean;
          user: SessionUser;
          accessExp?: number;
          sid?: string;
          sub?: string;
          sessionAccessToken?: string;
          sessionExp?: number;
          actorSub?: string;
      }
    | { kind: "email_verification_required" }
    | { kind: "account_locked" }
    | { kind: "rate_limited" }
    | { kind: "invalid_credentials" }
    | { kind: "unavailable" };

const refusedLogin = (
    branch: "login_invalid_response" | "token_shape_refused",
): PasswordLoginResult => {
    logSessionBranch({ operation: "login", branch });
    return { kind: "invalid_credentials" };
};

export async function passwordLogin(
    credentials: PasswordCredentials,
    cfg: WireConfig,
): Promise<PasswordLoginResult> {
    const checked = checkConfig(cfg, "login");
    if (!checked.ok) return { kind: "unavailable" };
    const sent = await send(`${cfg.backendUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
            org_id: credentials.org_id,
        }),
    });
    const outcome = classifyLogin(sent.result);
    switch (outcome.kind) {
        case "unavailable":
            logSessionBranch({
                operation: "login",
                branch: "login_unavailable",
                ...statusOf(sent.result),
                ...(sent.errorName === undefined ? {} : { errorName: sent.errorName }),
            });
            return outcome;
        case "invalid_response":
            return refusedLogin("login_invalid_response");
        case "ok": {
            const tokens = await readAnswerTokens(
                {
                    accessToken: outcome.accessToken,
                    sessionAccessToken: outcome.sessionAccessToken,
                },
                cfg,
                "login",
            );
            if (!tokens.ok) {
                if (tokens.reason === "unavailable") return { kind: "unavailable" };
                // A refused session token gives the same answer as any refused sign-in; its
                // branch is in the log.
                if (tokens.cause === "session") return { kind: "invalid_credentials" };
                return refusedLogin(
                    tokens.cause === "shape" ? "token_shape_refused" : "login_invalid_response",
                );
            }
            return {
                kind: "ok",
                accessToken: outcome.accessToken,
                refreshToken: outcome.refreshToken,
                ...(outcome.expiresIn === undefined ? {} : { expiresIn: outcome.expiresIn }),
                needsOnboarding: outcome.needsOnboarding,
                user: outcome.user,
                ...(tokens.accessExp === undefined ? {} : { accessExp: tokens.accessExp }),
                ...(tokens.sid === undefined ? {} : { sid: tokens.sid }),
                ...(tokens.sub === undefined ? {} : { sub: tokens.sub }),
                ...(tokens.session.kind === "ok"
                    ? { sessionAccessToken: tokens.session.token, sessionExp: tokens.session.exp }
                    : {}),
                ...(typeof tokens.actor === "string" ? { actorSub: tokens.actor } : {}),
            };
        }
        default:
            return outcome;
    }
}

export async function revokeSessionAtAuthService(
    tokens: { readonly access: string; readonly refresh: string },
    cfg: WireConfig,
): Promise<LogoutOutcome> {
    const sent = await send(`${cfg.backendUrl}/api/v1/auth/logout`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${tokens.access}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: tokens.refresh }),
    });
    const outcome = classifyLogout(sent.result);
    if (outcome.kind === "failed") {
        logSessionBranch({
            operation: "logout",
            branch: "logout_failed",
            ...statusOf(sent.result),
            ...(sent.errorName === undefined ? {} : { errorName: sent.errorName }),
        });
    }
    return outcome;
}

export type RefreshResult =
    | {
          kind: "rotated";
          accessToken: string;
          refreshToken: string;
          accessExp: number;
          sid?: string;
          user?: SessionUser;
          sessionAccessToken?: string;
          sessionExp?: number;
          actorSub?: string;
      }
    | { kind: "terminal"; reason: "status"; status: number }
    | { kind: "terminal"; reason: "invalid_response" }
    | { kind: "terminal"; reason: "token_refused" }
    | { kind: "transient"; status?: number; errorName?: string; refreshToken?: string };

// The refresh credential is single use: once the answer rotated it, the new one must be stored
// whatever happens to the access token, and a refused access token ends the session.
async function refreshOnce(
    refreshToken: string,
    tokenClass: TokenClass,
    cfg: WireConfig,
): Promise<RefreshResult> {
    const sent = await send(`${cfg.backendUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const outcome = classifyRefresh(sent.result);
    if (outcome.kind === "transient") {
        return {
            kind: "transient",
            ...(outcome.status === undefined ? {} : { status: outcome.status }),
            ...(sent.errorName === undefined ? {} : { errorName: sent.errorName }),
        };
    }
    if (outcome.kind === "terminal") {
        if (outcome.reason === "invalid_response") {
            logSessionBranch({ operation: "refresh", branch: "refresh_invalid_response" });
        }
        return outcome;
    }
    const tokens = await readAnswerTokens(
        { accessToken: outcome.accessToken, sessionAccessToken: outcome.sessionAccessToken },
        cfg,
        "refresh",
    );
    if (!tokens.ok) {
        if (tokens.reason === "unavailable") {
            return { kind: "transient", refreshToken: outcome.refreshToken };
        }
        // A refused session token was logged by its own branch.
        if (tokens.cause !== "session") {
            logSessionBranch({
                operation: "refresh",
                branch:
                    tokens.cause === "shape" ? "token_shape_refused" : "refresh_invalid_response",
            });
        }
        return { kind: "terminal", reason: "token_refused" };
    }
    // Fail closed: a refreshed token whose exp web cannot read (absent, not a positive safe
    // integer) is refused. The body expires_in never sets the lifetime of such a token.
    if (tokens.accessExp === undefined) {
        logSessionBranch({ operation: "refresh", branch: "token_shape_refused" });
        return { kind: "terminal", reason: "token_refused" };
    }
    return {
        kind: "rotated",
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
        accessExp: tokens.accessExp,
        ...(tokens.sid === undefined ? {} : { sid: tokens.sid }),
        ...(outcome.user === undefined ? {} : { user: outcome.user }),
        ...(tokens.session.kind === "ok"
            ? { sessionAccessToken: tokens.session.token, sessionExp: tokens.session.exp }
            : {}),
        ...(typeof tokens.actor === "string" ? { actorSub: tokens.actor } : {}),
    };
}

export async function refreshSession(
    refreshToken: string,
    cfg: WireConfig,
): Promise<RefreshResult> {
    // Our own setting never ends a session: the credential is untouched and the refresh is retried.
    const checked = checkConfig(cfg, "refresh");
    if (!checked.ok) return { kind: "transient" };
    return singleFlightRefresh(refreshToken, () =>
        refreshOnce(refreshToken, checked.tokenClass, cfg),
    );
}

// The wire settings of this process: the class setting, the pinned issuer and the backend URL.
export function wireConfigFromEnv(): WireConfig {
    const env = getServerEnv();
    return {
        tokenClassRaw: env.AUTH_ACCESS_TOKEN_CLASS,
        issuer: env.AUTH_ACCESS_TOKEN_ISSUER,
        backendUrl: getBackendUrl(),
    };
}

// Whether the class setting can be used at all: an unknown value, or eddsa without an issuer, is a
// configuration fault (counted as auth_config_invalid under the operation); the caller refuses.
export function wireConfigUsable(cfg: WireConfig, operation: WireOperation): boolean {
    return checkConfig(cfg, operation).ok;
}

export type ExchangeRead =
    | { kind: "legacy" }
    | { kind: "refused" }
    | { kind: "unavailable" }
    | {
          kind: "read";
          accessExp?: number;
          sid?: string;
          actor?: string | null;
          session: Extract<AnswerTokens, { ok: true }>["session"];
      };

// The answer of switch-org, change-password or the social exchange. Under hs256_compat nothing is
// read (the answer is used as before; a present service token is ignored and counted). Under eddsa
// it is read like a login answer. A wrong class setting, a refused answer and an unreadable key set
// are different faults; the caller refuses all three the same way.
export async function readExchangeAnswer(
    answer: { readonly accessToken: string; readonly sessionAccessToken?: unknown },
    cfg: WireConfig,
    operation: "switch_org" | "change_password" | "social_login",
): Promise<ExchangeRead> {
    const checked = checkConfig(cfg, operation);
    if (!checked.ok) return { kind: "refused" };
    if (checked.tokenClass === "hs256_compat") {
        if (answer.sessionAccessToken !== undefined) {
            logSessionBranch({ operation, branch: "session_token_ignored" });
        }
        return { kind: "legacy" };
    }
    const tokens = await readAnswerTokens(answer, cfg, operation);
    if (!tokens.ok) return { kind: tokens.reason === "unavailable" ? "unavailable" : "refused" };
    return {
        kind: "read",
        ...(tokens.accessExp === undefined ? {} : { accessExp: tokens.accessExp }),
        ...(tokens.sid === undefined ? {} : { sid: tokens.sid }),
        ...(tokens.actor === undefined ? {} : { actor: tokens.actor }),
        session: tokens.session,
    };
}
