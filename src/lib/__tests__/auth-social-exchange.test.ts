import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10877: the social exchange for each provider. W-1 the request and the stored pair for
// github, google and gitlab under the EdDSA access-token contract; W-2 every failure lands on the sign-in page with a
// closed code and writes no session (CHAOS-13642, CHAOS-13756) and a provider token never reaches a log line; W-5 a new
// social user has no org at login (D6145 correction: the org and the owner membership come at onboarding). The exchange
// runs in the signIn callback; jwt stores the answer signIn accepted for the same account (CHAOS-13756).

const { nextAuthConfig, requestScope, backendUrl } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    requestScope: {
        host: undefined as string | undefined,
        callbackUrl: undefined as string | undefined,
    },
    backendUrl: { fail: false },
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => ({
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: vi.fn(),
            handlers: { GET: vi.fn(), POST: vi.fn() },
            signIn: vi.fn(),
            signOut: vi.fn(),
        };
    }),
    CredentialsSignin: class CredentialsSignin extends Error {
        code = "credentials";
    },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/github", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/gitlab", () => ({ default: vi.fn() }));
vi.mock("@/lib/origin", () => ({
    getBackendUrl: () => {
        if (backendUrl.fail) throw new Error("BACKEND_URL is not set");
        return "http://backend.test";
    },
}));
// The request scope of the Auth.js callback: its host and the Auth.js callback-url cookie.
vi.mock("next/headers", () => ({
    headers: async () => new Headers(requestScope.host ? { host: requestScope.host } : {}),
    cookies: async () => ({
        get: (name: string) =>
            name === "authjs.callback-url" && requestScope.callbackUrl
                ? { name, value: requestScope.callbackUrl }
                : undefined,
    }),
}));
vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));
vi.mock("@/lib/logger", () => {
    const l = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
    };
    l.child.mockReturnValue(l);
    return { logger: l };
});

import "@/lib/auth";
import { logSessionBranch } from "@/lib/authSessionLog";
import { logger } from "@/lib/logger";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import { ISSUER, SID, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";

type Token = Record<string, unknown>;
type Jwt = (p: {
    token: Token;
    user?: Record<string, unknown> | null;
    account?: Record<string, unknown> | null;
}) => Promise<Token>;
const jwt = (): Jwt => (nextAuthConfig.value as { callbacks: { jwt: Jwt } }).callbacks.jwt;
type SignIn = (p: {
    user?: Record<string, unknown> | null;
    account?: Record<string, unknown> | null;
}) => Promise<boolean | string>;
const signIn = (): SignIn =>
    (nextAuthConfig.value as { callbacks: { signIn: SignIn } }).callbacks.signIn;

const SOCIAL = "/api/v1/auth/social-login";
const PROVIDERS = ["github", "google", "gitlab"] as const;
const PROVIDER_TOKEN = "provider-token-must-not-be-logged";
const fetchMock = vi.fn();

const stored = (): Token => ({
    id: "user-1",
    access_token: "old-access",
    refresh_token: "old-refresh",
    sid: "ses_OldSessionAAAAAAAAAAAA",
    session_access_token: "old-service-token",
    session_expires_at: 1,
    act_sub: "prn_OLDOLDOLDOLDOLDOLDOLDO",
    expires_at: Date.now() + 3600_000,
    last_validated: Date.now(),
});
const accountOf = (provider: string) => ({ provider, access_token: PROVIDER_TOKEN });
const refusedTo = (code: string) => `/auth/signin?error=${code}`;

/** One Auth.js OAuth callback: signIn with the account, then (when it accepts) jwt with the same account object. */
async function socialSignIn(
    provider: string,
    token: Token = stored(),
    user: Record<string, unknown> | null = null,
): Promise<{ verdict: boolean | string; out?: Token | null }> {
    const account = accountOf(provider);
    const verdict = await signIn()({ user: { id: "provider-user" }, account });
    if (verdict !== true) return { verdict };
    return { verdict, out: await jwt()({ token, user, account }) };
}
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
const answerBody = (access: string, extra: Record<string, unknown> = {}) => ({
    access_token: access,
    refresh_token: "social-refresh",
    expires_in: 3000,
    user: { id: "u9", org_id: "o9", role: "member" },
    ...extra,
});

function eddsaEnv() {
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
}
function answerWith(respond: () => Response) {
    return (input: RequestInfo | URL, init?: RequestInit) =>
        eddsaFetch({ [SOCIAL]: respond })(input, init);
}
const socialCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith(SOCIAL)) as [string, RequestInit][];
const everyLogged = () =>
    JSON.stringify([
        ...vi.mocked(logSessionBranch).mock.calls,
        ...[
            logger.trace,
            logger.debug,
            logger.info,
            logger.warn,
            logger.error,
            logger.fatal,
        ].flatMap((f) => vi.mocked(f).mock.calls.map((c) => JSON.stringify(c, replaceErrors))),
    ]);
function replaceErrors(_key: string, value: unknown) {
    return value instanceof Error ? { name: value.name, message: value.message } : value;
}

beforeEach(() => {
    vi.mocked(logSessionBranch).mockClear();
    for (const f of [
        logger.trace,
        logger.debug,
        logger.info,
        logger.warn,
        logger.error,
        logger.fatal,
    ])
        vi.mocked(f).mockClear();
    fetchMock.mockReset();
    requestScope.host = undefined;
    requestScope.callbackUrl = undefined;
    backendUrl.fail = false;
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("W-1 the exchange for each provider", () => {
    it.each(PROVIDERS)(
        "(eddsa) %s posts {provider, provider_access_token} and stores the pair with the sid",
        async (provider) => {
            eddsaEnv();
            const exp = inSeconds(1800);
            fetchMock.mockImplementation(
                answerWith(() =>
                    json(
                        answerBody(mint({ exp }), {
                            session_access_token: mint({ aud: "auth-service", exp }),
                        }),
                    ),
                ),
            );
            const { verdict, out } = await socialSignIn(provider);
            expect(verdict).toBe(true);
            if (!out) throw new Error("no token");
            const calls = socialCalls();
            expect(calls).toHaveLength(1);
            expect(JSON.parse(String(calls[0][1].body))).toEqual({
                provider,
                provider_access_token: PROVIDER_TOKEN,
            });
            expect(out.access_token).not.toBe("old-access");
            expect(out.refresh_token).toBe("social-refresh");
            expect(out.sid).toBe(SID);
            expect(out.expires_at).toBe(exp * 1000);
            expect(out.error).toBeUndefined();
        },
    );
});

describe("W-2 a failed exchange", () => {
    it.each(PROVIDERS)("%s: a refused answer under eddsa is no sign-in", async (provider) => {
        eddsaEnv();
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(
            answerWith(() =>
                json(
                    answerBody(mint({ exp }), {
                        session_access_token: mint({ aud: "auth-service", exp: exp + 1 }),
                    }),
                ),
            ),
        );
        const { verdict } = await socialSignIn(provider);
        expect(verdict).toBe(refusedTo("social_login_failed"));
    });

    it.each([
        [401, { detail: { message: "Invalid or expired provider token" } }, "social_login_failed"],
        [
            401,
            {
                detail: {
                    message: "Invalid or expired provider token",
                    reason: "invalid_credentials",
                },
            },
            "social_invalid_credentials",
        ],
        [
            403,
            {
                detail: {
                    message: "Sign-up with github is not available",
                    reason: "signup_unavailable",
                },
            },
            "social_signup_unavailable",
        ],
        [409, { detail: "email_already_registered" }, "social_login_failed"],
        [400, {}, "social_login_failed"],
    ])("a %i answer lands on its code, never on the backend's text", async (status, body, code) => {
        eddsaEnv();
        fetchMock.mockResolvedValue(json(body, status));
        const { verdict } = await socialSignIn("github");
        expect(verdict).toBe(refusedTo(code));
        expect(String(verdict)).not.toMatch(/Invalid|Sign-up|email_already/);
    });

    it("a 5xx answer that is not JSON lands on social_login_failed", async () => {
        eddsaEnv();
        fetchMock.mockResolvedValue(new Response("bad gateway", { status: 502 }));
        const { verdict } = await socialSignIn("google");
        expect(verdict).toBe(refusedTo("social_login_failed"));
    });

    it("a network error lands on social_login_failed", async () => {
        eddsaEnv();
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        const { verdict } = await socialSignIn("gitlab");
        expect(verdict).toBe(refusedTo("social_login_failed"));
    });

    it("K2 a throw anywhere in signIn lands on social_login_failed, never on Auth.js's AccessDenied", async () => {
        eddsaEnv();
        backendUrl.fail = true;
        const { verdict } = await socialSignIn("github");
        expect(verdict).toBe(refusedTo("social_login_failed"));
        expect(socialCalls()).toHaveLength(0);
    });

    it("a missing access-token issuer starts no exchange", async () => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", "");
        const { verdict } = await socialSignIn("github");
        expect(verdict).toBe(refusedTo("social_login_failed"));
        expect(socialCalls()).toHaveLength(0);
    });

    it("C5 jwt writes no session for a social account signIn did not accept", async () => {
        const out = await jwt()({ token: stored(), user: null, account: accountOf("github") });
        expect(out).toBeNull();
    });

    it.each([
        ["answered", () => json(answerBody("compat-access"))],
        ["refused 409", () => json({ detail: { message: "conflict" } }, 409)],
        ["unreadable 502", () => new Response("down", { status: 502 })],
    ])("W-2b no log line holds the provider token (%s)", async (_name, respond) => {
        fetchMock.mockImplementation(async () => respond());
        await socialSignIn("github");
        fetchMock.mockRejectedValue(new Error("boom"));
        await socialSignIn("github");
        expect(everyLogged()).not.toContain(PROVIDER_TOKEN);
    });
});

describe("the callbackUrl of a refused social sign-in", () => {
    beforeEach(() => {
        eddsaEnv();
        fetchMock.mockResolvedValue(json({ detail: { message: "x", reason: "malformed" } }, 400));
    });

    it("keeps the sign-in's local callbackUrl", async () => {
        requestScope.host = "app.example.test";
        requestScope.callbackUrl = "https://app.example.test/metrics?team=a";
        const { verdict } = await socialSignIn("github");
        expect(verdict).toBe(
            "/auth/signin?error=social_malformed&callbackUrl=%2Fmetrics%3Fteam%3Da",
        );
    });

    it("drops a cross-origin callbackUrl: the sign-in page's safe default", async () => {
        requestScope.host = "app.example.test";
        requestScope.callbackUrl = "https://evil.example/steal";
        const { verdict } = await socialSignIn("github");
        expect(verdict).toBe(refusedTo("social_malformed"));
    });
});

describe("K3 the signIn to jwt hand-off", () => {
    it("two interleaved sign-ins each store their own exchange answer, once", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        const access = { github: mint({ exp }), google: mint({ exp: exp + 60 }) };
        fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
            answerWith(() => {
                const { provider } = JSON.parse(String(init?.body)) as {
                    provider: "github" | "google";
                };
                return json({
                    ...answerBody(access[provider]),
                    user: { id: `user-${provider}`, org_id: `org-${provider}`, role: "member" },
                });
            })(input, init),
        );
        const a = accountOf("github");
        const b = accountOf("google");
        expect(await signIn()({ user: { id: "pa" }, account: a })).toBe(true);
        expect(await signIn()({ user: { id: "pb" }, account: b })).toBe(true);
        const outB = await jwt()({ token: {}, user: null, account: b });
        const outA = await jwt()({ token: {}, user: null, account: a });
        expect([outA?.id, outA?.access_token, outA?.org_id]).toEqual([
            "user-github",
            access.github,
            "org-github",
        ]);
        expect([outB?.id, outB?.access_token, outB?.org_id]).toEqual([
            "user-google",
            access.google,
            "org-google",
        ]);
        expect(await jwt()({ token: {}, user: null, account: a })).toBeNull();
    });
});

describe("C3 sign-ins that are not social", () => {
    it.each([
        ["credentials", { provider: "credentials", type: "credentials" }],
        ["sso ticket", { provider: "sso", type: "credentials" }],
        ["no account", null],
    ])("%s: signIn admits it and starts no exchange", async (_name, account) => {
        expect(await signIn()({ user: { id: "u" }, account })).toBe(true);
        expect(socialCalls()).toHaveLength(0);
    });
});

describe("W-5 a social new user", () => {
    it.each(PROVIDERS)("%s: no org at login, onboarding needed, flagged new", async (provider) => {
        eddsaEnv();
        fetchMock.mockImplementation(
            answerWith(() =>
                json({
                    ...answerBody(mint({ exp: inSeconds(1800) })),
                    user: { id: "new-user", org_id: null, role: null, is_superuser: false },
                    needs_onboarding: true,
                    is_new_user: true,
                }),
            ),
        );
        const { out } = await socialSignIn(provider, {}, { id: "p" });
        if (!out) throw new Error("no token");
        expect(out.id).toBe("new-user");
        expect(out.org_id).toBeUndefined();
        expect(out.needs_onboarding).toBe(true);
        expect(out.is_new_user).toBe(true);
        expect(out.permissions).toBeUndefined();
        expect(out.error).toBeUndefined();
    });

    it("a returning member keeps the org and needs no onboarding", async () => {
        eddsaEnv();
        fetchMock.mockImplementation(
            answerWith(() =>
                json({
                    ...answerBody(mint({ exp: inSeconds(1800) })),
                    needs_onboarding: false,
                    is_new_user: false,
                }),
            ),
        );
        const { out } = await socialSignIn("github", {}, { id: "p" });
        if (!out) throw new Error("no token");
        expect(out.org_id).toBe("o9");
        expect(out.needs_onboarding).toBe(false);
        expect(out.is_new_user).toBe(false);
    });
});
