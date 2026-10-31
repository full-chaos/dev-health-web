import "server-only";
import { loadKeySet } from "@/lib/auth/accesstoken/keyset";
import type { Jwk, VerifyContext } from "@/lib/auth/accesstoken/verify";
import { readAccessToken, resolveTokenClass, type TokenClass } from "@/lib/authServiceClient";
import {
    classifyLogin,
    classifyLogout,
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
    /** AUTH_TOKEN_ISSUER; needed under class eddsa. */
    readonly issuer: string | undefined;
    readonly backendUrl: string;
    readonly nowSeconds?: () => number;
}

const KEY_SET_TTL_SECONDS = 300;
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

let keySet: { keys: Jwk[]; at: number } | null = null;

export function resetKeySetCacheForTests(): void {
    keySet = null;
}

type KeysResult = { ok: true; keys: Jwk[] } | { ok: false };

async function loadKeys(cfg: WireConfig): Promise<KeysResult> {
    const now = nowOf(cfg);
    if (keySet !== null && now - keySet.at <= KEY_SET_TTL_SECONDS) {
        return { ok: true, keys: keySet.keys };
    }
    const url = `${cfg.backendUrl}/.well-known/jwks.json`;
    let status: number | undefined;
    let errorName: string | undefined;
    try {
        const res = await deadlineFetch("auth")(url, { method: "GET" });
        status = res.status;
        if (res.status === 200) {
            const loaded = loadKeySet(await res.text());
            if (loaded.ok) {
                keySet = { keys: loaded.keys, at: now };
                return { ok: true, keys: loaded.keys };
            }
        }
    } catch (error) {
        errorName = thrownErrorName(error);
    }
    logSessionBranch({
        operation: "login",
        branch: "key_set_unusable",
        ...(status !== undefined && status !== 200 ? { status } : {}),
        ...(errorName === undefined ? {} : { errorName }),
    });
    return { ok: false };
}

type Config = { ok: true; tokenClass: TokenClass } | { ok: false };

function checkConfig(cfg: WireConfig): Config {
    const tokenClass = resolveTokenClass(cfg.tokenClassRaw);
    if (tokenClass === null || (tokenClass === "eddsa" && !cfg.issuer)) {
        logSessionBranch({ operation: "login", branch: "auth_config_invalid" });
        return { ok: false };
    }
    return { ok: true, tokenClass };
}

type Issued =
    | { ok: true; exp?: number; sid?: string; sub?: string }
    | { ok: false; reason: "refused" | "unavailable" };

async function readIssuedAccessToken(
    token: string,
    tokenClass: TokenClass,
    cfg: WireConfig,
): Promise<Issued> {
    let ctx: VerifyContext = {
        issuer: cfg.issuer ?? "",
        audience: "dev-health-api",
        nowSeconds: nowOf(cfg),
        publishedKeys: [],
        removedKids: [],
    };
    if (tokenClass === "eddsa") {
        const keys = await loadKeys(cfg);
        if (!keys.ok) return { ok: false, reason: "unavailable" };
        ctx = { ...ctx, publishedKeys: keys.keys };
    }
    const read = readAccessToken(token, tokenClass, ctx);
    if (!read.ok) return { ok: false, reason: "refused" };
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

const invalidResponse = (): PasswordLoginResult => {
    logSessionBranch({ operation: "login", branch: "login_invalid_response" });
    return { kind: "invalid_credentials" };
};

export async function passwordLogin(
    credentials: PasswordCredentials,
    cfg: WireConfig,
): Promise<PasswordLoginResult> {
    const checked = checkConfig(cfg);
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
            return invalidResponse();
        case "ok": {
            const issued = await readIssuedAccessToken(
                outcome.accessToken,
                checked.tokenClass,
                cfg,
            );
            if (!issued.ok) {
                return issued.reason === "unavailable"
                    ? { kind: "unavailable" }
                    : invalidResponse();
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
