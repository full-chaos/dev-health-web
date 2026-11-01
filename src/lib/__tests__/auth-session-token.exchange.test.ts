import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10876: the credentials provider reaches auth-service through the wire module, and the jwt
// callback takes expiry and session id from the issued access token.

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
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import { ACTOR, ISSUER, SID, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";

// CHAOS-10876 C2: the social exchange answer under the class setting (the eddsa read only; the rest
// of the exchange is 7.4's).

type Token = Record<string, unknown>;
type Jwt = (p: {
    token: Token;
    user?: Record<string, unknown> | null;
    account?: Record<string, unknown> | null;
}) => Promise<Token>;
const jwt = (): Jwt => (nextAuthConfig.value as { callbacks: { jwt: Jwt } }).callbacks.jwt;
const SOCIAL = "/api/v1/auth/social-login";
const fetchMock = vi.fn();
const logged = () => vi.mocked(logSessionBranch).mock.calls.map(([f]) => f);

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
const account = { provider: "github", access_token: "gh-token" };
const answerOf =
    (access: string, extra: Record<string, unknown> = {}) =>
    () =>
        new Response(
            JSON.stringify({
                access_token: access,
                refresh_token: "social-refresh",
                expires_in: 3000,
                user: { id: "u9", org_id: "o9", role: "member" },
                ...extra,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
        );

beforeEach(() => {
    vi.mocked(logSessionBranch).mockClear();
    fetchMock.mockReset();
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});
function eddsaEnv() {
    vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
}

describe("the social exchange answer", () => {
    it("(g1) under eddsa the service token, its expiry, the sid and the actor are stored and expires_at comes from the access exp", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        const service = mint({ aud: "auth-service", exp });
        fetchMock.mockImplementation(
            eddsaFetch({
                [SOCIAL]: answerOf(mint({ exp, act: ACTOR }), { session_access_token: service }),
            }),
        );
        const out = await jwt()({ token: stored(), user: null, account });
        expect(out.access_token).not.toBe("old-access");
        expect(out.refresh_token).toBe("social-refresh");
        expect(out.session_access_token).toBe(service);
        expect(out.session_expires_at).toBe(exp * 1000);
        expect(out.act_sub).toBe(ACTOR);
        expect(out.sid).toBe(SID);
        expect(out.expires_at).toBe(exp * 1000);
        expect(out.error).toBeUndefined();
    });

    it("(g2) under eddsa a refused service token sets social_login_failed and leaves the stored tokens alone", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(
            eddsaFetch({
                [SOCIAL]: answerOf(mint({ exp }), {
                    session_access_token: mint({ aud: "auth-service", exp: exp + 1 }),
                }),
            }),
        );
        const out = await jwt()({ token: stored(), user: null, account });
        expect(out.error).toBe("social_login_failed");
        expect(out.access_token).toBe("old-access");
        expect(out.refresh_token).toBe("old-refresh");
        expect(out.session_access_token).toBe("old-service-token");
        expect(logged()).toEqual([
            { operation: "social_login", branch: "session_token_exp_mismatch" },
        ]);
    });

    it("(g2b) under eddsa the key set unavailable sets social_login_failed and leaves the stored tokens alone", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).startsWith(ISSUER)) return new Response("down", { status: 503 });
            return eddsaFetch({ [SOCIAL]: answerOf(mint({ exp })) })(input, init);
        });
        const out = await jwt()({ token: stored(), user: null, account });
        expect(out.error).toBe("social_login_failed");
        expect(out.access_token).toBe("old-access");
    });

    it("(g3) under hs256_compat the exchange is unchanged: no read of the access token, a present field is counted, nothing is stored", async () => {
        fetchMock.mockResolvedValue(
            answerOf("not-a-decodable-token", { session_access_token: "svc-value" })(),
        );
        const out = await jwt()({ token: stored(), user: null, account });
        expect(out.access_token).toBe("not-a-decodable-token");
        expect(out.refresh_token).toBe("social-refresh");
        expect(out.session_access_token).toBeUndefined();
        expect(out.error).toBeUndefined();
        expect(logged()).toEqual([{ operation: "social_login", branch: "session_token_ignored" }]);
    });

    it("(g4) under eddsa an answer without the field clears the stored service token and is counted", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(eddsaFetch({ [SOCIAL]: answerOf(mint({ exp })) }));
        const out = await jwt()({ token: stored(), user: null, account });
        expect(out.session_access_token).toBeUndefined();
        expect(out.act_sub).toBeUndefined();
        expect(out.error).toBeUndefined();
        expect(logged()).toEqual([{ operation: "social_login", branch: "session_token_missing" }]);
    });

    it("(g5) an unknown class sets social_login_failed and calls nothing", async () => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "nope");
        const out = await jwt()({ token: stored(), user: null, account });
        expect(out.error).toBe("social_login_failed");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
