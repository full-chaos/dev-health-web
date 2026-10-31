import "server-only";
import { createHash } from "node:crypto";

// Outcome table for the auth-service compat calls (login, refresh, logout) and the refresh
// single-flight (CHAOS-10876, A2: not wired). The compat wire answers go-api's shape and names no
// reason code in the body, so the decision rests on the HTTP status. Pure: no I/O, no logging.

export type CallResult = { status: number; body: unknown } | { thrown: true };

export interface SessionUser {
    id: string;
    email?: string;
    orgId?: string;
    role?: string;
    isSuperuser: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined =>
    typeof v === "string" && v !== "" ? v : undefined;

function readUser(v: unknown): SessionUser | undefined {
    if (!isObject(v)) return undefined;
    const id = text(v.id);
    if (id === undefined) return undefined;
    const email = text(v.email);
    const orgId = text(v.org_id);
    const role = text(v.role);
    return {
        id,
        ...(email === undefined ? {} : { email }),
        ...(orgId === undefined ? {} : { orgId }),
        ...(role === undefined ? {} : { role }),
        isSuperuser: v.is_superuser === true,
    };
}

function readExpiresIn(v: unknown): { expiresIn?: number } {
    return typeof v === "number" && Number.isInteger(v) && v > 0 ? { expiresIn: v } : {};
}

// Transient: the authority could not answer now, a later try may work. Every other non-2xx status
// is a request or credential the authority will not accept; a retry cannot help.
const isTransientStatus = (status: number): boolean =>
    status === 408 || status === 425 || status === 429 || status >= 500;

export type LoginOutcome =
    | {
          kind: "ok";
          accessToken: string;
          refreshToken: string;
          expiresIn?: number;
          needsOnboarding: boolean;
          sessionAccessToken: unknown;
          user: SessionUser;
      }
    | { kind: "email_verification_required" }
    | { kind: "account_locked" }
    | { kind: "rate_limited" }
    | { kind: "invalid_credentials" }
    | { kind: "unavailable" }
    | { kind: "invalid_response" };

export function classifyLogin(result: CallResult): LoginOutcome {
    if ("thrown" in result) return { kind: "unavailable" };
    const { status, body } = result;
    if (status === 429) {
        const detail = isObject(body) && isObject(body.detail) ? body.detail : undefined;
        return typeof detail?.retry_after_seconds === "number"
            ? { kind: "account_locked" }
            : { kind: "rate_limited" };
    }
    if (isTransientStatus(status)) return { kind: "unavailable" };
    if (status < 200 || status >= 300) return { kind: "invalid_credentials" };
    if (isObject(body) && body.status === "email_verification_required") {
        return { kind: "email_verification_required" };
    }
    if (!isObject(body)) return { kind: "invalid_response" };
    const accessToken = text(body.access_token);
    const refreshToken = text(body.refresh_token);
    const user = readUser(body.user);
    if (accessToken === undefined || refreshToken === undefined || user === undefined) {
        return { kind: "invalid_response" };
    }
    return {
        kind: "ok",
        accessToken,
        refreshToken,
        ...readExpiresIn(body.expires_in),
        needsOnboarding: body.needs_onboarding === true,
        sessionAccessToken: body.session_access_token,
        user,
    };
}

export type RefreshOutcome =
    | {
          kind: "rotated";
          accessToken: string;
          refreshToken: string;
          expiresIn?: number;
          sessionAccessToken: unknown;
          user?: SessionUser;
      }
    | { kind: "terminal"; reason: "status"; status: number }
    | { kind: "terminal"; reason: "invalid_response" }
    | { kind: "transient"; status?: number };

export function classifyRefresh(result: CallResult): RefreshOutcome {
    if ("thrown" in result) return { kind: "transient" };
    const { status, body } = result;
    if (isTransientStatus(status)) return { kind: "transient", status };
    if (status < 200 || status >= 300) return { kind: "terminal", reason: "status", status };
    // The refresh credential is single use: an answer without a new one leaves only a spent one,
    // and reusing it ends the session family. So an answer without both tokens is terminal.
    const accessToken = isObject(body) ? text(body.access_token) : undefined;
    const refreshToken = isObject(body) ? text(body.refresh_token) : undefined;
    if (!isObject(body) || accessToken === undefined || refreshToken === undefined) {
        return { kind: "terminal", reason: "invalid_response" };
    }
    const user = readUser(body.user);
    return {
        kind: "rotated",
        accessToken,
        refreshToken,
        ...readExpiresIn(body.expires_in),
        sessionAccessToken: body.session_access_token,
        ...(user === undefined ? {} : { user }),
    };
}

export type LogoutOutcome = { kind: "revoked" } | { kind: "failed" };

// The compat logout answers 200 whether or not the credential named a live session, so a 200 says
// only that the call went through. Any other answer, or none, is a failure.
export function classifyLogout(result: CallResult): LogoutOutcome {
    return "status" in result && result.status === 200 ? { kind: "revoked" } : { kind: "failed" };
}

const flights = new Map<string, Promise<unknown>>();

const flightKey = (refreshToken: string): string =>
    createHash("sha256").update(refreshToken).digest("hex");

// One backend call per refresh credential per process: parallel callers share it. The registry is
// keyed by a hash and holds nothing else; the backend's refresh grace covers other processes.
export function singleFlightRefresh<T>(refreshToken: string, call: () => Promise<T>): Promise<T> {
    const key = flightKey(refreshToken);
    const running = flights.get(key);
    if (running !== undefined) return running as Promise<T>;
    const flight = (async () => call())().finally(() => {
        flights.delete(key);
    });
    flights.set(key, flight);
    return flight;
}

export function inFlightRefreshKeys(): string[] {
    return [...flights.keys()];
}

// The Bearer for the auth-service routes that refuse aud dev-health-api: the session access token
// when the session holds one, else the access token. The session token is stored only under
// class eddsa, so under hs256_compat this is the access token.
export function serviceBearer(tokens: {
    access_token?: unknown;
    session_access_token?: unknown;
}): string | undefined {
    return text(tokens.session_access_token) ?? text(tokens.access_token);
}
