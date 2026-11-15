/**
 * CHAOS-13756: a social sign-in the backend refuses lands on the sign-in page with the code of the backend's
 * detail.reason and writes no session. These run the REAL next-auth handlers (no next-auth mock): a real sign-in
 * start, then a callback with the right state; fetch answers as GitHub and as the backend would.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "route-test-secret-route-test-secret";
const ORIGIN = "http://localhost:3000";
const SESSION_COOKIE = "authjs.session-token";
const SOCIAL = "/api/v1/auth/social-login";

vi.stubEnv("AUTH_SECRET", SECRET);
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
vi.stubEnv("AUTH_GITHUB_ID", "chaos-13756-github-client");
vi.stubEnv("AUTH_GITHUB_SECRET", "chaos-13756-github-secret");
vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", "https://auth.example.test");

// The request scope next/headers reads inside the Auth.js callback. Off by default: outside Next's request scope
// next/headers throws, and the refusal then carries no callbackUrl. On, it serves the callback request's own host
// and cookies (decoded, as Next's cookies() does).
const requestScope = vi.hoisted(() => ({
    on: false,
    host: "",
    cookies: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({
    headers: async () => {
        if (!requestScope.on) throw new Error("called outside a request scope");
        return new Headers({ host: requestScope.host });
    },
    cookies: async () => {
        if (!requestScope.on) throw new Error("called outside a request scope");
        return {
            get: (name: string) => {
                const value = requestScope.cookies.get(name);
                return value === undefined ? undefined : { name, value: decodeURIComponent(value) };
            },
        };
    },
}));

vi.mock("@/lib/logger", () => {
    const l: Record<string, unknown> = {};
    for (const level of ["trace", "debug", "info", "warn", "error", "fatal"]) l[level] = () => {};
    l.child = () => l;
    return { logger: l };
});

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let backend: () => Response | Promise<Response> = () => json({}, 500);
const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://github.com/login/oauth/access_token") {
        return json({ access_token: "gho_chaos13756", token_type: "bearer", scope: "read:user" });
    }
    if (url === "https://api.github.com/user") {
        return json({ id: 4242, login: "octo", name: "Octo", email: "octo@example.com" });
    }
    if (url.endsWith(SOCIAL)) return backend();
    throw new Error(`unexpected fetch ${url}`);
});

let GET: (req: NextRequest) => Promise<Response>;
let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
    vi.stubGlobal("fetch", fetchSpy);
    ({ GET, POST } = (await import("../route")) as unknown as {
        GET: typeof GET;
        POST: typeof POST;
    });
}, 120_000);

beforeEach(() => {
    fetchSpy.mockClear();
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

function cookiePairs(response: Response): Map<string, string> {
    const pairs = new Map<string, string>();
    for (const line of response.headers.getSetCookie()) {
        const pair = line.split(";")[0];
        const at = pair.indexOf("=");
        pairs.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return pairs;
}

const cookieHeader = (cookies: Map<string, string>) =>
    [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");

/** A real GitHub sign-in start, then the provider's callback with the state it started with. */
async function signInWithGitHub(
    callbackUrl = `${ORIGIN}/dashboard`,
    inRequestScope = false,
): Promise<Response> {
    const csrfResponse = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`));
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
    const start = await POST(
        new NextRequest(`${ORIGIN}/api/auth/signin/github`, {
            method: "POST",
            headers: {
                cookie: cookieHeader(cookiePairs(csrfResponse)),
                "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ csrfToken, callbackUrl }).toString(),
        }),
    );
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get("location") ?? "").searchParams.get("state") ?? "";
    const cookies = new Map([...cookiePairs(csrfResponse), ...cookiePairs(start)]);
    const url = new URL(`${ORIGIN}/api/auth/callback/github`);
    url.searchParams.set("code", "chaos-13756-code");
    url.searchParams.set("state", state);
    requestScope.on = inRequestScope;
    requestScope.host = url.host;
    requestScope.cookies = cookies;
    try {
        return await GET(new NextRequest(url, { headers: { cookie: cookieHeader(cookies) } }));
    } finally {
        requestScope.on = false;
    }
}

const socialCalls = () => fetchSpy.mock.calls.filter(([input]) => String(input).endsWith(SOCIAL));

describe("a social sign-in the backend refuses (real Auth.js handlers)", () => {
    it("R1 a 403 with reason email_unverified lands on /auth/signin?error=social_email_unverified with no session", async () => {
        backend = () =>
            json(
                {
                    detail: {
                        message: "The provider has not verified this email address",
                        reason: "email_unverified",
                    },
                },
                403,
            );
        const response = await signInWithGitHub();
        expect(socialCalls()).toHaveLength(1);
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(
            `${ORIGIN}/auth/signin?error=social_email_unverified`,
        );
        expect(cookiePairs(response).has(SESSION_COOKIE)).toBe(false);
    });

    it.each([
        [
            "a refusal with no reason (ops before its roll)",
            () => json({ detail: { message: "x" } }, 403),
        ],
        [
            "a link/unlink value",
            () => json({ detail: { message: "x", reason: "last_sign_in_method" } }, 409),
        ],
        ["a 500 with no detail object", () => json({ detail: "Internal Server Error" }, 500)],
        ["a backend that cannot be reached", () => Promise.reject(new TypeError("fetch failed"))],
    ])(
        "%s lands on social_login_failed with no session, never on /auth/error",
        async (_name, answer) => {
            backend = answer;
            const response = await signInWithGitHub();
            expect(response.status).toBe(302);
            expect(response.headers.get("location")).toBe(
                `${ORIGIN}/auth/signin?error=social_login_failed`,
            );
            expect(cookiePairs(response).has(SESSION_COOKIE)).toBe(false);
        },
    );

    it("N3 in a request scope the refusal keeps the sign-in's local callbackUrl through the real handlers", async () => {
        backend = () => json({ detail: { message: "x", reason: "signup_unavailable" } }, 403);
        const response = await signInWithGitHub(`${ORIGIN}/metrics?team=a`, true);
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(
            `${ORIGIN}/auth/signin?error=social_signup_unavailable&callbackUrl=%2Fmetrics%3Fteam%3Da`,
        );
        expect(cookiePairs(response).has(SESSION_COOKIE)).toBe(false);
    });

    it("N3 in a request scope a callbackUrl on an auth page is dropped through the real handlers", async () => {
        backend = () => json({ detail: { message: "x", reason: "malformed" } }, 400);
        const response = await signInWithGitHub(`${ORIGIN}/auth/signin`, true);
        expect(response.headers.get("location")).toBe(
            `${ORIGIN}/auth/signin?error=social_malformed`,
        );
    });
});
