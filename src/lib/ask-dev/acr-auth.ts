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
 * Refresh across tabs, the principal binding, clone detection and the sign-out hook are c4
 * (CHAOS-12305):
 * - The family and the access token are bound to the web principal (user id and org id) at the
 *   exchange. Every reader drops both when the principal changes or there is no session.
 * - `getAcrAccessToken()` serves the held token until 80 % of its life, then refreshes it with the
 *   family, serialized per family across the origin's tabs by a Web Lock.
 * - ACR rotates the refresh token. A lost refresh response is retried once, with the same token,
 *   only inside ACR's 30 s grace; anything else that fails clears the family (fails closed).
 * - A duplicated tab gets a copy of this tab's `sessionStorage`. On its first use of the store, a
 *   tab asks the origin's tabs (BroadcastChannel `ask-dev:acr-tabs`) whether another tab holds
 *   its tab id. If one does, this tab is the copy: it takes a new tab id and drops the copied
 *   family. Known limit: when the original tab is on a page without this module, nobody answers;
 *   both tabs then share the family, ACR's reuse rule revokes it, and both re-authorize. That
 *   fails closed (T16's live proof).
 * - Nothing here sends a request at module load. A request happens only inside
 *   `getAcrAccessToken()` and the authorization flow.
 *
 * Impersonation (CHAOS-12306, c5): while an admin impersonates, `user.id` stays the admin's and
 * `org_id` is the target's org, so the binding above does not change when the target is in the
 * same org. The principal read therefore says "impersonating", and no token is held, served or
 * started for that session. The conversation context also clears every tab's tokens when the
 * impersonation starts or ends; this module's check is the defence in depth (the OAuth pages
 * reached by URL, other tabs).
 */
import { getSession } from "next-auth/react";

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
/**
 * How long one ACR request may take, its body included (r3 on web #1663). Design §5's status reads
 * are bounded at 15 s too. A request that hits it counts as "ACR unavailable". Not named
 * `ACR_REQUEST_TIMEOUT_MS`: that is a server environment variable, and the secret boundary spec
 * fails a client chunk that holds its name (CHAOS-12104, where this module joined every page).
 */
export const ACR_OAUTH_REQUEST_TIMEOUT_MS = 15_000;
/** An access token this close to its expiry counts as expired. */
export const ACR_ACCESS_TOKEN_SKEW_MS = 30 * 1000;
/** The held access token is refreshed once this share of its life is gone (CHAOS-12305). */
export const ACR_ACCESS_TOKEN_REFRESH_AT = 0.8;
/**
 * A lost refresh response is retried once, with the same refresh token, only while the first
 * attempt started less than this long ago. ACR gives the same successor to the same consumed
 * token for 30 s (while the successor is unused); any later reuse revokes the family
 * (CHAOS-12305).
 */
export const ACR_REFRESH_RETRY_WINDOW_MS = 25_000;
/** Each family's refresh lock, across the origin's tabs, is this prefix plus its family id. */
export const ACR_REFRESH_LOCK_PREFIX = "ask-dev:acr-refresh:";
/** The origin's tabs talk here: clone detection (`hello`/`taken`) and sign-out (`clear`). */
export const ACR_TABS_CHANNEL = "ask-dev:acr-tabs";
/** How long a tab's clone check waits for a `taken` answer (CHAOS-12305). */
export const ACR_CLONE_CHECK_MS = 200;

const ACCESS_TOKEN = /^fcacr_[A-Za-z0-9_-]{43}$/u;
const REFRESH_TOKEN = /^acrrt_[A-Za-z0-9_-]{43}$/u;
/** A PKCE verifier or state: 32 random bytes, base64url, no padding. */
const RANDOM_43 = /^[A-Za-z0-9_-]{43}$/u;
const TAB_ID = /^[A-Za-z0-9_-]{22}$/u;
/** A family id: 16 random bytes, base64url, like a tab id. */
const FAMILY_ID = TAB_ID;

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

/** The web session the family and the access token are bound to (CHAOS-12305). */
export type AcrPrincipal = { readonly userId: string; readonly orgId: string | null };

/** An impersonating web session: it gets no ACR token (CHAOS-12306). */
export type AcrImpersonating = { readonly impersonating: true };

/** What the principal seam reads: the principal, an impersonating session, or null (no session). */
export type AcrPrincipalRead = AcrPrincipal | AcrImpersonating | null;

/**
 * What the family entry in `sessionStorage` holds. The sign-out hook reads it. v2 (CHAOS-12305)
 * adds the family id and the principal; a v1 entry names no principal and is ignored.
 */
export type AcrHeldFamily = {
    readonly v: 2;
    /** Random, made at the exchange; names the family's refresh lock. A cloned tab copies it. */
    readonly familyId: string;
    readonly issuer: string;
    readonly clientId: string;
    readonly refreshToken: string;
    readonly tokenEndpoint: string;
    readonly revocationEndpoint: string | null;
    readonly userId: string;
    readonly orgId: string | null;
};

/** The messages on `ACR_TABS_CHANNEL`. They carry no token. */
export type AcrTabMessage =
    | { readonly type: "hello"; readonly tabId: string }
    | { readonly type: "taken"; readonly tabId: string }
    | { readonly type: "clear" };

/** The origin's tab channel: a BroadcastChannel in the browser. */
export type AcrTabChannel = {
    /** Reaches every other tab of the origin, never this one. */
    readonly post: (message: AcrTabMessage) => void;
    /** What other tabs post; untrusted shape until checked. */
    readonly onMessage: (handler: (message: unknown) => void) => void;
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
    | "claim_unavailable"
    /** No web session at the callback: no code is sent (CHAOS-12305). */
    | "signed_out"
    /** An impersonating session at the callback, or by the end of the exchange (CHAOS-12306). */
    | "impersonating";

export type AcrCallbackOutcome =
    | { readonly kind: "authorized"; readonly returnTo: string }
    | { readonly kind: "denied"; readonly error: string; readonly returnTo: string }
    | { readonly kind: "failed"; readonly reason: AcrCallbackFailure; readonly returnTo: string };

export type AcrBeginOutcome =
    | { readonly kind: "redirected" }
    | { readonly kind: "off" }
    | { readonly kind: "unavailable" }
    /** The session is impersonating: nothing is sent and the tab stays (CHAOS-12306). */
    | { readonly kind: "impersonating" };

type Held = AcrPrincipal & {
    readonly token: string;
    readonly issuer: string;
    readonly clientId: string;
    readonly expiresAt: number;
    /** When this tab received it, and its life: the refresh starts at 80 % of it. */
    readonly issuedAt: number;
    readonly lifetimeMs: number;
};

/** The access token: this module's memory only. */
let held: Held | null = null;
/** The channel this tab's listener is on; null until the store's first use. */
let listeningOn: AcrTabChannel | null = null;
/** This page load's clone check, once started: it runs once. */
let cloneCheck: Promise<void> | null = null;
/** The `hello` this tab waits on an answer to. */
let awaitingTaken: { readonly tabId: string; readonly taken: () => void } | null = null;
/** Counts drops. A refresh that a drop overtook must not store its answer (sign-out, clone). */
let drops = 0;

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
    /**
     * The web session's principal; null with no session or on error (CHAOS-12305); an
     * impersonating session reads as such (CHAOS-12306).
     */
    readonly principal: () => Promise<AcrPrincipalRead>;
    /** The origin's tab channel; null without BroadcastChannel, which skips the clone check. */
    readonly channel: () => AcrTabChannel | null;
};

let browserTabs: AcrTabChannel | null = null;

/** One BroadcastChannel per page, made on first use. */
function browserTabChannel(): AcrTabChannel | null {
    if (browserTabs !== null) return browserTabs;
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
    try {
        const channel = new BroadcastChannel(ACR_TABS_CHANNEL);
        browserTabs = {
            post: (message) => {
                try {
                    channel.postMessage(message);
                } catch {
                    // A closed channel: there is no other tab to tell.
                }
            },
            onMessage: (handler) =>
                channel.addEventListener("message", (event) => handler(event.data)),
        };
    } catch {
        return null;
    }
    return browserTabs;
}

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
            : inTabLock(name, task),
    // Replace, not assign: Back from where the flow returns must not start it again.
    navigate: (url) => window.location.replace(url),
    config: browserAcrClientConfig,
    principal: async () => {
        try {
            // No broadcast: a broadcast makes every other tab fetch its session again.
            const session = await getSession({ broadcast: false });
            const userId = session?.user?.id;
            if (typeof userId !== "string" || userId === "") return null;
            // The admin's user id stays while impersonating: only this flag shows it (CHAOS-12306).
            if (session?.user?.is_impersonating) return { impersonating: true };
            const orgId = session?.user?.org_id;
            return { userId, orgId: typeof orgId === "string" && orgId !== "" ? orgId : null };
        } catch {
            return null;
        }
    },
    channel: browserTabChannel,
};

let dependencies: Dependencies = browserDependencies;

/** The lock chains of this document, for a browser with no Web Locks. */
const inTabLocks = new Map<string, Promise<void>>();

/**
 * With no Web Locks, the lock still serializes this document's tasks of one name (codex r1 on
 * #1676: two calls in one tab must not present one refresh token twice). Across tabs there is then
 * no lock: a family shared that way meets ACR's reuse rule and fails closed.
 */
function inTabLock<T>(name: string, task: () => Promise<T>): Promise<T> {
    const run = (inTabLocks.get(name) ?? Promise.resolve()).then(task);
    const tail = run.then(
        () => undefined,
        () => undefined,
    );
    inTabLocks.set(name, tail);
    void tail.then(() => {
        if (inTabLocks.get(name) === tail) inTabLocks.delete(name);
    });
    return run;
}

/**
 * Tests only: replace the browser seams, and start a new page load's clone check. With no
 * argument, restore them and drop the token.
 */
export function setAcrAuthDependenciesForTest(next?: Partial<Dependencies>): void {
    dependencies = next === undefined ? browserDependencies : { ...browserDependencies, ...next };
    cloneCheck = null;
    awaitingTaken = null;
    if (next === undefined) {
        held = null;
        listeningOn = null;
    }
}

/** A signal that aborts at ACR_OAUTH_REQUEST_TIMEOUT_MS, or when `outer` aborts; `clear` ends it. */
function deadline(outer?: AbortSignal): {
    readonly signal: AbortSignal;
    readonly clear: () => void;
} {
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(new DOMException("ACR did not answer in time", "TimeoutError")),
        ACR_OAUTH_REQUEST_TIMEOUT_MS,
    );
    const follow = () => controller.abort(outer?.reason);
    if (outer?.aborted) follow();
    else outer?.addEventListener("abort", follow, { once: true });
    return {
        signal: controller.signal,
        clear: () => {
            clearTimeout(timer);
            outer?.removeEventListener("abort", follow);
        },
    };
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

function samePrincipal(a: AcrPrincipal, b: AcrPrincipal): boolean {
    return a.userId === b.userId && a.orgId === b.orgId;
}

function isImpersonating(read: AcrPrincipalRead): read is AcrImpersonating {
    return read !== null && "impersonating" in read;
}

/** Drops this tab's access token and family (CHAOS-12305). */
function dropTokens(storage: Storage | null): void {
    held = null;
    drops += 1;
    storage?.removeItem(ACR_TOKEN_FAMILY_KEY);
}

/** Clears this tab's ACR token state: the token, the family and a pending authorization. */
function clearThisTab(): void {
    const storage = dependencies.storage();
    dropTokens(storage);
    storage?.removeItem(ACR_PENDING_AUTHORIZATION_KEY);
}

function onTabMessage(channel: AcrTabChannel, message: unknown): void {
    if (!isRecord(message)) return;
    if (message.type === "clear") {
        clearThisTab();
        return;
    }
    if (typeof message.tabId !== "string" || !TAB_ID.test(message.tabId)) return;
    if (message.type === "hello") {
        // Another tab holds this tab's id: it is a copy of this tab. Tell it the id is taken.
        if (message.tabId === dependencies.storage()?.getItem(ACR_TAB_KEY)) {
            channel.post({ type: "taken", tabId: message.tabId });
        }
        return;
    }
    if (message.type === "taken" && awaitingTaken?.tabId === message.tabId) awaitingTaken.taken();
}

/**
 * Installs this tab's listener on the tab channel, once. Lazily: on the first use of the store,
 * and when the sign-out hook loads (every page), so a tab clears on `clear` and answers a clone.
 */
export function listenForAcrTabs(): void {
    const channel = dependencies.channel();
    if (channel === null || channel === listeningOn) return;
    listeningOn = channel;
    channel.onMessage((message) => onTabMessage(channel, message));
}

/**
 * Whether another tab holds this tab's id: a duplicated tab or `window.open` copies
 * `sessionStorage`. The copy takes a new id and drops the copied family and token. Once per page
 * load. Skipped without a channel, or without a tab id (then nothing was copied).
 */
function checkClone(storage: Storage): Promise<void> {
    cloneCheck ??= (async () => {
        const channel = dependencies.channel();
        const id = storage.getItem(ACR_TAB_KEY);
        if (channel === null || id === null || !TAB_ID.test(id)) return;
        const taken = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
                awaitingTaken = null;
                resolve(false);
            }, ACR_CLONE_CHECK_MS);
            awaitingTaken = {
                tabId: id,
                taken: () => {
                    clearTimeout(timer);
                    awaitingTaken = null;
                    resolve(true);
                },
            };
            channel.post({ type: "hello", tabId: id });
        });
        if (!taken) return;
        storage.setItem(ACR_TAB_KEY, randomBase64Url(16));
        dropTokens(storage);
    })();
    return cloneCheck;
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
    const limit = deadline(signal);
    try {
        const response = await dependencies.fetch(
            `${issuer}/.well-known/oauth-authorization-server`,
            {
                method: "GET",
                headers: { Accept: "application/json" },
                credentials: "omit",
                cache: "no-store",
                redirect: "error",
                signal: limit.signal,
            },
        );
        if (!response.ok) return null;
        body = await response.json();
    } catch {
        return null;
    } finally {
        limit.clear();
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
    listenForAcrTabs();
    // No ACR token for an impersonating session (CHAOS-12306): no metadata read, no navigation.
    // A signed-out start goes on: the callback refuses it before it sends the code.
    if (isImpersonating(await dependencies.principal())) return { kind: "impersonating" };
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
    return postTokenForm(
        pending.tokenEndpoint,
        new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: pending.redirectUri,
            client_id: pending.clientId,
            code_verifier: pending.verifier,
            resource: pending.issuer,
        }),
    );
}

/** ACR's refresh grant (CHAOS-12305). It rotates: the caller requires the new refresh token. */
function refreshGrant(family: AcrHeldFamily): Promise<TokenAnswer> {
    return postTokenForm(
        family.tokenEndpoint,
        new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: family.refreshToken,
            client_id: family.clientId,
        }),
    );
}

/** One POST to ACR's token endpoint, under the request deadline, with the answer's shape checked. */
async function postTokenForm(endpoint: string, form: URLSearchParams): Promise<TokenAnswer> {
    let response: Response;
    let body: unknown;
    const limit = deadline();
    try {
        try {
            // A form POST with only safelisted headers: no CORS preflight (design §7).
            response = await dependencies.fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: form,
                credentials: "omit",
                cache: "no-store",
                redirect: "error",
                signal: limit.signal,
            });
        } catch {
            return { kind: "unavailable" };
        }
        if (response.status === 400 || response.status === 401) return { kind: "refused" };
        if (!response.ok) return { kind: "unavailable" };
        try {
            body = await response.json();
        } catch {
            return limit.signal.aborted ? { kind: "unavailable" } : { kind: "invalid" };
        }
    } finally {
        limit.clear();
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
    listenForAcrTabs();
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
    // The family is bound to the web principal (CHAOS-12305). Read it before the one-exchange
    // claim: a signed-out callback spends nothing, sends no code and stores nothing.
    const dropsBefore = drops;
    const principal = await dependencies.principal();
    if (principal === null) return fail("signed_out");
    // Impersonating (CHAOS-12306): as signed out, nothing is spent, sent or stored.
    if (isImpersonating(principal)) return fail("impersonating");
    const claim = await claimOnce(pending);
    if (claim === "spent") return fail("already_used");
    if (claim === "unavailable") return fail("claim_unavailable");
    const answer = await exchangeCode(pending, code);
    if (answer.kind === "refused") return fail("token_refused");
    if (answer.kind === "unavailable") return fail("token_unavailable");
    if (answer.kind === "invalid") return fail("invalid_token_response");
    // A sign-out, or another web user, while the exchange ran: hold and store nothing, so nothing
    // outlives the sign-out that could not revoke it (codex r2 on #1676).
    const after = await dependencies.principal();
    // An impersonation that started while the exchange ran: hold and store nothing (CHAOS-12306).
    if (isImpersonating(after)) return fail("impersonating");
    if (drops !== dropsBefore || after === null || !samePrincipal(after, principal)) {
        return fail("signed_out");
    }
    hold(answer.access, answer.expiresIn, pending.issuer, pending.clientId, principal);
    if (answer.refresh === null) {
        storage.removeItem(ACR_TOKEN_FAMILY_KEY);
    } else {
        const family: AcrHeldFamily = {
            v: 2,
            familyId: randomBase64Url(16),
            issuer: pending.issuer,
            clientId: pending.clientId,
            refreshToken: answer.refresh,
            tokenEndpoint: pending.tokenEndpoint,
            revocationEndpoint: pending.revocationEndpoint,
            userId: principal.userId,
            orgId: principal.orgId,
        };
        storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify(family));
    }
    return { kind: "authorized", returnTo: pending.returnTo };
}

function hold(
    token: string,
    expiresIn: number,
    issuer: string,
    clientId: string,
    principal: AcrPrincipal,
): void {
    const issuedAt = dependencies.now();
    const lifetimeMs = expiresIn * 1000;
    held = {
        token,
        issuer,
        clientId,
        issuedAt,
        lifetimeMs,
        expiresAt: issuedAt + lifetimeMs,
        userId: principal.userId,
        orgId: principal.orgId,
    };
}

const AUTHORIZATION_REQUIRED: AcrAccessToken = { kind: "authorization_required" };

/**
 * The held token, while it is for the configured client, before 80 % of its life and not within
 * the skew of its expiry. Otherwise null. The caller has already dropped another principal's.
 */
function servable(config: AcrBrowserClientConfig): AcrAccessToken | null {
    if (held === null || held.issuer !== config.issuer || held.clientId !== config.clientId) {
        return null;
    }
    const now = dependencies.now();
    if (now >= held.issuedAt + ACR_ACCESS_TOKEN_REFRESH_AT * held.lifetimeMs) return null;
    if (now >= held.expiresAt - ACR_ACCESS_TOKEN_SKEW_MS) return null;
    return { kind: "token", token: held.token, issuer: held.issuer };
}

function forClient(family: AcrHeldFamily, config: AcrBrowserClientConfig): boolean {
    return family.issuer === config.issuer && family.clientId === config.clientId;
}

/**
 * Refreshes with the family, under its lock: one refresh at a time per family across the
 * origin's tabs (CHAOS-12305).
 */
function refresh(
    storage: Storage,
    familyId: string,
    config: AcrBrowserClientConfig,
    principal: AcrPrincipal,
): Promise<AcrAccessToken> {
    return dependencies.lock(`${ACR_REFRESH_LOCK_PREFIX}${familyId}`, async () => {
        // Another call in this tab refreshed while this one waited: no request.
        const current = servable(config);
        if (current !== null) return current;
        // Re-read inside the lock: the entry may have rotated or been cleared meanwhile.
        const family = readAcrHeldFamily();
        if (family === null || family.familyId !== familyId || !forClient(family, config)) {
            return AUTHORIZATION_REQUIRED;
        }
        if (!samePrincipal(family, principal)) {
            dropTokens(storage);
            return AUTHORIZATION_REQUIRED;
        }
        const dropsBefore = drops;
        const startedAt = dependencies.now();
        let answer = await refreshGrant(family);
        // A lost response: ACR may have rotated. Its 30 s grace gives the same successor to the
        // same token, so one retry inside 25 s is safe. After that the token is never sent again.
        if (
            answer.kind === "unavailable" &&
            drops === dropsBefore &&
            dependencies.now() - startedAt < ACR_REFRESH_RETRY_WINDOW_MS
        ) {
            answer = await refreshGrant(family);
        }
        // Cleared while in flight (sign-out in another tab): store nothing.
        if (drops !== dropsBefore) return AUTHORIZATION_REQUIRED;
        // Refused (400/401: reuse, revoked, expired), lost twice, too late, or malformed: the
        // family cannot be used again. Fail closed.
        if (answer.kind !== "ok" || answer.refresh === null) {
            dropTokens(storage);
            return AUTHORIZATION_REQUIRED;
        }
        hold(answer.access, answer.expiresIn, family.issuer, family.clientId, principal);
        const rotated: AcrHeldFamily = { ...family, refreshToken: answer.refresh };
        storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify(rotated));
        return { kind: "token", token: answer.access, issuer: family.issuer };
    });
}

/**
 * The access token for one ACR call (T14, CHAOS-12104). T14 awaits it right before each call,
 * never caches the token, and has no retry loop. Never a token for another issuer, client or web
 * principal. In order (CHAOS-12305):
 * 1. off without a configured client;
 * 2. once per page load, the clone check;
 * 3. the principal: a mismatch, no session or an impersonating session (CHAOS-12306) drops the
 *    family and the token, and sends nothing;
 * 4. the held token, before 80 % of its life;
 * 5. else a refresh with the family, when one is held;
 * 6. else "authorization required".
 */
export async function getAcrAccessToken(): Promise<AcrAccessToken> {
    const config = dependencies.config();
    if (config === undefined) return { kind: "off" };
    listenForAcrTabs();
    const storage = dependencies.storage();
    if (storage !== null) await checkClone(storage);
    const principal = await dependencies.principal();
    const family = readAcrHeldFamily();
    if (
        principal === null ||
        isImpersonating(principal) ||
        (held !== null && !samePrincipal(held, principal)) ||
        (family !== null && !samePrincipal(family, principal))
    ) {
        dropTokens(storage);
        return AUTHORIZATION_REQUIRED;
    }
    const current = servable(config);
    if (current !== null) return current;
    if (storage === null || family === null || !forClient(family, config)) {
        return AUTHORIZATION_REQUIRED;
    }
    const answer = await refresh(storage, family.familyId, config, principal);
    if (answer.kind !== "token") return answer;
    // The web session may have changed while the refresh ran (an org switch, a sign-out): the token
    // goes only to the principal it was refreshed for (codex r1 on #1676).
    const dropsBefore = drops;
    const after = await dependencies.principal();
    if (after === null || isImpersonating(after) || !samePrincipal(after, principal)) {
        dropTokens(storage);
        return AUTHORIZATION_REQUIRED;
    }
    // A clear while that check ran (sign-out, a clone) wins: the token is not given out (codex r2).
    if (drops !== dropsBefore) return AUTHORIZATION_REQUIRED;
    return answer;
}

/**
 * T14: ACR answered 401 `invalid_token` for `token` on a data call. Drops the held token only if
 * it is that token, so a newer one stays. Keeps the family: the next `getAcrAccessToken()`
 * refreshes (CHAOS-12305).
 */
export function reportAcrTokenRejected(token: string): void {
    if (held !== null && held.token === token) held = null;
}

/**
 * Sign-out step 3: clears this tab's token state and tells the origin's other tabs to clear
 * theirs (CHAOS-12305).
 */
export function clearAcrTokensInAllTabs(): void {
    listenForAcrTabs();
    clearThisTab();
    dependencies.channel()?.post({ type: "clear" });
}

/**
 * The family this tab holds, from `sessionStorage` only (sync, any page). `null` when none, or
 * for a v1 entry, which names no principal. It does not check the principal: the sign-out hook
 * revokes the family whoever is signed in.
 */
export function readAcrHeldFamily(): AcrHeldFamily | null {
    const storage = dependencies.storage();
    if (storage === null) return null;
    const value = readJson(storage, ACR_TOKEN_FAMILY_KEY);
    if (!isRecord(value) || value.v !== 2) return null;
    if (typeof value.refreshToken !== "string" || !REFRESH_TOKEN.test(value.refreshToken))
        return null;
    if (typeof value.familyId !== "string" || !FAMILY_ID.test(value.familyId)) return null;
    // Only the configured client's family, with its endpoints on that issuer's origin, as discovery
    // checked them: a family edited in storage never sends a refresh token elsewhere (codex r1 on
    // #1676). With no configured client there is no family to use or revoke.
    const config = dependencies.config();
    if (config === undefined) return null;
    if (value.issuer !== config.issuer || value.clientId !== config.clientId) return null;
    if (endpointOn(config.issuer, value.tokenEndpoint) !== value.tokenEndpoint) return null;
    if (
        value.revocationEndpoint !== null &&
        endpointOn(config.issuer, value.revocationEndpoint) !== value.revocationEndpoint
    ) {
        return null;
    }
    if (typeof value.userId !== "string" || value.userId === "") return null;
    if (value.orgId !== null && typeof value.orgId !== "string") return null;
    return value as unknown as AcrHeldFamily;
}
