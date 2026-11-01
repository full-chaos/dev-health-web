import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AcrOAuthMock } from "../../../../tests/mocks/acr-oauth";
import * as defaultTab from "../acr-auth";
import {
    ACR_AUTHORIZATION_TTL_MS,
    ACR_CLONE_CHECK_MS,
    ACR_OAUTH_REQUEST_TIMEOUT_MS,
    ACR_BROWSER_SCOPE,
    ACR_PENDING_AUTHORIZATION_KEY,
    ACR_SPENT_KEY,
    ACR_TAB_KEY,
    ACR_TABS_CHANNEL,
    ACR_TOKEN_FAMILY_KEY,
    type AcrPrincipal,
    type AcrPrincipalRead,
    type AcrTabChannel,
    type AcrTabMessage,
    beginAcrAuthorization,
    completeAcrAuthorization,
    discoverAcrAuthorizationServer,
    getAcrAccessToken,
    pkceChallenge,
    readAcrHeldFamily,
    reportAcrTokenRejected,
    setAcrAuthDependenciesForTest,
} from "../acr-auth";
import { acrBrowserClientConfig, type AcrBrowserClientConfig } from "../acr-browser-config";
import { acrBrowserSignOut } from "../acr-sign-out";

/**
 * CHAOS-12369: the logger, mocked. `sink` keeps every call of the whole file (the per-test `log`
 * counts are cleared; the sink is not), so the no-secret guard at the end sees them all.
 */
const sink = vi.hoisted(() => [] as { level: string; args: unknown[] }[]);
const log = vi.hoisted(() => {
    const level = (name: string) =>
        vi.fn((...args: unknown[]) => {
            sink.push({ level: name, args });
        });
    return {
        debug: level("debug"),
        info: level("info"),
        warn: level("warn"),
        error: level("error"),
    };
});
vi.mock("@/lib/logger", () => ({ logger: log }));

/** The NextAuth client read behind the browser's `principal` seam (CHAOS-12305). */
const getSession = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ getSession }));

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
const TAB_ID = /^[A-Za-z0-9_-]{22}$/u;
/** The web session's principal the family and the token are bound to (CHAOS-12305). */
const USER: AcrPrincipal = { userId: "user-1", orgId: "org-1" };
/** A family entry a past page load of this tab stored (CHAOS-12305: v2, bound to USER). */
const STORED_FAMILY = {
    v: 2,
    familyId: "F".repeat(22),
    issuer: ISSUER,
    clientId: CONFIG.clientId,
    refreshToken: REFRESH,
    tokenEndpoint: `${ISSUER}/token`,
    revocationEndpoint: `${ISSUER}/revoke`,
    userId: USER.userId,
    orgId: USER.orgId,
};

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

/** Every secret value a test of this file saw, by kind (CHAOS-12369): no log call may carry one. */
const secretsByKind = {
    access: new Set<string>([ACCESS]),
    refresh: new Set<string>([REFRESH]),
    code: new Set<string>(),
    verifier: new Set<string>(),
    state: new Set<string>(),
    tab: new Set<string>(),
};
/** Every storage made in the running test, to read its tab id at the end. */
let storages: MemoryStorage[] = [];

class MemoryStorage implements Storage {
    private readonly items = new Map<string, string>();
    constructor() {
        storages.push(this);
    }
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

/** The secret fields of one token request and its answer (CHAOS-12369). */
function harvestSecrets(form: Record<string, string>, answer: Record<string, unknown>) {
    const found: [keyof typeof secretsByKind, unknown][] = [
        ["code", form.code],
        ["verifier", form.code_verifier],
        ["refresh", form.refresh_token],
        ["access", answer.access_token],
        ["refresh", answer.refresh_token],
    ];
    for (const [kind, value] of found) {
        if (typeof value === "string" && value !== "") secretsByKind[kind].add(value);
    }
}

/** The state of an authorize URL, a secret for the log guard (CHAOS-12369). */
function harvestAuthorizeUrl(url: string) {
    const state = new URL(url).searchParams.get("state");
    if (state !== null) secretsByKind.state.add(state);
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
/**
 * What the fake `principal` seam answers: the current web session, null (signed out) or an
 * impersonating session (CHAOS-12306).
 */
let principal: AcrPrincipalRead;
/** An impersonating web session: the seam's answer while an admin impersonates (CHAOS-12306). */
const IMPERSONATING: AcrPrincipalRead = { impersonating: true };

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
        principal: async () => principal,
        storage: () => tab,
        shared: () => shared,
        navigate: (url) => {
            navigated.push(url);
            harvestAuthorizeUrl(url);
        },
        config: () => config ?? undefined,
        channel: () => null,
        fetch: async (input, init) => {
            const url = String(input);
            calls.push({ url, init });
            if (url === `${ISSUER}/.well-known/oauth-authorization-server`)
                return json(200, metadata);
            if (url === `${ISSUER}/token`) {
                harvestSecrets(
                    Object.fromEntries(new URLSearchParams(String(init?.body ?? ""))),
                    {},
                );
                return tokenResponse();
            }
            return json(404, {});
        },
    });
}

beforeEach(() => {
    storages = [];
    for (const level of Object.values(log)) level.mockClear();
    storage = new MemoryStorage();
    shared = new MemoryStorage();
    calls = [];
    navigated = [];
    principal = USER;
    getSession.mockReset();
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
    for (const tab of storages) {
        const id = tab.getItem(ACR_TAB_KEY);
        if (id !== null) secretsByKind.tab.add(id);
    }
    setAcrAuthDependenciesForTest();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

/** A tab duplicated (or opened with window.open): it gets a copy of this tab's sessionStorage. */
function duplicate(tab: MemoryStorage): MemoryStorage {
    const copy = new MemoryStorage();
    for (const [key, value] of Object.entries(tab.snapshot())) copy.setItem(key, value);
    return copy;
}

/** Real event-loop turns (setImmediate is never faked here). */
async function turns(count: number) {
    for (let turn = 0; turn < count; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

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

    it("does not start while impersonating: no metadata read, no navigation, nothing stored (CHAOS-12306)", async () => {
        principal = IMPERSONATING;
        expect(await beginAcrAuthorization("/dev")).toEqual({ kind: "impersonating" });
        expect(calls).toEqual([]);
        expect(navigated).toEqual([]);
        expect(storage.getItem(ACR_PENDING_AUTHORIZATION_KEY)).toBeNull();
    });

    it("drops a family stored before the impersonation started (codex r1 on #1680)", async () => {
        storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify(STORED_FAMILY));
        principal = IMPERSONATING;
        expect(await beginAcrAuthorization("/dev")).toEqual({ kind: "impersonating" });
        expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        expect(calls).toEqual([]);
    });

    it("still starts with no web session: begin has no signed-out refusal (CHAOS-12306)", async () => {
        principal = null;
        expect(await beginAcrAuthorization("/dev")).toEqual({ kind: "redirected" });
    });

    it("reads no session while the client is off (prod until the T13 roll)", async () => {
        const reads = vi.fn(async () => IMPERSONATING);
        setAcrAuthDependenciesForTest({
            principal: reads,
            config: () => undefined,
            fetch: async (input, init) => {
                calls.push({ url: String(input), init });
                return json(404, {});
            },
        });
        expect(await beginAcrAuthorization("/dev")).toEqual({ kind: "off" });
        expect(await getAcrAccessToken()).toEqual({ kind: "off" });
        expect(reads).not.toHaveBeenCalled();
        expect(calls).toEqual([]);
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

        expect(await getAcrAccessToken()).toEqual({ kind: "token", token: ACCESS, issuer: ISSUER });
        // The access token is in no storage; the refresh token only in the family entry.
        const stored = JSON.stringify(storage.snapshot());
        expect(stored).not.toContain(ACCESS);
        expect(storage.getItem(ACR_PENDING_AUTHORIZATION_KEY)).toBeNull();
        // CHAOS-12305: v2, a random family id (the refresh lock's name), bound to the web principal.
        expect(readAcrHeldFamily()).toEqual({
            v: 2,
            familyId: expect.stringMatching(TAB_ID),
            issuer: ISSUER,
            clientId: `${WEB}/oauth/acr-client.json`,
            refreshToken: REFRESH,
            tokenEndpoint: `${ISSUER}/token`,
            revocationEndpoint: `${ISSUER}/revoke`,
            userId: "user-1",
            orgId: "org-1",
        });
    });

    it("with no web session, sends no code and stores nothing (CHAOS-12305)", async () => {
        const state = await started();
        principal = null;
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toEqual({ kind: "failed", reason: "signed_out", returnTo: "/dev?thread=t1" });
        expect(tokenCalls()).toEqual([]);
        expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        // Read before the one-exchange claim: the start is not spent either.
        expect(shared.getItem(ACR_SPENT_KEY)).toBeNull();
        principal = USER;
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        expect(tokenCalls()).toEqual([]);
    });

    it("while impersonating, sends no code, spends nothing and stores nothing (CHAOS-12306)", async () => {
        const state = await started();
        principal = IMPERSONATING;
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toEqual({ kind: "failed", reason: "impersonating", returnTo: "/dev?thread=t1" });
        expect(tokenCalls()).toEqual([]);
        expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        expect(shared.getItem(ACR_SPENT_KEY)).toBeNull();
        principal = USER;
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        expect(tokenCalls()).toEqual([]);
    });

    it("while impersonating, also drops a family stored before (codex r1 on #1680)", async () => {
        const state = await started();
        storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify(STORED_FAMILY));
        principal = IMPERSONATING;
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toMatchObject({ kind: "failed", reason: "impersonating" });
        expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        expect(tokenCalls()).toEqual([]);
    });

    it("draws a new family id for every exchange", async () => {
        let state = await started();
        await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER }));
        const first = readAcrHeldFamily()!.familyId;
        state = await started();
        await completeAcrAuthorization(callback({ code: "c-2", state, iss: ISSUER }));
        expect(readAcrHeldFamily()!.familyId).not.toBe(first);
    });

    it("while the client is off (prod until the T13 roll), sends no code and stores nothing", async () => {
        const state = await started();
        const before = JSON.stringify(storage.snapshot());
        configure(storage, null);
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toEqual({ kind: "failed", reason: "off", returnTo: "/dev" });
        expect(tokenCalls()).toEqual([]);
        expect(JSON.stringify(storage.snapshot())).toBe(before);
        expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        expect(shared.getItem("ask-dev:acr-spent")).toBeNull();
        expect(await getAcrAccessToken()).toEqual({ kind: "off" });
    });

    it("refuses a state this tab did not start, and sends no code", async () => {
        await started();
        const outcome = await completeAcrAuthorization(
            callback({ code: "c-1", state: "x".repeat(43), iss: ISSUER }),
        );
        expect(outcome).toMatchObject({ kind: "failed", reason: "state_mismatch" });
        expect(tokenCalls()).toEqual([]);
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
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
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
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
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
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
        expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
    });
});

describe("a duplicated tab (copied sessionStorage) — r1 on #1663", () => {
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
            principal: async () => principal,
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

    it.each([
        ["no shared storage", () => null],
        [
            "a shared store that refuses the write",
            () => {
                const refusing = new MemoryStorage();
                refusing.setItem = () => {
                    throw new Error("QuotaExceededError");
                };
                return refusing;
            },
        ],
        [
            "a shared store that drops the write",
            () => {
                const dropping = new MemoryStorage();
                dropping.setItem = () => undefined;
                return dropping;
            },
        ],
    ])("fails closed with %s: no code is sent (r2 on #1663)", async (_, store) => {
        const state = (await begin()).searchParams.get("state")!;
        setAcrAuthDependenciesForTest({
            now: () => now,
            principal: async () => principal,
            storage: () => storage,
            shared: store as () => Storage | null,
            config: () => CONFIG,
            fetch: async (input, init) => {
                calls.push({ url: String(input), init });
                return tokenResponse();
            },
        });
        expect(
            await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER })),
        ).toMatchObject({ kind: "failed", reason: "claim_unavailable" });
        expect(tokenCalls()).toEqual([]);
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

describe("deadlines (r3 on #1663)", () => {
    /**
     * The claim hashes the state on real async I/O, which no count of event-loop turns bounds on a
     * slow runner (CHAOS-12349). Wait on the real clock (only setTimeout is faked) for up to 5 s.
     */
    async function untilExchangeInFlight() {
        const until = Date.now() + 5_000;
        while (tokenCalls().length === 0 && Date.now() < until) {
            await new Promise((resolve) => setImmediate(resolve));
        }
    }

    afterEach(() => {
        vi.useRealTimers();
    });

    /** A fetch that never answers, until its signal aborts. */
    function stalled(url: string) {
        return (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(input), init });
            if (String(input) !== url) {
                return Promise.resolve(json(200, metadata));
            }
            return new Promise<Response>((_, reject) => {
                init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
            });
        };
    }

    it("gives up on metadata ACR never answers, after ACR_OAUTH_REQUEST_TIMEOUT_MS", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        setAcrAuthDependenciesForTest({
            now: () => now,
            principal: async () => principal,
            storage: () => storage,
            shared: () => shared,
            navigate: (url) => navigated.push(url),
            config: () => CONFIG,
            lock: (_name, task) => task(),
            fetch: stalled(`${ISSUER}/.well-known/oauth-authorization-server`),
        });
        const outcome = beginAcrAuthorization("/dev");
        await vi.advanceTimersByTimeAsync(ACR_OAUTH_REQUEST_TIMEOUT_MS - 1);
        let settled = false;
        void outcome.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await outcome).toEqual({ kind: "unavailable" });
        expect(navigated).toEqual([]);
    });

    it("gives up on a token exchange ACR never answers, and holds nothing", async () => {
        const state = (await begin()).searchParams.get("state")!;
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        setAcrAuthDependenciesForTest({
            now: () => now,
            principal: async () => principal,
            storage: () => storage,
            shared: () => shared,
            config: () => CONFIG,
            lock: (_name, task) => task(),
            fetch: stalled(`${ISSUER}/token`),
        });
        const outcome = completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER }));
        await untilExchangeInFlight();
        expect(tokenCalls()).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(ACR_OAUTH_REQUEST_TIMEOUT_MS - 1);
        let settled = false;
        void outcome.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await outcome).toMatchObject({ kind: "failed", reason: "token_unavailable" });
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
    });

    it("waits for the exchange however slow the claim's hash is (CHAOS-12349)", async () => {
        // CI's runner took longer than 200 event-loop turns for the digest: make it slower still.
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
            for (let turn = 0; turn < 400; turn += 1) {
                await new Promise((resolve) => setImmediate(resolve));
            }
            return digest(...(args as Parameters<typeof digest>));
        });
        const state = (await begin()).searchParams.get("state")!;
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        setAcrAuthDependenciesForTest({
            now: () => now,
            principal: async () => principal,
            storage: () => storage,
            shared: () => shared,
            config: () => CONFIG,
            lock: (_name, task) => task(),
            fetch: stalled(`${ISSUER}/token`),
        });
        const outcome = completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER }));
        await untilExchangeInFlight();
        expect(tokenCalls()).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(ACR_OAUTH_REQUEST_TIMEOUT_MS - 1);
        let settled = false;
        void outcome.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await outcome).toMatchObject({ kind: "failed", reason: "token_unavailable" });
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
    });
});

describe("getAcrAccessToken", () => {
    async function authorized() {
        const state = (await begin()).searchParams.get("state")!;
        await completeAcrAuthorization(callback({ code: "c-1", state, iss: ISSUER }));
    }

    it("asks for authorization before any flow, and is off without a client", async () => {
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        configure(storage, null);
        expect(await getAcrAccessToken()).toEqual({ kind: "off" });
    });

    it.each([
        ["c2's shape", "c2"],
        ["every v2 field", "v2-fields"],
    ])("ignores a v:1 family entry with %s (CHAOS-12305)", async (_, shape) => {
        const { familyId: _id, userId: _user, orgId: _org, ...c2 } = STORED_FAMILY;
        const entry = shape === "c2" ? { ...c2, v: 1 } : { ...STORED_FAMILY, v: 1 };
        storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify(entry));
        expect(readAcrHeldFamily()).toBeNull();
        expect(acrBrowserSignOut.heldFamily()).toBeNull();
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        expect(tokenCalls()).toEqual([]);
    });

    it("drops a held token of another principal when no family is held (CHAOS-12305)", async () => {
        tokenResponse = () =>
            json(200, { access_token: ACCESS, token_type: "Bearer", expires_in: 600 });
        await authorized();
        expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
        principal = { userId: "user-2", orgId: "org-1" };
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        principal = USER;
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
    });

    it("never serves a token to another configured client", async () => {
        await authorized();
        configure(storage, acrBrowserClientConfig("https://acr2.fullchaos.dev", WEB));
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
    });

    it("while impersonating, drops the family and the held token and sends no request (CHAOS-12306)", async () => {
        await authorized();
        expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
        expect(readAcrHeldFamily()).not.toBeNull();
        const sent = calls.length;
        // A refresh is due: impersonating still sends nothing.
        now += 480_000;
        principal = IMPERSONATING;
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        expect(calls).toHaveLength(sent);
        expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        // Both are gone: after the impersonation ends nothing is served and nothing is sent.
        principal = USER;
        now -= 480_000;
        expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        expect(calls).toHaveLength(sent);
    });
});

/**
 * CHAOS-12305 (c4): refresh across tabs, the principal binding, clone detection and the sign-out
 * hook. ACR is the c2 mock (`tests/mocks/acr-oauth.ts`), which keeps acr-api's refresh rules:
 * rotation, the 30 s grace for the same consumed token while its successor is unused, and
 * `invalid_grant` (family revoked) on any other reuse.
 */
describe("the token store across tabs (CHAOS-12305)", () => {
    type Tab = typeof defaultTab;
    type SignOutModule = typeof import("../acr-sign-out");
    type Fate = {
        /** What reaches the browser: ACR's own answer (default), a lost response, or another one. */
        readonly deliver?:
            "network" | "stall" | number | ((body: Record<string, unknown>) => unknown);
        /** Clock time the request takes after ACR answered. */
        readonly elapse?: number;
        /** Runs while the request is in flight, after ACR answered. */
        readonly during?: () => Promise<void>;
    };

    let acr: AcrOAuthMock;
    /** Every token request ACR answered: the form sent and ACR's answer (lost or not). */
    let tokenLog: { form: Record<string, string>; answer: Record<string, unknown> }[];
    /** What happens to each next token request, in order. */
    let fates: Fate[];
    let inFlight: number;
    let maxInFlight: number;
    let locks: ReturnType<typeof serialLock>;

    /** A Web Locks fake that really serializes: one promise chain per lock name. */
    function serialLock() {
        const tails = new Map<string, Promise<unknown>>();
        const names: string[] = [];
        function lock<T>(name: string, task: () => Promise<T>): Promise<T> {
            names.push(name);
            const run = (tails.get(name) ?? Promise.resolve()).then(task);
            tails.set(
                name,
                run.catch(() => undefined),
            );
            return run;
        }
        return { lock, names };
    }

    /** An in-memory BroadcastChannel: a post reaches every other tab's handlers, later. */
    function channelHub() {
        const tabs: ((message: unknown) => void)[][] = [];
        const posted: AcrTabMessage[] = [];
        return {
            posted,
            join(): AcrTabChannel {
                const handlers: ((message: unknown) => void)[] = [];
                tabs.push(handlers);
                return {
                    post: (message) => {
                        posted.push(message);
                        for (const other of tabs) {
                            if (other === handlers) continue;
                            for (const handler of [...other]) {
                                queueMicrotask(() => handler(structuredClone(message)));
                            }
                        }
                    },
                    onMessage: (handler) => {
                        handlers.push(handler);
                    },
                };
            },
        };
    }

    async function acrFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = String(input);
        calls.push({ url, init });
        const isToken = url === `${ISSUER}/token`;
        const fate: Fate = isToken ? (fates.shift() ?? {}) : {};
        if (isToken) {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
        }
        try {
            // Real turns, so two requests would overlap if nothing serialized them.
            await turns(5);
            const body = init?.body === undefined || init.body === null ? null : String(init.body);
            const answer = acr.handle({ method: init?.method ?? "GET", url, body });
            if (isToken) {
                const entry = {
                    form: Object.fromEntries(new URLSearchParams(body ?? "")),
                    answer: JSON.parse(answer.body) as Record<string, unknown>,
                };
                tokenLog.push(entry);
                harvestSecrets(entry.form, entry.answer);
            }
            now += fate.elapse ?? 0;
            await fate.during?.();
            const { deliver } = fate;
            if (deliver === "network") throw new TypeError("Failed to fetch");
            if (deliver === "stall") {
                return await new Promise<Response>((_, reject) => {
                    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
                });
            }
            if (typeof deliver === "number") return json(deliver, { error: "server_error" });
            if (typeof deliver === "function") {
                return json(answer.status, deliver(JSON.parse(answer.body)));
            }
            return new Response(answer.body === "" ? null : answer.body, {
                status: answer.status,
                headers: answer.headers,
            });
        } finally {
            if (isToken) inFlight -= 1;
        }
    }

    function depsFor(tab: MemoryStorage, channel: AcrTabChannel | null | "browser" = null) {
        return {
            now: () => now,
            storage: () => tab,
            shared: () => shared,
            navigate: (url: string) => {
                navigated.push(url);
                harvestAuthorizeUrl(url);
            },
            config: () => CONFIG,
            principal: async () => principal,
            lock: locks.lock,
            fetch: acrFetch as typeof fetch,
            ...(channel === "browser" ? {} : { channel: () => channel }),
        };
    }

    /** A new page load over `tab`'s sessionStorage: a fresh module, so no token in memory. */
    async function openTab(
        tab: MemoryStorage,
        channel: AcrTabChannel | null | "browser" = null,
    ): Promise<{ auth: Tab; signOut: SignOutModule }> {
        vi.resetModules();
        const auth = await import("../acr-auth");
        const signOut = await import("../acr-sign-out");
        auth.setAcrAuthDependenciesForTest(depsFor(tab, channel));
        return { auth, signOut };
    }

    /** The whole flow at ACR: begin, ACR's no-click consent, the callback. */
    async function signIn(auth: Tab = defaultTab) {
        expect(await auth.beginAcrAuthorization("/dev")).toEqual({ kind: "redirected" });
        const redirect = acr.handle({ method: "GET", url: navigated.at(-1)! });
        expect(await auth.completeAcrAuthorization(redirect.headers.Location!)).toMatchObject({
            kind: "authorized",
        });
    }

    function refreshLog() {
        return tokenLog.filter((entry) => entry.form.grant_type === "refresh_token");
    }

    function storedFamily(tab: MemoryStorage = storage) {
        const raw = tab.getItem(ACR_TOKEN_FAMILY_KEY);
        return raw === null ? null : (JSON.parse(raw) as typeof STORED_FAMILY);
    }

    /** 80 % of the 600 s life the mock gives: from here the token is refreshed. */
    const REFRESH_AT_MS = 480_000;

    beforeEach(() => {
        acr = new AcrOAuthMock({
            issuer: ISSUER,
            redirectUri: CONFIG.redirectUri,
            clientId: CONFIG.clientId,
            now: () => now,
        });
        tokenLog = [];
        fates = [];
        inFlight = 0;
        maxInFlight = 0;
        locks = serialLock();
        setAcrAuthDependenciesForTest(depsFor(storage));
    });

    describe("the principal binding", () => {
        it("binds the family and the token to the web user and org", async () => {
            await signIn();
            expect(storedFamily()).toMatchObject({ v: 2, userId: "user-1", orgId: "org-1" });
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
        });

        it.each([
            ["a user switch", { userId: "user-2", orgId: "org-1" }],
            ["an org switch", { userId: "user-1", orgId: "org-2" }],
            ["an org that is gone", { userId: "user-1", orgId: null }],
            ["no session", null],
        ])("drops the family and the token on %s", async (_, next) => {
            await signIn();
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
            principal = next;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            // Both are gone: back as the first user, nothing is served and nothing is sent.
            principal = USER;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(refreshLog()).toEqual([]);
        });

        it("drops a stored family of another principal after a reload, and sends nothing", async () => {
            storage.setItem(
                ACR_TOKEN_FAMILY_KEY,
                JSON.stringify({ ...STORED_FAMILY, userId: "user-2" }),
            );
            const { auth } = await openTab(storage);
            expect(await auth.getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            expect(tokenLog).toEqual([]);
        });

        it("drops both when the stored family names another principal, even with a fresh token", async () => {
            await signIn();
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
            storage.setItem(
                ACR_TOKEN_FAMILY_KEY,
                JSON.stringify({ ...storedFamily(), userId: "user-2" }),
            );
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(refreshLog()).toEqual([]);
        });

        it("re-checks the principal of the family it re-reads inside the lock", async () => {
            await signIn();
            now += REFRESH_AT_MS;
            // Another document wrote the entry for another user while this call waited.
            setAcrAuthDependenciesForTest({
                ...depsFor(storage),
                lock: (name, task) => {
                    storage.setItem(
                        ACR_TOKEN_FAMILY_KEY,
                        JSON.stringify({ ...storedFamily(), userId: "user-2" }),
                    );
                    return locks.lock(name, task);
                },
            });
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(refreshLog()).toEqual([]);
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        });

        it("reads the principal from the NextAuth session, with no broadcast to other tabs", async () => {
            const { principal: _fake, ...browserPrincipal } = depsFor(storage);
            setAcrAuthDependenciesForTest(browserPrincipal);
            getSession.mockResolvedValue({ user: { id: "user-1", org_id: "org-1" }, expires: "" });
            await signIn();
            expect(getSession).toHaveBeenCalledWith({ broadcast: false });
            expect(storedFamily()).toMatchObject({ userId: "user-1", orgId: "org-1" });
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });

            getSession.mockResolvedValue({ user: { id: "user-1" }, expires: "" });
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();

            getSession.mockResolvedValue({ user: { id: "user-1", org_id: "org-1" }, expires: "" });
            await signIn();
            getSession.mockRejectedValue(new TypeError("Failed to fetch"));
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();

            getSession.mockResolvedValue(null);
            const state = (await begin()).searchParams.get("state")!;
            setAcrAuthDependenciesForTest(browserPrincipal);
            expect(
                await completeAcrAuthorization(callback({ code: "c-9", state, iss: ISSUER })),
            ).toMatchObject({ kind: "failed", reason: "signed_out" });
        });

        it("reads is_impersonating from the NextAuth session: user.id stays the admin's (CHAOS-12306)", async () => {
            const { principal: _fake, ...browserPrincipal } = depsFor(storage);
            setAcrAuthDependenciesForTest(browserPrincipal);
            const admin = { id: "user-1", org_id: "org-1" };
            const impersonating = {
                user: { ...admin, is_impersonating: true, impersonated_user_id: "user-9" },
                expires: "",
            };
            getSession.mockResolvedValue({ user: admin, expires: "" });
            await signIn();
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });

            // Same user id, same org: c4's binding alone would serve the token.
            getSession.mockResolvedValue(impersonating);
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            const sent = calls.length;
            expect(await defaultTab.beginAcrAuthorization("/dev")).toEqual({
                kind: "impersonating",
            });
            expect(calls).toHaveLength(sent);
            expect(getSession).toHaveBeenLastCalledWith({ broadcast: false });

            getSession.mockResolvedValue({ user: admin, expires: "" });
            const state = (await begin()).searchParams.get("state")!;
            setAcrAuthDependenciesForTest(browserPrincipal);
            getSession.mockResolvedValue(impersonating);
            const tokenRequests = tokenCalls().length;
            expect(
                await completeAcrAuthorization(callback({ code: "c-9", state, iss: ISSUER })),
            ).toMatchObject({ kind: "failed", reason: "impersonating" });
            expect(tokenCalls()).toHaveLength(tokenRequests);
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        });
    });

    describe("refresh", () => {
        it("serves the token before 80 % of its life, and refreshes it from there", async () => {
            await signIn();
            const r0 = storedFamily()!.refreshToken;
            const first = await getAcrAccessToken();
            expect(first).toMatchObject({ kind: "token" });
            now += REFRESH_AT_MS - 1;
            expect(await getAcrAccessToken()).toEqual(first);
            expect(refreshLog()).toEqual([]);

            now += 1;
            const second = await getAcrAccessToken();
            const [refresh] = refreshLog();
            expect(refresh!.form).toEqual({
                grant_type: "refresh_token",
                refresh_token: r0,
                client_id: CONFIG.clientId,
            });
            expect(second).toEqual({
                kind: "token",
                token: refresh!.answer.access_token,
                issuer: ISSUER,
            });
            expect(second).not.toEqual(first);
            // Rotation: the family now holds the new refresh token, under the same family id.
            expect(storedFamily()).toMatchObject({
                refreshToken: refresh!.answer.refresh_token,
                familyId: readAcrHeldFamily()!.familyId,
            });
            expect(storedFamily()!.refreshToken).not.toBe(r0);
            // A form POST with no credential and only safelisted headers (no preflight).
            const init = calls.filter((call) => call.url === `${ISSUER}/token`).at(-1)!.init!;
            expect(init).toMatchObject({ method: "POST", credentials: "omit", cache: "no-store" });
            expect(Object.keys(init.headers as Record<string, string>)).toEqual(["Content-Type"]);
            expect(init.signal).toBeInstanceOf(AbortSignal);
            // The new token's own 80 % counts from when it was issued.
            now += REFRESH_AT_MS - 1;
            expect(await getAcrAccessToken()).toEqual(second);
            expect(refreshLog()).toHaveLength(1);
        });

        it("never serves a short-lived token within 30 s of its expiry", async () => {
            fates = [{ deliver: (body) => ({ ...body, expires_in: 100 }) }];
            await signIn();
            now += 70_000 - 1;
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
            expect(refreshLog()).toEqual([]);
            now += 1;
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
            expect(refreshLog()).toHaveLength(1);
        });

        it("refreshes on the first call after a reload (the family stays, the token does not)", async () => {
            await signIn();
            const { auth } = await openTab(storage);
            expect(await auth.getAcrAccessToken()).toEqual({
                kind: "token",
                token: expect.stringMatching(/^fcacr_/u),
                issuer: ISSUER,
            });
            expect(refreshLog()).toHaveLength(1);
        });

        it("makes one refresh for two concurrent calls in one tab", async () => {
            await signIn();
            now += REFRESH_AT_MS;
            const [one, two] = await Promise.all([getAcrAccessToken(), getAcrAccessToken()]);
            expect(one).toMatchObject({ kind: "token" });
            expect(two).toEqual(one);
            expect(refreshLog()).toHaveLength(1);
            const familyId = storedFamily()!.familyId;
            expect(locks.names.filter((name) => name.startsWith("ask-dev:acr-refresh:"))).toEqual([
                `ask-dev:acr-refresh:${familyId}`,
                `ask-dev:acr-refresh:${familyId}`,
            ]);
        });

        it("serializes two documents on one family entry, and the second re-reads it inside the lock", async () => {
            await signIn();
            const r0 = storedFamily()!.refreshToken;
            const one = await openTab(storage);
            const two = await openTab(storage);
            const [a, b] = await Promise.all([
                one.auth.getAcrAccessToken(),
                two.auth.getAcrAccessToken(),
            ]);
            expect(maxInFlight).toBe(1);
            const [first, second] = refreshLog();
            expect(first!.form.refresh_token).toBe(r0);
            // The first's result: the rotated token, not the consumed one read before the lock.
            expect(second!.form.refresh_token).toBe(first!.answer.refresh_token);
            expect(a).toMatchObject({ kind: "token", token: first!.answer.access_token });
            expect(b).toMatchObject({ kind: "token", token: second!.answer.access_token });
            expect(storedFamily()!.refreshToken).toBe(second!.answer.refresh_token);
        });

        it("serializes a cloned tab that no check caught (the known limit): ACR's grace gives both the same successor", async () => {
            await signIn();
            const clone = duplicate(storage);
            const original = await openTab(storage);
            const copy = await openTab(clone);
            const [a, b] = await Promise.all([
                original.auth.getAcrAccessToken(),
                copy.auth.getAcrAccessToken(),
            ]);
            expect(maxInFlight).toBe(1);
            const [first, second] = refreshLog();
            expect(second!.form.refresh_token).toBe(first!.form.refresh_token);
            expect(second!.answer).toMatchObject({
                access_token: first!.answer.access_token,
                refresh_token: first!.answer.refresh_token,
            });
            expect(a).toEqual(b);
        });

        it.each([
            ["ACR's invalid_grant (the family was revoked)", "revoked"],
            ["a 401", 401],
            ["a 200 with no new refresh token", "no-refresh"],
            ["a 200 with an access token of another shape", "bad-access"],
        ] as const)("clears the family and the token on %s, and re-authorizes", async (_, kind) => {
            await signIn();
            const r0 = storedFamily()!.refreshToken;
            if (kind === "revoked") {
                acr.handle({
                    method: "POST",
                    url: `${ISSUER}/revoke`,
                    body: new URLSearchParams({ token: r0, client_id: CONFIG.clientId }).toString(),
                });
            } else if (kind === 401) {
                fates = [{ deliver: 401 }];
            } else if (kind === "no-refresh") {
                fates = [{ deliver: ({ refresh_token: _rt, ...body }) => body }];
            } else {
                fates = [{ deliver: (body) => ({ ...body, access_token: "eyJ.x.y" }) }];
            }
            now += REFRESH_AT_MS;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(refreshLog()).toHaveLength(1);

            await signIn();
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
        });

        it.each([
            ["a network error", "network"],
            ["a 503", 503],
        ] as const)(
            "retries a lost response (%s) once inside 25 s, with the same token, and takes ACR's successor",
            async (_, lost) => {
                await signIn();
                const r0 = storedFamily()!.refreshToken;
                now += REFRESH_AT_MS;
                fates = [{ deliver: lost, elapse: 24_999 }];
                const token = await getAcrAccessToken();
                const [lostOne, retry] = refreshLog();
                expect(refreshLog().map((entry) => entry.form.refresh_token)).toEqual([r0, r0]);
                // ACR rotated on the lost one; its grace gave the same successor to the retry.
                expect(retry!.answer).toMatchObject({
                    access_token: lostOne!.answer.access_token,
                    refresh_token: lostOne!.answer.refresh_token,
                });
                expect(token).toEqual({
                    kind: "token",
                    token: lostOne!.answer.access_token,
                    issuer: ISSUER,
                });
                expect(storedFamily()!.refreshToken).toBe(lostOne!.answer.refresh_token);
            },
        );

        it("counts a refresh ACR never answers as lost: the 15 s deadline ends it, then one retry", async () => {
            await signIn();
            const r0 = storedFamily()!.refreshToken;
            now += REFRESH_AT_MS;
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            fates = [{ deliver: "stall" }];
            const outcome = getAcrAccessToken();
            const until = Date.now() + 5_000;
            while (refreshLog().length === 0 && Date.now() < until) await turns(1);
            await turns(5);
            await vi.advanceTimersByTimeAsync(ACR_OAUTH_REQUEST_TIMEOUT_MS - 1);
            expect(refreshLog()).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(await outcome).toMatchObject({ kind: "token" });
            expect(refreshLog().map((entry) => entry.form.refresh_token)).toEqual([r0, r0]);
        });

        it.each([
            [
                "a lost response 25 s after the attempt started",
                [{ deliver: "network", elapse: 25_000 }],
            ],
            ["a failed retry", [{ deliver: "network" }, { deliver: 503 }]],
        ] as const)(
            "clears on %s, and never presents that refresh token again",
            async (_, plan) => {
                await signIn();
                now += REFRESH_AT_MS;
                fates = [...plan];
                expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
                expect(refreshLog()).toHaveLength(plan.length);
                expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
                expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
                expect(refreshLog()).toHaveLength(plan.length);
            },
        );
    });

    describe("reportAcrTokenRejected", () => {
        it("drops only the token it names, and keeps the family for a refresh", async () => {
            await signIn();
            const first = await getAcrAccessToken();
            if (first.kind !== "token") throw new Error("no token");
            reportAcrTokenRejected(`fcacr_${"Z".repeat(43)}`);
            expect(await getAcrAccessToken()).toEqual(first);
            expect(refreshLog()).toEqual([]);

            reportAcrTokenRejected(first.token);
            const second = await getAcrAccessToken();
            expect(refreshLog()).toHaveLength(1);
            expect(second).toMatchObject({ kind: "token" });
            expect(second).not.toEqual(first);
            // A late report for the old token does not drop the newer one.
            reportAcrTokenRejected(first.token);
            expect(await getAcrAccessToken()).toEqual(second);
            expect(refreshLog()).toHaveLength(1);
        });
    });

    describe("cloned tab detection", () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        });

        /** Lets a call's clone check end (its wait for `taken`), then gives its outcome. */
        async function settled<T>(call: Promise<T>): Promise<T> {
            await vi.advanceTimersByTimeAsync(ACR_CLONE_CHECK_MS);
            return call;
        }

        it("a clone gets taken, takes a new tab id and drops its copy; the original keeps its family", async () => {
            const hub = channelHub();
            const original = await openTab(storage, hub.join());
            await signIn(original.auth);
            const originalId = storage.getItem(ACR_TAB_KEY)!;
            const family = storage.getItem(ACR_TOKEN_FAMILY_KEY);

            const clone = duplicate(storage);
            const copy = await openTab(clone, hub.join());
            // No timer advance: the answer, not the wait, ends the clone's check.
            expect(await copy.auth.getAcrAccessToken()).toEqual({
                kind: "authorization_required",
            });
            expect(hub.posted).toEqual([
                { type: "hello", tabId: originalId },
                { type: "taken", tabId: originalId },
            ]);
            expect(clone.getItem(ACR_TAB_KEY)).toMatch(TAB_ID);
            expect(clone.getItem(ACR_TAB_KEY)).not.toBe(originalId);
            expect(clone.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBe(family);
            expect(refreshLog()).toEqual([]);

            // Once per page load: the clone does not ask again.
            expect(await settled(copy.auth.getAcrAccessToken())).toEqual({
                kind: "authorization_required",
            });
            expect(hub.posted).toHaveLength(2);

            // The original asks with its own id; nobody holds it now, so after the wait it serves.
            expect(await settled(original.auth.getAcrAccessToken())).toMatchObject({
                kind: "token",
            });
            expect(hub.posted).toHaveLength(3);
            expect(storage.getItem(ACR_TAB_KEY)).toBe(originalId);
        });

        it("waits the whole check when nobody answers, then serves", async () => {
            const hub = channelHub();
            const tab = await openTab(storage, hub.join());
            await signIn(tab.auth);
            let done = false;
            const call = tab.auth.getAcrAccessToken().finally(() => (done = true));
            await vi.advanceTimersByTimeAsync(ACR_CLONE_CHECK_MS - 1);
            expect(done).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            expect(await call).toMatchObject({ kind: "token" });
        });

        it("skips the check without BroadcastChannel: no wait, and the tab keeps its id and family", async () => {
            vi.stubGlobal("window", {});
            vi.stubGlobal("BroadcastChannel", undefined);
            const tab = await openTab(storage, "browser");
            await signIn(tab.auth);
            const id = storage.getItem(ACR_TAB_KEY);
            // No timer advance at all: a check would wait on the faked 200 ms timer.
            expect(await tab.auth.getAcrAccessToken()).toMatchObject({ kind: "token" });
            expect(storage.getItem(ACR_TAB_KEY)).toBe(id);
            expect(storedFamily()).not.toBeNull();
        });

        it("drops a refresh answer that lands after this tab was cleared", async () => {
            const hub = channelHub();
            const tab = await openTab(storage, hub.join());
            await signIn(tab.auth);
            const other = await openTab(new MemoryStorage(), hub.join());
            now += REFRESH_AT_MS;
            fates = [
                {
                    during: async () => {
                        await other.signOut.acrBrowserSignOut.clearAllTabs();
                        await turns(2);
                    },
                },
            ];
            expect(await settled(tab.auth.getAcrAccessToken())).toEqual({
                kind: "authorization_required",
            });
            expect(refreshLog()).toHaveLength(1);
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            expect(await tab.auth.getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(refreshLog()).toHaveLength(1);
        });
    });

    describe("the sign-out hook", () => {
        it("maps the held family for RFC 7009 revocation, sync and whatever the session", async () => {
            expect(acrBrowserSignOut.heldFamily()).toBeNull();
            await signIn();
            principal = null;
            const family = acrBrowserSignOut.heldFamily();
            expect(family).toEqual({
                clientId: CONFIG.clientId,
                refreshToken: storedFamily()!.refreshToken,
                revocationEndpoint: `${ISSUER}/revoke`,
            });
            expect(family).not.toBeInstanceOf(Promise);
        });

        it("returns no family when ACR advertised no revocation endpoint", async () => {
            storage.setItem(
                ACR_TOKEN_FAMILY_KEY,
                JSON.stringify({ ...STORED_FAMILY, revocationEndpoint: null }),
            );
            expect(readAcrHeldFamily()).toMatchObject({ revocationEndpoint: null });
            expect(acrBrowserSignOut.heldFamily()).toBeNull();
        });

        it("clearAllTabs clears this tab and tells the other tabs, which clear theirs", async () => {
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            const hub = channelHub();
            const here = await openTab(storage, hub.join());
            await signIn(here.auth);
            const elsewhere = new MemoryStorage();
            const there = await openTab(elsewhere, hub.join());
            await signIn(there.auth);
            storage.setItem(ACR_PENDING_AUTHORIZATION_KEY, "{}");
            expect(storedFamily(elsewhere)).not.toBeNull();

            await here.signOut.acrBrowserSignOut.clearAllTabs();
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            expect(storage.getItem(ACR_PENDING_AUTHORIZATION_KEY)).toBeNull();
            expect(hub.posted).toContainEqual({ type: "clear" });
            await turns(2);
            expect(elsewhere.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();

            // Neither tab holds a token in memory any more, and neither sends anything.
            for (const tab of [here, there]) {
                const call = tab.auth.getAcrAccessToken();
                await vi.advanceTimersByTimeAsync(ACR_CLONE_CHECK_MS);
                expect(await call).toEqual({ kind: "authorization_required" });
            }
            expect(refreshLog()).toEqual([]);
        });
    });

    describe("codex r1 on #1676", () => {
        const EVIL = "https://evil.example";

        it("without Web Locks, one tab's concurrent calls still make one refresh", async () => {
            await signIn();
            now += REFRESH_AT_MS;
            vi.stubGlobal("navigator", {});
            const { lock: _serial, ...browserLock } = depsFor(storage);
            setAcrAuthDependenciesForTest(browserLock);
            const [first, second] = await Promise.all([getAcrAccessToken(), getAcrAccessToken()]);
            expect(refreshLog()).toHaveLength(1);
            expect(maxInFlight).toBe(1);
            expect(first).toMatchObject({ kind: "token" });
            expect(second).toEqual(first);
        });

        it.each([
            ["another user and org", { userId: "user-2", orgId: "org-2" }],
            ["no session (signed out)", null],
        ])(
            "re-checks the principal after the refresh: %s meanwhile gets no token",
            async (_, next) => {
                await signIn();
                now += REFRESH_AT_MS;
                fates.push({
                    during: async () => {
                        principal = next;
                    },
                });
                expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
                expect(refreshLog()).toHaveLength(1);
                expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
                // The refreshed token is not held for later either.
                principal = USER;
                expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
                expect(refreshLog()).toHaveLength(1);
            },
        );

        it.each([
            ["a token endpoint on another origin", { tokenEndpoint: `${EVIL}/collect` }],
            ["a revocation endpoint on another origin", { revocationEndpoint: `${EVIL}/collect` }],
            ["another issuer", { issuer: EVIL }],
            [
                "another issuer with its own endpoints",
                {
                    issuer: EVIL,
                    tokenEndpoint: `${EVIL}/token`,
                    revocationEndpoint: `${EVIL}/revoke`,
                },
            ],
            ["another client", { clientId: `${WEB}/other-client.json` }],
        ])("never uses, refreshes or revokes a stored family with %s", async (_, change) => {
            storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify({ ...STORED_FAMILY, ...change }));
            expect(readAcrHeldFamily()).toBeNull();
            expect(acrBrowserSignOut.heldFamily()).toBeNull();
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(calls.filter((call) => !call.url.startsWith(`${ISSUER}/`))).toEqual([]);
            expect(refreshLog()).toEqual([]);
        });

        it("holds no family while the client is off: sign-out then revokes nothing", () => {
            storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify(STORED_FAMILY));
            setAcrAuthDependenciesForTest({ ...depsFor(storage), config: () => undefined });
            expect(readAcrHeldFamily()).toBeNull();
            expect(acrBrowserSignOut.heldFamily()).toBeNull();
        });

        it("without BroadcastChannel, another tab's family is unusable after sign-out: the web session is gone", async () => {
            const here = await openTab(storage, null);
            await signIn(here.auth);
            const elsewhere = new MemoryStorage();
            const there = await openTab(elsewhere, null);
            await signIn(there.auth);
            expect(await there.auth.getAcrAccessToken()).toMatchObject({ kind: "token" });

            await here.signOut.acrBrowserSignOut.clearAllTabs();
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            // No channel: the other tab was not told. signOutEverywhere then ends the web session.
            expect(elsewhere.getItem(ACR_TOKEN_FAMILY_KEY)).not.toBeNull();
            principal = null;
            expect(await there.auth.getAcrAccessToken()).toEqual({
                kind: "authorization_required",
            });
            expect(elsewhere.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            expect(refreshLog()).toEqual([]);
        });
    });

    describe("codex r2 on #1676: a clear while a request is in flight wins", () => {
        function codeExchanges() {
            return tokenLog.filter((entry) => entry.form.grant_type === "authorization_code");
        }

        async function callback() {
            expect(await defaultTab.beginAcrAuthorization("/dev")).toEqual({ kind: "redirected" });
            const redirect = acr.handle({ method: "GET", url: navigated.at(-1)! });
            return defaultTab.completeAcrAuthorization(redirect.headers.Location!);
        }

        it("a clear while the principal is read (an observed impersonation start or org switch): the held token is not served (codex r3 on #1680)", async () => {
            await signIn();
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
            setAcrAuthDependenciesForTest({
                ...depsFor(storage),
                principal: async () => {
                    // The tab observes the change while this read is in flight: c5 clears.
                    defaultTab.clearAcrTokensInAllTabs();
                    return principal;
                },
            });
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(refreshLog()).toEqual([]);
        });

        it("a sign-out during the principal check after a refresh: no token, nothing held", async () => {
            await signIn();
            now += REFRESH_AT_MS;
            let reads = 0;
            setAcrAuthDependenciesForTest({
                ...depsFor(storage),
                principal: async () => {
                    reads += 1;
                    // The second read is the check after the refresh: sign-out clears meanwhile.
                    if (reads === 2) defaultTab.clearAcrTokensInAllTabs();
                    return principal;
                },
            });
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(reads).toBe(2);
            expect(refreshLog()).toHaveLength(1);
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(refreshLog()).toHaveLength(1);
        });

        it("a sign-out while the code exchange is in flight: nothing is stored or held", async () => {
            fates.push({ during: async () => defaultTab.clearAcrTokensInAllTabs() });
            expect(await callback()).toMatchObject({ kind: "failed", reason: "signed_out" });
            expect(codeExchanges()).toHaveLength(1);
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(refreshLog()).toEqual([]);
        });

        it("an impersonation started while the code exchange ran: nothing is stored or held (CHAOS-12306)", async () => {
            // A family this tab held from before goes too (codex r1 on #1680).
            storage.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify(STORED_FAMILY));
            fates.push({
                during: async () => {
                    principal = IMPERSONATING;
                },
            });
            expect(await callback()).toEqual({
                kind: "failed",
                reason: "impersonating",
                returnTo: "/dev",
            });
            expect(codeExchanges()).toHaveLength(1);
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            principal = USER;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(refreshLog()).toEqual([]);
        });

        it.each([
            ["another user", { userId: "user-2", orgId: "org-1" }],
            ["another org", { userId: "user-1", orgId: "org-2" }],
            ["no session", null],
        ])("%s by the end of the code exchange: nothing is stored or held", async (_, next) => {
            fates.push({
                during: async () => {
                    principal = next;
                },
            });
            expect(await callback()).toMatchObject({ kind: "failed", reason: "signed_out" });
            expect(codeExchanges()).toHaveLength(1);
            expect(storage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
            principal = USER;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
        });
    });

    /**
     * CHAOS-12369: the failure and refusal paths log at Info or Warn, once per event, with no secret
     * value. Fields are family id, enums, booleans and an HTTP status only.
     */
    describe("logs (CHAOS-12369)", () => {
        const SENT = "ask-dev acr token store refresh sent";
        const ANSWERED = "ask-dev acr token store refresh answered";
        const CLEARED = "ask-dev acr token store family cleared";
        const PRINCIPAL = "ask-dev acr token store principal dropped";
        const RACE = "ask-dev acr token store clear overtook";
        const CLONE = "ask-dev acr token store clone dropped";
        const RECEIVED = "ask-dev acr token store clear received";

        /** What the store logged since `mark`: [level, message, fields], in order. */
        function since(mark: number) {
            return sink
                .slice(mark)
                .filter(({ args }) => String(args[1]).startsWith("ask-dev acr token store"))
                .map(({ level, args }) => [level, args[1], args[0]] as const);
        }

        it("a refresh that works: sent and answered ok, both Info", async () => {
            await signIn();
            const id = storedFamily()!.familyId;
            now += REFRESH_AT_MS;
            const mark = sink.length;
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
            expect(since(mark)).toEqual([
                ["info", SENT, { family_id: id, attempt: 1 }],
                ["info", ANSWERED, { family_id: id, outcome: "ok", status: 200 }],
            ]);
        });

        it("serving the held token logs nothing", async () => {
            await signIn();
            const mark = sink.length;
            for (let i = 0; i < 3; i += 1) {
                expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
            }
            expect(sink.slice(mark)).toEqual([]);
        });

        it("a refused refresh: answered refused with its status, and the family cleared", async () => {
            await signIn();
            const id = storedFamily()!.familyId;
            now += REFRESH_AT_MS;
            fates = [{ deliver: 401 }];
            const mark = sink.length;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(since(mark)).toEqual([
                ["info", SENT, { family_id: id, attempt: 1 }],
                ["warn", ANSWERED, { family_id: id, outcome: "refused", status: 401 }],
                ["warn", CLEARED, { family_id: id, reason: "refused" }],
            ]);
        });

        it("a lost response 25 s after the attempt: lost, no retry, cleared past_grace", async () => {
            await signIn();
            const id = storedFamily()!.familyId;
            now += REFRESH_AT_MS;
            fates = [{ deliver: "network", elapse: 25_000 }];
            const mark = sink.length;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(since(mark)).toEqual([
                ["info", SENT, { family_id: id, attempt: 1 }],
                ["warn", ANSWERED, { family_id: id, outcome: "lost" }],
                ["warn", CLEARED, { family_id: id, reason: "past_grace" }],
            ]);
        });

        it.each([429, 403, 404])(
            "a received %d is not lost: answered unexpected_status, retried as before (codex r1 on #1681)",
            async (status) => {
                await signIn();
                const id = storedFamily()!.familyId;
                now += REFRESH_AT_MS;
                fates = [{ deliver: status }];
                const mark = sink.length;
                expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
                expect(since(mark).slice(0, 3)).toEqual([
                    ["info", SENT, { family_id: id, attempt: 1 }],
                    ["warn", ANSWERED, { family_id: id, outcome: "unexpected_status", status }],
                    ["info", SENT, { family_id: id, attempt: 2 }],
                ]);
            },
        );

        it("a 5xx is lost, with its status", async () => {
            await signIn();
            const id = storedFamily()!.familyId;
            now += REFRESH_AT_MS;
            fates = [{ deliver: 503 }];
            const mark = sink.length;
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
            expect(since(mark)[1]).toEqual([
                "warn",
                ANSWERED,
                { family_id: id, outcome: "lost", status: 503 },
            ]);
        });

        it("a lost response, then a failed retry: attempt 2 is logged, cleared retry_failed", async () => {
            await signIn();
            const id = storedFamily()!.familyId;
            now += REFRESH_AT_MS;
            fates = [{ deliver: "network" }, { deliver: 503 }];
            const mark = sink.length;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(since(mark)).toEqual([
                ["info", SENT, { family_id: id, attempt: 1 }],
                ["warn", ANSWERED, { family_id: id, outcome: "lost" }],
                ["info", SENT, { family_id: id, attempt: 2 }],
                ["warn", ANSWERED, { family_id: id, outcome: "lost", status: 503 }],
                ["warn", CLEARED, { family_id: id, reason: "retry_failed" }],
            ]);
        });

        it("a lost response, then a retry that works: two sends, no clear", async () => {
            await signIn();
            const id = storedFamily()!.familyId;
            now += REFRESH_AT_MS;
            fates = [{ deliver: "network" }];
            const mark = sink.length;
            expect(await getAcrAccessToken()).toMatchObject({ kind: "token" });
            expect(since(mark)).toEqual([
                ["info", SENT, { family_id: id, attempt: 1 }],
                ["warn", ANSWERED, { family_id: id, outcome: "lost" }],
                ["info", SENT, { family_id: id, attempt: 2 }],
                ["info", ANSWERED, { family_id: id, outcome: "ok", status: 200 }],
            ]);
        });

        it.each([
            [
                "a malformed token answer",
                (body: Record<string, unknown>) => ({ ...body, access_token: "x" }),
            ],
            [
                "an answer with no new refresh token",
                (body: Record<string, unknown>) => ({ ...body, refresh_token: undefined }),
            ],
        ])("%s: answered invalid, cleared invalid", async (_, deliver) => {
            await signIn();
            const id = storedFamily()!.familyId;
            now += REFRESH_AT_MS;
            fates = [{ deliver }];
            const mark = sink.length;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(since(mark)).toEqual([
                ["info", SENT, { family_id: id, attempt: 1 }],
                ["warn", ANSWERED, { family_id: id, outcome: "invalid", status: 200 }],
                ["warn", CLEARED, { family_id: id, reason: "invalid" }],
            ]);
        });

        it("a clear that lands while the refresh runs: answered overtaken, and the race logged", async () => {
            await signIn();
            const id = storedFamily()!.familyId;
            now += REFRESH_AT_MS;
            fates = [{ during: async () => defaultTab.clearAcrTokensInAllTabs() }];
            const mark = sink.length;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(since(mark)).toEqual([
                ["info", SENT, { family_id: id, attempt: 1 }],
                ["warn", ANSWERED, { family_id: id, outcome: "overtaken", status: 200 }],
                ["warn", RACE, { where: "refresh" }],
            ]);
        });

        it.each([
            ["a user switch", { userId: "user-2", orgId: "org-1" }, "mismatch"],
            ["an org switch", { userId: "user-1", orgId: "org-2" }, "mismatch"],
            ["no session", null, "no_session"],
            ["an impersonating session", IMPERSONATING, "impersonating"],
        ] as const)(
            "%s before the token is served: dropped, check before",
            async (_, next, reason) => {
                await signIn();
                principal = next;
                const mark = sink.length;
                expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
                expect(since(mark)).toEqual([["warn", PRINCIPAL, { check: "before", reason }]]);
            },
        );

        it("a stored family of another user: dropped as a mismatch, check before", async () => {
            storage.setItem(
                ACR_TOKEN_FAMILY_KEY,
                JSON.stringify({ ...STORED_FAMILY, userId: "user-2" }),
            );
            const { auth } = await openTab(storage);
            const mark = sink.length;
            expect(await auth.getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(since(mark)).toEqual([
                ["warn", PRINCIPAL, { check: "before", reason: "mismatch" }],
            ]);
        });

        it("the family changes owner while the call waits for the lock: check lock", async () => {
            await signIn();
            now += REFRESH_AT_MS;
            setAcrAuthDependenciesForTest({
                ...depsFor(storage),
                lock: (name, task) => {
                    storage.setItem(
                        ACR_TOKEN_FAMILY_KEY,
                        JSON.stringify({ ...storedFamily(), userId: "user-2" }),
                    );
                    return locks.lock(name, task);
                },
            });
            const mark = sink.length;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(since(mark)).toEqual([
                ["warn", PRINCIPAL, { check: "lock", reason: "mismatch" }],
            ]);
        });

        it.each([
            ["no session", null, "no_session"],
            ["another org", { userId: "user-1", orgId: "org-2" }, "mismatch"],
            ["an impersonating session", IMPERSONATING, "impersonating"],
        ] as const)(
            "%s after the refresh: dropped, check after_refresh",
            async (_, next, reason) => {
                await signIn();
                now += REFRESH_AT_MS;
                let reads = 0;
                setAcrAuthDependenciesForTest({
                    ...depsFor(storage),
                    principal: async () => {
                        reads += 1;
                        return reads === 2 ? next : principal;
                    },
                });
                const mark = sink.length;
                expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
                expect(reads).toBe(2);
                expect(since(mark).filter(([, message]) => message === PRINCIPAL)).toEqual([
                    ["warn", PRINCIPAL, { check: "after_refresh", reason }],
                ]);
            },
        );

        it("a clear while the principal is read after a refresh: the race, where after_refresh_check", async () => {
            await signIn();
            now += REFRESH_AT_MS;
            let reads = 0;
            setAcrAuthDependenciesForTest({
                ...depsFor(storage),
                principal: async () => {
                    reads += 1;
                    if (reads === 2) defaultTab.clearAcrTokensInAllTabs();
                    return principal;
                },
            });
            const mark = sink.length;
            expect(await getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(since(mark).filter(([, message]) => message === RACE)).toEqual([
                ["warn", RACE, { where: "after_refresh_check" }],
            ]);
        });

        it("begin while impersonating: dropped, check begin", async () => {
            principal = IMPERSONATING;
            const mark = sink.length;
            expect(await beginAcrAuthorization("/dev")).toEqual({ kind: "impersonating" });
            expect(since(mark)).toEqual([
                ["warn", PRINCIPAL, { check: "begin", reason: "impersonating" }],
            ]);
        });

        it.each([
            ["no session", null, "no_session"],
            ["an impersonating session", IMPERSONATING, "impersonating"],
        ] as const)("%s at the callback: check callback_before", async (_, next, reason) => {
            await signIn();
            expect(await defaultTab.beginAcrAuthorization("/dev")).toEqual({ kind: "redirected" });
            const redirect = acr.handle({ method: "GET", url: navigated.at(-1)! });
            principal = next;
            const mark = sink.length;
            expect(await completeAcrAuthorization(redirect.headers.Location!)).toMatchObject({
                kind: "failed",
            });
            expect(since(mark)).toEqual([
                ["warn", PRINCIPAL, { check: "callback_before", reason }],
            ]);
        });

        it.each([
            ["no session", null, "no_session"],
            ["another user", { userId: "user-2", orgId: "org-1" }, "mismatch"],
            ["an impersonating session", IMPERSONATING, "impersonating"],
        ] as const)(
            "%s by the end of the code exchange: check callback_after",
            async (_, next, reason) => {
                fates.push({
                    during: async () => {
                        principal = next;
                    },
                });
                expect(await defaultTab.beginAcrAuthorization("/dev")).toEqual({
                    kind: "redirected",
                });
                const redirect = acr.handle({ method: "GET", url: navigated.at(-1)! });
                const mark = sink.length;
                expect(await completeAcrAuthorization(redirect.headers.Location!)).toMatchObject({
                    kind: "failed",
                });
                expect(since(mark)).toEqual([
                    ["warn", PRINCIPAL, { check: "callback_after", reason }],
                ]);
            },
        );

        it("a clear while the code exchange runs: the race, where code_exchange", async () => {
            fates.push({ during: async () => defaultTab.clearAcrTokensInAllTabs() });
            expect(await defaultTab.beginAcrAuthorization("/dev")).toEqual({ kind: "redirected" });
            const redirect = acr.handle({ method: "GET", url: navigated.at(-1)! });
            const mark = sink.length;
            expect(await completeAcrAuthorization(redirect.headers.Location!)).toMatchObject({
                kind: "failed",
                reason: "signed_out",
            });
            expect(since(mark)).toEqual([["warn", RACE, { where: "code_exchange" }]]);
        });

        it.each([
            ["with a copied family", true],
            ["with no family to drop", false],
        ])("a cloned tab %s: one line with dropped_family", async (_, withFamily) => {
            const hub = channelHub();
            const original = await openTab(storage, hub.join());
            await signIn(original.auth);
            const clone = duplicate(storage);
            if (!withFamily) clone.removeItem(ACR_TOKEN_FAMILY_KEY);
            const copy = await openTab(clone, hub.join());
            const mark = sink.length;
            expect(await copy.auth.getAcrAccessToken()).toEqual({ kind: "authorization_required" });
            expect(since(mark).filter(([, message]) => message === CLONE)).toEqual([
                ["info", CLONE, { dropped_family: withFamily }],
            ]);
        });

        it("a clear from another tab: one Info line on the tab that received it, none on the sender", async () => {
            const hub = channelHub();
            const here = await openTab(storage, hub.join());
            await signIn(here.auth);
            const there = await openTab(new MemoryStorage(), hub.join());
            await signIn(there.auth);
            const mark = sink.length;
            await here.signOut.acrBrowserSignOut.clearAllTabs();
            await turns(2);
            expect(since(mark)).toEqual([["info", RECEIVED, { source: "other_tab" }]]);
        });
    });
});

describe("module load (P1-6, CHAOS-12305)", () => {
    /** The browser's BroadcastChannel, in memory: delivers to every other open channel, later. */
    class FakeBroadcastChannel {
        static open: FakeBroadcastChannel[] = [];
        private readonly listeners: ((event: { data: unknown }) => void)[] = [];
        constructor(readonly name: string) {
            FakeBroadcastChannel.open.push(this);
        }
        postMessage(data: unknown) {
            for (const other of FakeBroadcastChannel.open) {
                if (other === this || other.name !== this.name) continue;
                for (const listener of other.listeners) {
                    queueMicrotask(() => listener({ data: structuredClone(data) }));
                }
            }
        }
        addEventListener(type: string, listener: (event: { data: unknown }) => void) {
            if (type === "message") this.listeners.push(listener);
        }
        close() {}
    }

    it("sends no request when the store and the sign-out hook load; the hook's load starts the tab listener", async () => {
        const fetchSpy = vi.fn(async () => json(200, {}));
        vi.stubGlobal("fetch", fetchSpy);
        FakeBroadcastChannel.open = [];
        vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
        const tab = new MemoryStorage();
        tab.setItem(ACR_TOKEN_FAMILY_KEY, JSON.stringify(STORED_FAMILY));
        vi.stubGlobal("window", {
            sessionStorage: tab,
            localStorage: shared,
            location: { origin: WEB, replace: vi.fn() },
        });
        vi.resetModules();
        await import("../acr-auth");
        // The store listens lazily, on its first use.
        expect(FakeBroadcastChannel.open).toHaveLength(0);
        await import("../acr-sign-out");
        await turns(2);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(getSession).not.toHaveBeenCalled();
        expect(FakeBroadcastChannel.open.map((channel) => channel.name)).toEqual([
            ACR_TABS_CHANNEL,
        ]);

        // A sign-out in another tab reaches this page, which never used the store.
        new FakeBroadcastChannel(ACR_TABS_CHANNEL).postMessage({ type: "clear" });
        await turns(2);
        expect(tab.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

/**
 * CHAOS-12369: the guard. It reads every log call made by every test of this file, so a log line
 * that leaks a token, a code, a verifier, a state or a tab id fails here, whichever test drove it.
 * Run the whole file: a filtered run sees too few calls and fails the first test on purpose.
 */
describe("no secret in any log call (CHAOS-12369)", () => {
    it("saw the store's events and the secrets (a guard that sees nothing must fail)", () => {
        const messages = new Set(sink.map(({ args }) => String(args[1])));
        for (const message of [
            "ask-dev acr token store refresh sent",
            "ask-dev acr token store refresh answered",
            "ask-dev acr token store family cleared",
            "ask-dev acr token store principal dropped",
            "ask-dev acr token store clear overtook",
            "ask-dev acr token store clone dropped",
            "ask-dev acr token store clear received",
        ]) {
            expect(messages).toContain(message);
        }
        // Every kind was harvested, with a value long enough for the guard below to look for it
        // (codex r1 on #1681: a total count hid a kind that was never harvested).
        for (const [kind, values] of Object.entries(secretsByKind)) {
            expect(
                [...values].some((value) => value.length >= 8),
                `no ${kind} value was harvested`,
            ).toBe(true);
        }
    });

    it("no log argument holds a token, an authorization code, a verifier, a state or a tab id", () => {
        const text = JSON.stringify(sink.map(({ args }) => args));
        expect(text).not.toMatch(/fcacr_|acrrt_/u);
        for (const [kind, values] of Object.entries(secretsByKind)) {
            for (const value of values) {
                if (value.length < 8) continue;
                expect(text, `a log call carries a ${kind} value`).not.toContain(value);
            }
        }
    });
});
