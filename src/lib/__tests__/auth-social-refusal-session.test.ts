/**
 * CHAOS-13642: a social sign-in the backend refuses leaves no session that names a user. The jwt
 * callback gets what Auth.js passes at an OAuth sign-in (the provider profile under the random user
 * id Auth.js gives it); the backend answers 403. The session read then runs through the REAL
 * Auth.js handlers and the browser-safe route (next-auth is wrapped only to capture the config).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";

const SECRET = "chaos-13642-refusal-test-secret";
const COOKIE = "authjs.session-token";
const ORIGIN = "http://localhost:3000";
const SOCIAL = "/api/v1/auth/social-login";

vi.stubEnv("AUTH_SECRET", SECRET);
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", "https://auth.example.test");

const { captured } = vi.hoisted(() => ({ captured: { config: null as unknown } }));
vi.mock("next-auth", async (importOriginal) => {
    const real = await importOriginal<typeof import("next-auth")>();
    return {
        ...real,
        default: (config: Parameters<typeof real.default>[0]) => {
            captured.config = config;
            return real.default(config);
        },
    };
});

const REFUSAL = "The provider has not verified this email address";
const USER_ID = "3f0c6a1e-9d4b-4c55-8f3e-2b7a1c9d0e11";
const EMAIL = "octo@example.test";
const PROVIDER_TOKEN = "gho_provider_token";

const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith(SOCIAL)) {
        return new Response(JSON.stringify({ detail: { message: REFUSAL } }), {
            status: 403,
            headers: { "content-type": "application/json" },
        });
    }
    throw new Error(`unexpected fetch ${String(input)}`);
});

type Token = Record<string, unknown>;
type Jwt = (p: Record<string, unknown>) => Promise<Token>;
type Route = (req: NextRequest) => Promise<Response>;
let GET: Route;

beforeAll(async () => {
    vi.stubGlobal("fetch", fetchSpy);
    await import("@/lib/auth");
    ({ GET } = (await import("@/app/api/auth/[...nextauth]/route")) as unknown as { GET: Route });
    // Cold imports of next-auth and the real auth module; a ceiling for real I/O, not a target.
}, 120_000);

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const jwt = (): Jwt => (captured.config as { callbacks: { jwt: Jwt } }).callbacks.jwt;

// The arguments of the jwt callback at an OAuth sign-in (@auth/core lib/actions/callback).
const refusedSignIn = () =>
    jwt()({
        token: {
            name: "Octo Cat",
            email: EMAIL,
            picture: "https://img.example.test/1",
            sub: USER_ID,
        },
        user: { id: USER_ID, name: "Octo Cat", email: EMAIL, image: "https://img.example.test/1" },
        account: {
            provider: "github",
            type: "oauth",
            providerAccountId: "583231",
            access_token: PROVIDER_TOKEN,
            token_type: "bearer",
        },
        profile: { id: 583231, login: "octocat", email: EMAIL },
        trigger: "signIn",
    });

describe("a refused social sign-in (CHAOS-13642)", () => {
    it("the jwt callback keeps the reason and nothing that names a user or carries a credential", async () => {
        const token = await refusedSignIn();
        expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith(SOCIAL))).toBe(true);
        const kept = Object.fromEntries(Object.entries(token).filter(([, v]) => v !== undefined));
        expect(kept).toEqual({ error: REFUSAL });
    });

    it("GET /api/auth/session serves no user, only the reason", async () => {
        const token = await refusedSignIn();
        const cookie = `${COOKIE}=${await encode({ secret: SECRET, salt: COOKIE, token })}`;
        const res = await GET(
            new NextRequest(`${ORIGIN}/api/auth/session`, { headers: { cookie } }),
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        const body = JSON.parse(text) as Record<string, unknown>;
        expect(body.user).toBeUndefined();
        expect(body.error).toBe(REFUSAL);
        expect(text).not.toContain(EMAIL);
        expect(text).not.toContain(USER_ID);
        expect(text).not.toContain(PROVIDER_TOKEN);
    });
});

// Auth.js passes an account only together with a user, and the user clears the error; these
// inputs pin, at unit level, that only a social account with a provider token drops the token.
describe("a token with an error outside a social sign-in keeps its user (CHAOS-13642)", () => {
    const withError = () => ({
        id: "user-1",
        sub: "user-1",
        email: EMAIL,
        access_token: "old-access",
        refresh_token: "old-refresh",
        error: "refresh_unavailable",
        expires_at: Date.now() + 3600_000,
        last_validated: Date.now(),
    });

    it.each([
        ["no account (a session read)", undefined],
        [
            "a credentials account",
            {
                provider: "credentials",
                type: "credentials",
                providerAccountId: "user-1",
                access_token: "x",
            },
        ],
        ["an sso account", { provider: "sso", type: "credentials", providerAccountId: "user-1" }],
    ])("%s", async (_name, account) => {
        fetchSpy.mockClear();
        const out = await jwt()({ token: withError(), user: null, account });
        expect(out).toMatchObject({
            id: "user-1",
            email: EMAIL,
            refresh_token: "old-refresh",
            error: "refresh_unavailable",
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
