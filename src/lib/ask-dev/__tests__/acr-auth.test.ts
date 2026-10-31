import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ACR_AUTHORIZATION_TTL_MS,
    ACR_BROWSER_SCOPE,
    ACR_PENDING_AUTHORIZATION_KEY,
    ACR_TAB_KEY,
    ACR_TOKEN_FAMILY_KEY,
    beginAcrAuthorization,
    completeAcrAuthorization,
    discoverAcrAuthorizationServer,
    getAcrAccessToken,
    pkceChallenge,
    readAcrHeldFamily,
    setAcrAuthDependenciesForTest,
} from "../acr-auth";
import { acrBrowserClientConfig, type AcrBrowserClientConfig } from "../acr-browser-config";

/**
 * CHAOS-12303 (c2 of the T13 split): the browser's ACR authorization flow and token store. The
 * shapes are acr-api's at the web pin bd92be5a:
 * - metadata: `internal/api/oauth_routes.go:61-110`;
 * - the token body: `oauth_routes.go:764-771`, where `refresh_token` appears only with the browser
 *   refresh grant;
 * - errors: `{error}` with 400;
 * - the callback: `redirect_uri?code&state&iss`, or `?error&state&iss`.
 */

const ISSUER = "https://acr.fullchaos.dev";
const WEB = "https://www.fullchaos.dev";
const CONFIG = acrBrowserClientConfig(ISSUER, WEB) as AcrBrowserClientConfig;
const ACCESS = `fcacr_${"A".repeat(43)}`;
const REFRESH = `acrrt_${"R".repeat(43)}`;

const METADATA = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    registration_endpoint: `${ISSUER}/register`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
    revocation_endpoint: `${ISSUER}/revoke`,
};

class MemoryStorage implements Storage {
    private readonly items = new Map<string, string>();
    get length() {
        return this.items.size;
    }
    clear() {
        this.items.clear();
    }
    getItem(key: string) {
        return this.items.get(key) ?? null;
    }
    key(index: number) {
        return [...this.items.keys()][index] ?? null;
    }
    removeItem(key: string) {
        this.items.delete(key);
    }
    setItem(key: string, value: string) {
        this.items.set(key, String(value));
    }
    snapshot() {
        return Object.fromEntries(this.items);
    }
}

type Call = { url: string; init: RequestInit | undefined };

let now = 1_800_000_000_000;
let storage: MemoryStorage;
let calls: Call[];
let navigated: string[];
let tokenResponse: () => Response;
let metadata: unknown;
/** The origin's localStorage, shared by every tab (a clone shares it too). */
let shared: MemoryStorage;

function json(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

/** `null` = no configured client. (`undefined` would take the default.) */
function configure(tab: MemoryStorage, config: AcrBrowserClientConfig | null | undefined = CONFIG) {
    setAcrAuthDependenciesForTest({
        now: () => now,
        storage: () => tab,
        shared: () => shared,
        navigate: (url) => navigated.push(url),
        config: () => config ?? undefined,
        fetch: async (input, init) => {
            const url = String(input);
            calls.push({ url, init });
            if (url === `${ISSUER}/.well-known/oauth-authorization-server`)
                return json(200, metadata);
            if (url === `${ISSUER}/token`) return tokenResponse();
            return json(404, {});
        },
    });
}

beforeEach(() => {
    storage = new MemoryStorage();
    shared = new MemoryStorage();
    calls = [];
    navigated = [];
    metadata = METADATA;
    tokenResponse = () =>
        json(200, {
            access_token: ACCESS,
            token_type: "Bearer",
            expires_in: 600,
            scope: ACR_BROWSER_SCOPE,
            refresh_token: REFRESH,
        });
    configure(storage);
});

afterEach(() => {
    setAcrAuthDependenciesForTest();
    vi.restoreAllMocks();
});

/** Starts an authorization in `tab` and returns the authorize URL it navigated to. */
async function begin(tab: MemoryStorage = storage, returnTo = "/dev?thread=t1") {
    configure(tab);
    expect(await beginAcrAuthorization(returnTo)).toEqual({ kind: "redirected" });
    return new URL(navigated.at(-1)!);
}

function callback(params: Record<string, string>) {
    const url = new URL(CONFIG.redirectUri);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.href;
}

function tokenCalls() {
    return calls.filter((call) => call.url === `${ISSUER}/token`);
}

describe("beginAcrAuthorization", () => {
    it("sends the tab to ACR's /authorize with PKCE S256, a state, the exact redirect and the issuer as resource", async () => {
        const authorize = await begin();
        expect(`${authorize.origin}${authorize.pathname}`).toBe(`${ISSUER}/authorize`);
        const params = Object.fromEntries(authorize.searchParams);
        expect(params).toEqual({
            response_type: "code",
            client_id: `${WEB}/oauth/acr-client.json`,
            redirect_uri: `${WEB}/ask-dev/oauth/callback`,
            code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
            code_challenge_method: "S256",
            state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
            resource: ISSUER,
            scope: "context:read evidence:read",
        });
        const pending = JSON.parse(storage.getItem(ACR_PENDING_AUTHORIZATION_KEY)!);
        expect(pending.state).toBe(params.state);
        expect(await pkceChallenge(pending.verifier)).toBe(params.code_challenge);
        expect(pending.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        expect(pending.expiresAt).toBe(now + ACR_AUTHORIZATION_TTL_MS);
        expect(pending.returnTo).toBe("/dev?thread=t1");
    });

    it("computes S256 as RFC 7636 appendix B does", async () => {
        expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        );
    });

    it("draws a new state and verifier every time", async () => {
        const first = await begin();
        const second = await begin();
        expect(first.searchParams.get("state")).not.toBe(second.searchParams.get("state"));
        expect(first.searchParams.get("code_challenge")).not.toBe(
            second.searchParams.get("code_challenge"),
        );
    });

    it("returns to /dev for a return path that is not a same-origin path", async () => {
        await begin(storage, "https://evil.example/x");
        expect(JSON.parse(storage.getItem(ACR_PENDING_AUTHORIZATION_KEY)!).returnTo).toBe("/dev");
        await begin(storage, "//evil.example/x");
        expect(JSON.parse(storage.getItem(ACR_PENDING_AUTHORIZATION_KEY)!).returnTo).toBe("/dev");
    });

    it("reads the metadata with no credential and no cache", async () => {
        await begin();
        const [discovery] = calls;
        expect(discovery!.init).toMatchObject({
            method: "GET",
            credentials: "omit",
            cache: "no-store",
        });
    });

    it("is off without a configured client, and sends nothing", async () => {
        configure(storage, null);
        expect(await beginAcrAuthorization("/dev")).toEqual({ kind: "off" });
        expect(calls).toEqual([]);
        expect(navigated).toEqual([]);
    });

    it("does not start when the metadata cannot be read", async () => {
        metadata = { ...METADATA, issuer: "https://other.example" };
        expect(await beginAcrAuthorization("/dev")).toEqual({ kind: "unavailable" });
        expect(navigated).toEqual([]);
        expect(storage.getItem(ACR_PENDING_AUTHORIZATION_KEY)).toBeNull();
    });
});

describe("discoverAcrAuthorizationServer", () => {
    it.each([
        ["another issuer", { issuer: "https://other.example" }],
        ["no S256", { code_challenge_methods_supported: ["plain"] }],
        ["no iss parameter", { authorization_response_iss_parameter_supported: false }],
        [
            "an authorize endpoint on another origin",
            { authorization_endpoint: "https://evil.example/authorize" },
        ],
        ["a token endpoint on another origin", { token_endpoint: "https://evil.example/token" }],
        [
            "a revocation endpoint on another origin",
            { revocation_endpoint: "https://evil.example/revoke" },
        ],
        [
            "a token endpoint with user info",
            { token_endpoint: `https://u@acr.fullchaos.dev/token` },
        ],
    ])("refuses metadata with %s", async (_, change) => {
        metadata = { ...METADATA, ...change };
        expect(await discoverAcrAuthorizationServer(ISSUER)).toBeNull();
    });

    it("accepts metadata with no revocation endpoint (no browser refresh grant)", async () => {
        const { revocation_endpoint: _omitted, ...rest } = METADATA;
        metadata = rest;
        expect(await discoverAcrAuthorizationServer(ISSUER)).toEqual({
            issuer: ISSUER,
            authorizationEndpoint: `${ISSUER}/authorize`,
            tokenEndpoint: `${ISSUER}/token`,
            revocationEndpoint: null,
        });
    });
});

describe("completeAcrAuthorization", () => {
    async function started() {
        const authorize = await begin();
        return authorize.searchParams.get("state")!;
    }

    it("exchanges the code with a form POST and holds the token in memory only", async () => {
        const state = await started();
        const outcome = await completeAcrAuthorization(
            callback({ code: "c-1", state, iss: ISSUER }),
        );
        expect(outcome).toEqual({ kind: "authorized", returnTo: "/dev?thread=t1" });

        const [exchange] = tokenCalls();
        expect(exchange!.init).toMatchObject({
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            credentials: "omit",
            cache: "no-store",
        });
        // Only CORS-safelisted headers: the browser sends it with no preflight.
        expect(Object.keys(exchange!.init!.headers as Record<string, string>)).toEqual([
            "Content-Type",
        ]);
        const form = Object.fromEntries(exchange!.init!.body as URLSearchParams);
        expect(form).toEqual({
            grant_type: "authorization_code",
            code: "c-1",
            redirect_uri: `${WEB}/ask-dev/oauth/callback`,
            client_id: `${WEB}/oauth/acr-client.json`,
            code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
            resource: ISSUER,
        });

        expect(getAcrAccessToken()).toEqual({ kind: "token", token: ACCESS, issuer: ISSUER });
        // The access token is in no storage; the refresh token only in the family entry.
        const stored = JSON.stringify(storage.snapshot());
        expect(stored).not.toContain(ACCESS);
        expect(storage.getItem(ACR_PENDING_AUTHORIZATION_KEY)).toBeNull();
        expect(readAcrHeldFamily()).toEqual({
            v: 1,
            issuer: ISSUER,
            clientId: `${WEB}/oauth/acr-client.json`,
            refreshToken: REFRESH,
            tokenEndpoint: `${ISSUER}/token`,
            revocationEndpoint: `${ISSUER}/revoke`,
        });
    });

    it("refuses a state this tab did not start, and sends no code", async () => {
        await started();
        const outcome = await completeAcrAuthorization(
            callback({ code: "c-1", state: "x".repeat(43), iss: ISSUER }),
        );
        expect(outcome).toMatchObject({ kind: "failed", reason: "state_mismatch" });
        expect(tokenCalls()).toEqual([]);
        expect(getAcrAccessToken()).toEqual({ kind: "authorization_required" });
    });

    it("refuses another tab's state: the pending entry lives in that tab only", async () => {
        const otherTab = new MemoryStorage();
        const state = (await begin(otherTab)).searchParams.get("state")!;
        configure(storage);
        const outcome = await completeAcrAuthorization(
            callback({ code: "c-1", state, iss: ISSUER }),
        );
        expect(outcome).toMatchObject({ kind: "failed", reason: "no_pending" });
        expect(tokenCalls()).toEqual([]);
    });

    it("refuses a pending entry bound to another tab id (a copied entry)", async () => {
        const state = await started();
        storage.setItem(ACR_TAB_KEY, "B".repeat(22));
        const outcome = await completeAcrAuthorization(
            callback({ code: "c-1", state, iss: ISSUER }),
        );
        expect(outcome).toMatchObject({ kind: "failed", reason: "wrong_tab" });
        expect(tokenCalls()).toEqual([]);
    });

    it("refuses a callback after the authorization expired", async () => {
        const state = await started();
        now += ACR_AUTHORIZATION_TTL_MS;
        const outcome = await completeAcrAuthorization(
            callback({ code: "c-1", state, iss: ISSUER }),
        );
        expect(outcome).toMatchObject({ kind: "failed", reason: "expired" });
        expect(tokenCalls()).toEqual([]);
    });

    it.each([
        ["another issuer", "https://evil.example"],
        ["no iss", null],
    ])("refuses a callback with %s", async (_, iss) => {
        const state = await started();
        const params: Record<string, string> = { code: "c-1", state };
        if (iss !== null) params.iss = iss;
        const outcome = await completeAcrAuthorization(callback(params));
        expect(outcome).toMatchObject({ kind: "failed", reason: "iss_mismatch" });
        expect(tokenCalls()).toEqual([]);
    });

    it("refuses a callback when the configured issuer changed since the start", async () => {
        const state = await started();
        configure(storage, acrBrowserClientConfig("https://acr2.fullchaos.dev", WEB));
        const outcome = await completeAcrAuthorization(
            callback({ code: "c-1", state, iss: ISSUER }),
        );
        expect(outcome).toMatchObject({ kind: "failed", reason: "iss_mismatch" });
    });

    it("refuses a replayed callback: the pending entry is single use", async () => {
        const state = await started();
        const url = callback({ code: "c-1", state, iss: ISSUER });
        expect(await completeAcrAuthorization(url)).toMatchObject({ kind: "authorized" });
        expect(await completeAcrAuthorization(url)).toMatchObject({
            kind: "failed",
            reason: "no_pending",
        });
        expect(tokenCalls()).toHaveLength(1);
    });

    it("spends the pending entry on a refused callback too", async () => {
        await started();
        await completeAcrAuthorization(
            callback({ code: "c-1", state: "y".repeat(43), iss: ISSUER }),
        );
        expect(storage.getItem(ACR_PENDING_AUTHORIZATION_KEY)).toBeNull();
    });

    it("gives access_denied its own outcome, and names other errors only from the RFC set", async () => {
        let state = await started();
        expect(
            await completeAcrAuthorization(
                callback({ error: "access_denied", state, iss: ISSUER }),
            ),
        ).toEqual({ kind: "denied", error: "access_denied", returnTo: "/dev?thread=t1" });
        state = await started();
        expect(
            await completeAcrAuthorization(
                callback({ error: "<script>x</script>", state, iss: ISSUER }),
            ),
        ).toMatchObject({ kind: "denied", error: "other" });
        expect(tokenCalls()).toEqual([]);
    });

    it("checks state and iss before it trusts an error", async () => {
        await started();
        expect(
            await completeAcrAuthorization(
                callback({ error: "access_denied", state: "z".repeat(43), iss: ISSUER }),
            ),
        ).toMatchObject({ kind: "failed", reason: "state_mismatch" });
    });

    it("maps a refused code (400 invalid_grant) to token_refused and holds nothing", async () => {
        const state = await started();
        tokenResponse = () => json(400, { error: "invalid_grant" });
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toMatchObject({ kind: "failed", reason: "token_refused" });
        expect(getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
    });

    it("maps a 503 to token_unavailable", async () => {
        const state = await started();
        tokenResponse = () => json(503, { error: "temporarily_unavailable" });
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toMatchObject({ kind: "failed", reason: "token_unavailable" });
    });

    it.each([
        ["an access token of another shape", { access_token: "eyJhbGciOi.x.y" }],
        ["another token type", { token_type: "DPoP" }],
        ["no lifetime", { expires_in: undefined }],
        ["a zero lifetime", { expires_in: 0 }],
        ["a refresh token of another shape", { refresh_token: "rt-1" }],
    ])("refuses a token response with %s", async (_, change) => {
        const state = await started();
        tokenResponse = () =>
            json(200, {
                access_token: ACCESS,
                token_type: "Bearer",
                expires_in: 600,
                refresh_token: REFRESH,
                ...change,
            });
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toMatchObject({ kind: "failed", reason: "invalid_token_response" });
        expect(getAcrAccessToken()).toEqual({ kind: "authorization_required" });
    });

    it("holds no family when ACR gives no refresh token", async () => {
        const state = await started();
        storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify({ v: 1, stale: true }));
        tokenResponse = () =>
            json(200, { access_token: ACCESS, token_type: "Bearer", expires_in: 600 });
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toMatchObject({ kind: "authorized" });
        expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        expect(getAcrAccessToken()).toMatchObject({ kind: "token" });
    });
});

describe("a duplicated tab (copied sessionStorage) — r1 on #1663", () => {
    /** A tab duplicated while the flow is at ACR: it gets a copy of this tab's sessionStorage. */
    function duplicate(tab: MemoryStorage): MemoryStorage {
        const copy = new MemoryStorage();
        for (const [key, value] of Object.entries(tab.snapshot())) copy.setItem(key, value);
        return copy;
    }

    it("cannot exchange a code for an authorization the original already completed", async () => {
        const state = (await begin()).searchParams.get("state")!;
        const clone = duplicate(storage);
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toMatchObject({ kind: "authorized" });

        configure(clone);
        expect(
            await completeAcrAuthorization(callback({ code: "c-2", state, iss: ISSUER })),
        ).toMatchObject({ kind: "failed", reason: "already_used" });
        expect(tokenCalls()).toHaveLength(1);
    });

    it("lets one start give one exchange: when the copy completes first, the original cannot", async () => {
        const state = (await begin()).searchParams.get("state")!;
        const clone = duplicate(storage);
        configure(clone);
        expect(
            await completeAcrAuthorization(callback({ code: "c-2", state, iss: ISSUER })),
        ).toMatchObject({ kind: "authorized" });

        configure(storage);
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toMatchObject({ kind: "failed", reason: "already_used" });
        expect(tokenCalls()).toHaveLength(1);
    });

    it("writes the spent marker only inside the origin-wide lock", async () => {
        const state = (await begin()).searchParams.get("state")!;
        let inLock = false;
        const names: string[] = [];
        const original = shared.setItem.bind(shared);
        shared.setItem = (key, value) => {
            expect(inLock, "the spent marker is written outside the lock").toBe(true);
            original(key, value);
        };
        setAcrAuthDependenciesForTest({
            now: () => now,
            storage: () => storage,
            shared: () => shared,
            config: () => CONFIG,
            fetch: async (input, init) => {
                calls.push({ url: String(input), init });
                return tokenResponse();
            },
            lock: async (name, task) => {
                names.push(name);
                inLock = true;
                try {
                    return await task();
                } finally {
                    inLock = false;
                }
            },
        });
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toMatchObject({ kind: "authorized" });
        expect(names).toEqual(["ask-dev:acr-authorization"]);
    });

    it("stores no state in shared storage, only its hash, and drops it after the expiry", async () => {
        const state = (await begin()).searchParams.get("state")!;
        await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER }));
        const spent = JSON.stringify(shared.snapshot());
        expect(spent).not.toContain(state);
        expect(spent).not.toMatch(/fcacr_|acrrt_/u);
        now += ACR_AUTHORIZATION_TTL_MS;
        const next = (await begin()).searchParams.get("state")!;
        await completeAcrAuthorization(callback({ code: "c-3", state: next, iss: ISSUER }));
        expect(Object.keys(JSON.parse(shared.getItem("ask-dev:acr-spent")!))).toHaveLength(1);
    });
});

describe("getAcrAccessToken", () => {
    async function authorized() {
        const state = (await begin()).searchParams.get("state")!;
        await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER }));
    }

    it("asks for authorization before any flow, and is off without a client", () => {
        expect(getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        configure(storage, null);
        expect(getAcrAccessToken()).toEqual({ kind: "off" });
    });

    it("stops serving the token 30 s before it expires", async () => {
        await authorized();
        now += 600_000 - 30_001;
        expect(getAcrAccessToken()).toMatchObject({ kind: "token" });
        now += 1;
        expect(getAcrAccessToken()).toEqual({ kind: "authorization_required" });
    });

    it("never serves a token to another configured client", async () => {
        await authorized();
        configure(storage, acrBrowserClientConfig("https://acr2.fullchaos.dev", WEB));
        expect(getAcrAccessToken()).toEqual({ kind: "authorization_required" });
    });
});
