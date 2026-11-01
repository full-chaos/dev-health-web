import "server-only";
import { parseStrictJson } from "@/lib/auth/accesstoken/strictjson";
import type { VerifyContext } from "@/lib/auth/accesstoken/verify";
import { publishedKeysFor } from "@/lib/authKeySource";
import { readAccessToken, resolveTokenClass, type TokenClass } from "@/lib/authServiceClient";
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
import { deadlineFetch } from "@/lib/serverDeadline";

// The credentials login and the logout, spoken to auth-service on the go-api compat wire
// (CHAOS-10876). Outcomes are the closed tables of authServiceOutcome; this module adds the call,
// the access-token class rules and the key set. A log line holds an operation, a branch, a status
// and an error name, never a token, an address or a password.

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

function checkConfig(cfg: WireConfig, operation: "login" | "refresh"): Config {
    const tokenClass = resolveTokenClass(cfg.tokenClassRaw);
    if (tokenClass === null || (tokenClass === "eddsa" && !cfg.issuer)) {
        logSessionBranch({ operation, branch: "auth_config_invalid" });
        return { ok: false };
    }
    return { ok: true, tokenClass };
}

type Issued =
    | { ok: true; exp?: number; sid?: string; sub?: string }
    | { ok: false; reason: "refused"; cause: "shape" | "verify" }
    | { ok: false; reason: "unavailable" };

async function readIssuedAccessToken(
    token: string,
    tokenClass: TokenClass,
    cfg: WireConfig,
    operation: "login" | "refresh",
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
    return {
        ok: true,
        ...(read.exp === undefined ? {} : { exp: read.exp }),
        ...(read.sid === undefined ? {} : { sid: read.sid }),
        ...(read.sub === undefined ? {} : { sub: read.sub }),
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
            const issued = await readIssuedAccessToken(
                outcome.accessToken,
                checked.tokenClass,
                cfg,
                "login",
            );
            if (!issued.ok) {
                if (issued.reason === "unavailable") return { kind: "unavailable" };
                return refusedLogin(
                    issued.cause === "shape" ? "token_shape_refused" : "login_invalid_response",
                );
            }
            return {
                kind: "ok",
                accessToken: outcome.accessToken,
                refreshToken: outcome.refreshToken,
                ...(outcome.expiresIn === undefined ? {} : { expiresIn: outcome.expiresIn }),
                needsOnboarding: outcome.needsOnboarding,
                user: outcome.user,
                ...(issued.exp === undefined ? {} : { accessExp: issued.exp }),
                ...(issued.sid === undefined ? {} : { sid: issued.sid }),
                ...(issued.sub === undefined ? {} : { sub: issued.sub }),
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
          accessExp?: number;
          sid?: string;
          expiresIn?: number;
          user?: SessionUser;
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
    const issued = await readIssuedAccessToken(outcome.accessToken, tokenClass, cfg, "refresh");
    if (!issued.ok) {
        if (issued.reason === "unavailable") {
            return { kind: "transient", refreshToken: outcome.refreshToken };
        }
        logSessionBranch({
            operation: "refresh",
            branch: issued.cause === "shape" ? "token_shape_refused" : "refresh_invalid_response",
        });
        return { kind: "terminal", reason: "token_refused" };
    }
    return {
        kind: "rotated",
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
        ...(issued.exp === undefined ? {} : { accessExp: issued.exp }),
        ...(issued.sid === undefined ? {} : { sid: issued.sid }),
        ...(outcome.expiresIn === undefined ? {} : { expiresIn: outcome.expiresIn }),
        ...(outcome.user === undefined ? {} : { user: outcome.user }),
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
