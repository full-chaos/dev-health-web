/**
 * The browser's ACR OAuth flow and token store (CHAOS-12303, c2 of the T13 split; Ask Dev direct
 * browser design §2.1, §2.2, §7). Web is a first-party public client of acr-api: authorization code
 * with PKCE S256. The client, issuer and redirect come from `acr-browser-config.ts` (c1).
 *
 * Storage rules (design §2.2, §7):
 * - The access token (`fcacr_`) is held in this module's memory only.
 * - The refresh token (`acrrt_`), the client id and the revocation endpoint are in
 *   `sessionStorage`, under `ask-dev:acr-family`.
 * - None of them goes to React state, a URL, `localStorage`, a log, telemetry or Sentry.
 *
 * The flow:
 * 1. `beginAcrAuthorization` writes this tab's pending authorization (state, PKCE verifier,
 *    expiry) to `sessionStorage` and sends the tab to ACR's `/authorize`.
 * 2. ACR's consent handle goes to web's consent page. For this client, T4c approves it with no
 *    click.
 * 3. ACR redirects to `/ask-dev/oauth/callback?code&state&iss`. The callback page scrubs its URL
 *    first, then calls `completeAcrAuthorization`. That takes the pending entry (single use),
 *    checks `state`, the tab, the expiry and `iss`, and exchanges the code at `/token` with a form
 *    POST, which is not preflighted.
 *
 * Refresh, Web Locks, clone detection and sign-out are c4 (CHAOS-12305). Until c4, an expired
 * access token means "authorization required".
 */
import { safeReturnTo } from "@/lib/onboarding/returnTo";

import { type AcrBrowserClientConfig, browserAcrClientConfig } from "./acr-browser-config";

/** This tab's pending authorization: written by begin, taken (removed) by complete. */
export const ACR_PENDING_AUTHORIZATION_KEY = "ask-dev:acr-authorization";
/** The token family this tab holds: the refresh token and where it is used. */
export const ACR_TOKEN_FAMILY_KEY = "ask-dev:acr-family";
/** This tab's id. c4 replaces it when it finds a cloned tab. */
export const ACR_TAB_KEY = "ask-dev:acr-tab";
/**
 * In `localStorage`, shared by every tab of the origin: the SHA-256 of each state whose code was
 * sent, until its authorization would have expired. A duplicated tab gets a copy of this tab's
 * `sessionStorage`, pending entry included, so the tab id cannot tell it from the original while
 * the original is on ACR's pages. This marker makes one start give at most one code exchange,
 * whichever tab gets there first (r1 on web #1663). It holds no state and no token.
 */
export const ACR_SPENT_KEY = "ask-dev:acr-spent";
const ACR_LOCK = "ask-dev:acr-authorization";

/** The scopes the Ask Dev routes need: context:read; evidence:read for evidence. Never data:read. */
export const ACR_BROWSER_SCOPE = "context:read evidence:read";

/** How long a started authorization may take to come back. */
export const ACR_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;
/** An access token this close to its expiry counts as expired. */
export const ACR_ACCESS_TOKEN_SKEW_MS = 30 * 1000;

const ACCESS_TOKEN = /^fcacr_[A-Za-z0-9_-]{43}$/u;
const REFRESH_TOKEN = /^acrrt_[A-Za-z0-9_-]{43}$/u;
/** A PKCE verifier or state: 32 random bytes, base64url, no padding. */
const RANDOM_43 = /^[A-Za-z0-9_-]{43}$/u;
const TAB_ID = /^[A-Za-z0-9_-]{22}$/u;

/** The OAuth error codes a callback may carry (RFC 6749 §4.1.2.1); anything else is "other". */
const CALLBACK_ERRORS = new Set([
    "access_denied",
    "invalid_request",
    "unauthorized_client",
    "unsupported_response_type",
    "invalid_scope",
    "server_error",
    "temporarily_unavailable",
]);

export type AcrAuthorizationServer = {
    readonly issuer: string;
    readonly authorizationEndpoint: string;
    readonly tokenEndpoint: string;
    /** Advertised only when ACR serves the browser refresh grant. */
    readonly revocationEndpoint: string | null;
};

type PendingAuthorization = {
    readonly v: 1;
    readonly state: string;
    readonly verifier: string;
    readonly tabId: string;
    readonly issuer: string;
    readonly clientId: string;
    readonly redirectUri: string;
    readonly tokenEndpoint: string;
    readonly revocationEndpoint: string | null;
    readonly returnTo: string;
    readonly expiresAt: number;
};

/** What the family entry in `sessionStorage` holds. c4's sign-out hook reads it. */
export type AcrHeldFamily = {
    readonly v: 1;
    readonly issuer: string;
    readonly clientId: string;
    readonly refreshToken: string;
    readonly tokenEndpoint: string;
    readonly revocationEndpoint: string | null;
};

export type AcrAccessToken =
    | { readonly kind: "token"; readonly token: string; readonly issuer: string }
    | { readonly kind: "authorization_required" }
    | { readonly kind: "off" };

/** Why a callback did not end in a token. Content-free: safe to log and to show. */
export type AcrCallbackFailure =
    | "off"
    | "no_pending"
    | "expired"
    | "state_mismatch"
    | "wrong_tab"
    | "iss_mismatch"
    | "missing_code"
    | "token_refused"
    | "token_unavailable"
    | "invalid_token_response"
    | "already_used"
    | "claim_unavailable";

export type AcrCallbackOutcome =
    | { readonly kind: "authorized"; readonly returnTo: string }
    | { readonly kind: "denied"; readonly error: string; readonly returnTo: string }
    | { readonly kind: "failed"; readonly reason: AcrCallbackFailure; readonly returnTo: string };

export type AcrBeginOutcome =
    { readonly kind: "redirected" } | { readonly kind: "off" } | { readonly kind: "unavailable" };

type Held = {
    readonly token: string;
    readonly issuer: string;
    readonly clientId: string;
    readonly expiresAt: number;
};

/** The access token: this module's memory only. */
let held: Held | null = null;

type Dependencies = {
    readonly fetch: typeof fetch;
    readonly now: () => number;
    readonly storage: () => Storage | null;
    /** The origin's `localStorage`, for the spent marker only. */
    readonly shared: () => Storage | null;
    /** Runs `task` while no other tab of the origin holds the same lock. */
    readonly lock: <T>(name: string, task: () => Promise<T>) => Promise<T>;
    readonly navigate: (url: string) => void;
    readonly config: () => AcrBrowserClientConfig | undefined;
};

const browserDependencies: Dependencies = {
    fetch: (input, init) => globalThis.fetch(input, init),
    now: () => Date.now(),
    storage: () => {
        try {
            return typeof window === "undefined" ? null : window.sessionStorage;
        } catch {
            return null;
        }
    },
    shared: () => {
        try {
            return typeof window === "undefined" ? null : window.localStorage;
        } catch {
            return null;
        }
    },
    lock: (name, task) =>
        typeof navigator !== "undefined" && navigator.locks !== undefined
            ? navigator.locks.request(name, task)
            : task(),
    // Replace, not assign: Back from where the flow returns must not start it again.
    navigate: (url) => window.location.replace(url),
    config: browserAcrClientConfig,
};

let dependencies: Dependencies = browserDependencies;

/** Tests only: replace the browser seams. With no argument, restore them and drop the token. */
export function setAcrAuthDependenciesForTest(next?: Partial<Dependencies>): void {
    dependencies = next === undefined ? browserDependencies : { ...browserDependencies, ...next };
    if (next === undefined) held = null;
}

function base64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function randomBase64Url(length: number): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
}

/** RFC 7636 S256: BASE64URL(SHA-256(ASCII(verifier))), 43 characters. */
export async function pkceChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return base64Url(new Uint8Array(digest));
}

function readJson(storage: Storage, key: string): unknown {
    try {
        const raw = storage.getItem(key);
        return raw === null ? null : (JSON.parse(raw) as unknown);
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This tab's id, made on first use. */
function tabId(storage: Storage): string {
    const existing = storage.getItem(ACR_TAB_KEY);
    if (existing !== null && TAB_ID.test(existing)) return existing;
    const created = randomBase64Url(16);
    storage.setItem(ACR_TAB_KEY, created);
    return created;
}

/** An endpoint ACR advertises: an absolute URL on the issuer's own origin, no user info. */
function endpointOn(issuer: string, raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    try {
        const url = new URL(raw);
        if (
            url.origin !== issuer ||
            url.username !== "" ||
            url.password !== "" ||
            url.hash !== ""
        ) {
            return null;
        }
        return url.href;
    } catch {
        return null;
    }
}

/**
 * ACR's authorization server metadata (RFC 8414), read live each time an authorization starts.
 * The document must name this issuer, S256 and the `iss` response parameter, and its endpoints
 * must be on the issuer's origin.
 */
export async function discoverAcrAuthorizationServer(
    issuer: string,
    signal?: AbortSignal,
): Promise<AcrAuthorizationServer | null> {
    let body: unknown;
    try {
        const response = await dependencies.fetch(
            `${issuer}/.well-known/oauth-authorization-server`,
            {
                method: "GET",
                headers: { Accept: "application/json" },
                credentials: "omit",
                cache: "no-store",
                redirect: "error",
                signal,
            },
        );
        if (!response.ok) return null;
        body = await response.json();
    } catch {
        return null;
    }
    if (!isRecord(body) || body.issuer !== issuer) return null;
    const methods = body.code_challenge_methods_supported;
    if (!Array.isArray(methods) || !methods.includes("S256")) return null;
    if (body.authorization_response_iss_parameter_supported !== true) return null;
    const authorizationEndpoint = endpointOn(issuer, body.authorization_endpoint);
    const tokenEndpoint = endpointOn(issuer, body.token_endpoint);
    if (authorizationEndpoint === null || tokenEndpoint === null) return null;
    const revocationEndpoint =
        body.revocation_endpoint === undefined
            ? null
            : endpointOn(issuer, body.revocation_endpoint);
    if (body.revocation_endpoint !== undefined && revocationEndpoint === null) return null;
    return { issuer, authorizationEndpoint, tokenEndpoint, revocationEndpoint };
}

/**
 * Starts an authorization in this tab and sends the tab to ACR. `returnTo` is the same-origin path
 * the callback returns to; anything else returns to `/dev`.
 */
export async function beginAcrAuthorization(returnTo: string): Promise<AcrBeginOutcome> {
    const config = dependencies.config();
    const storage = dependencies.storage();
    if (config === undefined || storage === null) return { kind: "off" };
    const server = await discoverAcrAuthorizationServer(config.issuer);
    if (server === null) return { kind: "unavailable" };
    const verifier = randomBase64Url(32);
    const state = randomBase64Url(32);
    const pending: PendingAuthorization = {
        v: 1,
        state,
        verifier,
        tabId: tabId(storage),
        issuer: config.issuer,
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        tokenEndpoint: server.tokenEndpoint,
        revocationEndpoint: server.revocationEndpoint,
        returnTo: safeReturnTo(returnTo) ?? "/dev",
        expiresAt: dependencies.now() + ACR_AUTHORIZATION_TTL_MS,
    };
    // One pending authorization per tab: a new start replaces an older one.
    storage.setItem(ACR_PENDING_AUTHORIZATION_KEY, JSON.stringify(pending));
    const url = new URL(server.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("code_challenge", await pkceChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("resource", config.issuer);
    url.searchParams.set("scope", ACR_BROWSER_SCOPE);
    dependencies.navigate(url.href);
    return { kind: "redirected" };
}

function pendingFrom(value: unknown): PendingAuthorization | null {
    if (!isRecord(value) || value.v !== 1) return null;
    const strings = [
        "state",
        "verifier",
        "tabId",
        "issuer",
        "clientId",
        "redirectUri",
        "tokenEndpoint",
        "returnTo",
    ];
    if (strings.some((key) => typeof value[key] !== "string")) return null;
    if (typeof value.expiresAt !== "number") return null;
    if (value.revocationEndpoint !== null && typeof value.revocationEndpoint !== "string")
        return null;
    return value as unknown as PendingAuthorization;
}

/**
 * Claims the right to send this start's code, once across all tabs. `spent` when a tab already
 * sent it. `unavailable` when the marker cannot be written and read back (no `localStorage`, a
 * refused or dropped write): then no code is sent, because the one-exchange rule cannot hold
 * (fails closed, r2 on web #1663).
 */
async function claimOnce(
    pending: PendingAuthorization,
): Promise<"claimed" | "spent" | "unavailable"> {
    const shared = dependencies.shared();
    if (shared === null) return "unavailable";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pending.state));
    const key = base64Url(new Uint8Array(digest));
    return dependencies.lock(ACR_LOCK, async () => {
        const now = dependencies.now();
        const spent: Record<string, number> = {};
        const stored = readJson(shared, ACR_SPENT_KEY);
        if (isRecord(stored)) {
            for (const [hash, expiresAt] of Object.entries(stored)) {
                if (typeof expiresAt === "number" && expiresAt > now) spent[hash] = expiresAt;
            }
        }
        if (key in spent) return "spent";
        spent[key] = pending.expiresAt;
        try {
            shared.setItem(ACR_SPENT_KEY, JSON.stringify(spent));
        } catch {
            return "unavailable";
        }
        const written = readJson(shared, ACR_SPENT_KEY);
        return isRecord(written) && written[key] === pending.expiresAt ? "claimed" : "unavailable";
    });
}

/** Takes (reads and removes) this tab's pending authorization: one callback per start. */
function takePending(storage: Storage): PendingAuthorization | null {
    const pending = pendingFrom(readJson(storage, ACR_PENDING_AUTHORIZATION_KEY));
    storage.removeItem(ACR_PENDING_AUTHORIZATION_KEY);
    return pending;
}

type TokenAnswer =
    | {
          readonly kind: "ok";
          readonly access: string;
          readonly expiresIn: number;
          readonly refresh: string | null;
      }
    | { readonly kind: "refused" }
    | { readonly kind: "unavailable" }
    | { readonly kind: "invalid" };

async function exchangeCode(pending: PendingAuthorization, code: string): Promise<TokenAnswer> {
    const form = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
        code_verifier: pending.verifier,
        resource: pending.issuer,
    });
    let response: Response;
    try {
        // A form POST with only safelisted headers: no CORS preflight (design §7).
        response = await dependencies.fetch(pending.tokenEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form,
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
        });
    } catch {
        return { kind: "unavailable" };
    }
    if (response.status === 400 || response.status === 401) return { kind: "refused" };
    if (!response.ok) return { kind: "unavailable" };
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return { kind: "invalid" };
    }
    if (!isRecord(body)) return { kind: "invalid" };
    const {
        access_token: access,
        token_type: type,
        expires_in: expiresIn,
        refresh_token: refresh,
    } = body;
    if (typeof access !== "string" || !ACCESS_TOKEN.test(access)) return { kind: "invalid" };
    if (typeof type !== "string" || type.toLowerCase() !== "bearer") return { kind: "invalid" };
    if (typeof expiresIn !== "number" || !Number.isInteger(expiresIn) || expiresIn <= 0) {
        return { kind: "invalid" };
    }
    if (refresh !== undefined && (typeof refresh !== "string" || !REFRESH_TOKEN.test(refresh))) {
        return { kind: "invalid" };
    }
    return { kind: "ok", access, expiresIn, refresh: refresh ?? null };
}

/**
 * Completes the authorization this tab started, from the callback URL. The caller has already
 * scrubbed the URL from the address bar and history. Every failure is content-free.
 */
export async function completeAcrAuthorization(callbackUrl: string): Promise<AcrCallbackOutcome> {
    const config = dependencies.config();
    const storage = dependencies.storage();
    if (config === undefined || storage === null) {
        return { kind: "failed", reason: "off", returnTo: "/dev" };
    }
    const pending = takePending(storage);
    if (pending === null) return { kind: "failed", reason: "no_pending", returnTo: "/dev" };
    const fail = (reason: AcrCallbackFailure): AcrCallbackOutcome => ({
        kind: "failed",
        reason,
        returnTo: pending.returnTo,
    });
    const params = new URL(callbackUrl).searchParams;
    if (dependencies.now() >= pending.expiresAt) return fail("expired");
    if (!RANDOM_43.test(pending.state) || params.get("state") !== pending.state) {
        return fail("state_mismatch");
    }
    if (pending.tabId !== storage.getItem(ACR_TAB_KEY)) return fail("wrong_tab");
    // The issuer this tab started with is the one configured now and the one that answered.
    if (pending.issuer !== config.issuer || params.get("iss") !== pending.issuer) {
        return fail("iss_mismatch");
    }
    if (pending.clientId !== config.clientId || pending.redirectUri !== config.redirectUri) {
        return fail("iss_mismatch");
    }
    const error = params.get("error");
    if (error !== null) {
        return {
            kind: "denied",
            error: CALLBACK_ERRORS.has(error) ? error : "other",
            returnTo: pending.returnTo,
        };
    }
    const code = params.get("code");
    if (code === null || code === "") return fail("missing_code");
    const claim = await claimOnce(pending);
    if (claim === "spent") return fail("already_used");
    if (claim === "unavailable") return fail("claim_unavailable");
    const answer = await exchangeCode(pending, code);
    if (answer.kind === "refused") return fail("token_refused");
    if (answer.kind === "unavailable") return fail("token_unavailable");
    if (answer.kind === "invalid") return fail("invalid_token_response");
    held = {
        token: answer.access,
        issuer: pending.issuer,
        clientId: pending.clientId,
        expiresAt: dependencies.now() + answer.expiresIn * 1000,
    };
    if (answer.refresh === null) {
        storage.removeItem(ACR_TOKEN_FAMILY_KEY);
    } else {
        const family: AcrHeldFamily = {
            v: 1,
            issuer: pending.issuer,
            clientId: pending.clientId,
            refreshToken: answer.refresh,
            tokenEndpoint: pending.tokenEndpoint,
            revocationEndpoint: pending.revocationEndpoint,
        };
        storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify(family));
    }
    return { kind: "authorized", returnTo: pending.returnTo };
}

/**
 * The access token for one ACR call (T14). A token the configured client holds that is not about
 * to expire, or "authorization required". Never a token for another issuer or client.
 */
export function getAcrAccessToken(): AcrAccessToken {
    const config = dependencies.config();
    if (config === undefined) return { kind: "off" };
    if (
        held === null ||
        held.issuer !== config.issuer ||
        held.clientId !== config.clientId ||
        dependencies.now() >= held.expiresAt - ACR_ACCESS_TOKEN_SKEW_MS
    ) {
        return { kind: "authorization_required" };
    }
    return { kind: "token", token: held.token, issuer: held.issuer };
}

/** The family this tab holds, for c4's refresh and sign-out. `null` when none. */
export function readAcrHeldFamily(): AcrHeldFamily | null {
    const storage = dependencies.storage();
    if (storage === null) return null;
    const value = readJson(storage, ACR_TOKEN_FAMILY_KEY);
    if (!isRecord(value) || value.v !== 1) return null;
    if (typeof value.refreshToken !== "string" || !REFRESH_TOKEN.test(value.refreshToken))
        return null;
    const strings = ["issuer", "clientId", "tokenEndpoint"];
    if (strings.some((key) => typeof value[key] !== "string")) return null;
    if (value.revocationEndpoint !== null && typeof value.revocationEndpoint !== "string")
        return null;
    return value as unknown as AcrHeldFamily;
}
