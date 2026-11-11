import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10877: the social exchange for each provider. W-1 the request and the stored pair for
// github, google and gitlab under the EdDSA access-token contract; W-2 every failure leaves the stored session
// alone and a provider token never reaches a log line; W-5 a new social user has no org at login
// (D6145 correction: the org and the owner membership come at onboarding).

const { nextAuthConfig } = vi.hoisted(() => ({ nextAuthConfig: { value: null as unknown } }));

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
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));
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
            const out = await jwt()({ token: stored(), user: null, account: accountOf(provider) });
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
    const untouched = (out: Token) => {
        expect(out.access_token).toBe("old-access");
        expect(out.refresh_token).toBe("old-refresh");
        expect(out.session_access_token).toBe("old-service-token");
        expect(out.sid).toBe("ses_OldSessionAAAAAAAAAAAA");
    };

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
        const out = await jwt()({ token: stored(), user: null, account: accountOf(provider) });
        expect(out.error).toBe("social_login_failed");
        untouched(out);
    });

    it.each([
        [401, { detail: { message: "invalid_provider_token" } }, "invalid_provider_token"],
        [403, { detail: { message: "signup_unavailable" } }, "signup_unavailable"],
        [409, { detail: "email_already_registered" }, "email_already_registered"],
        [400, {}, "social_login_failed"],
    ])("a %i answer sets the backend message as the error", async (status, body, message) => {
        eddsaEnv();
        fetchMock.mockResolvedValue(json(body, status));
        const out = await jwt()({ token: stored(), user: null, account: accountOf("github") });
        expect(out.error).toBe(message);
        expect(out.refresh_token).toBe("old-refresh");
    });

    it("a 5xx answer that is not JSON sets social_login_failed", async () => {
        fetchMock.mockResolvedValue(new Response("bad gateway", { status: 502 }));
        const out = await jwt()({ token: stored(), user: null, account: accountOf("google") });
        expect(out.error).toBe("social_login_failed");
        expect(out.refresh_token).toBe("old-refresh");
    });

    it("a network error sets social_login_failed", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        const out = await jwt()({ token: stored(), user: null, account: accountOf("gitlab") });
        expect(out.error).toBe("social_login_failed");
        expect(out.refresh_token).toBe("old-refresh");
    });

    it.each([
        ["answered", () => json(answerBody("compat-access"))],
        ["refused 409", () => json({ detail: { message: "conflict" } }, 409)],
        ["unreadable 502", () => new Response("down", { status: 502 })],
    ])("W-2b no log line holds the provider token (%s)", async (_name, respond) => {
        fetchMock.mockImplementation(async () => respond());
        await jwt()({ token: stored(), user: null, account: accountOf("github") });
        fetchMock.mockRejectedValue(new Error("boom"));
        await jwt()({ token: stored(), user: null, account: accountOf("github") });
        expect(everyLogged()).not.toContain(PROVIDER_TOKEN);
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
        const out = await jwt()({
            token: {},
            user: { id: "p" },
            account: accountOf(provider),
        });
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
        const out = await jwt()({ token: {}, user: { id: "p" }, account: accountOf("github") });
        expect(out.org_id).toBe("o9");
        expect(out.needs_onboarding).toBe(false);
        expect(out.is_new_user).toBe(false);
    });
});
