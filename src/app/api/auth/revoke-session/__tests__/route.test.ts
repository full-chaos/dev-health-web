/**
 * CHAOS-12096 (design T4, step 1): POST /api/auth/revoke-session revokes the signed-in user's Ops
 * session. It reads the Ops refresh token from the sealed session cookie (the browser cannot read
 * it) and calls Ops `POST /api/v1/auth/logout`, which revokes the session that credential belongs
 * to. These tests use a real session cookie, signed as the browser sends it.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";

const SECRET = "chaos-12096-route-test-secret";
const ORIGIN = "https://app.example.test";
const ACCESS = "ops-access-token-chaos-12096";
const REFRESH = "ops-refresh-token-chaos-12096";
const BACKEND = "http://ops.example.test";

const { logs } = vi.hoisted(() => ({ logs: [] as { level: string; args: unknown[] }[] }));

vi.mock("@/lib/logger", () => {
    const capture =
        (level: string) =>
        (...args: unknown[]) => {
            logs.push({ args, level });
        };
    const child = () => ({
        child,
        debug: capture("debug"),
        error: capture("error"),
        info: capture("info"),
        warn: capture("warn"),
    });
    return { logger: child() };
});

vi.stubEnv("AUTH_SECRET", SECRET);
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
vi.stubEnv("BACKEND_URL", BACKEND);

const fetchMock = vi.fn();
let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    ({ POST } = (await import("../route")) as unknown as { POST: typeof POST });
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

beforeEach(() => {
    fetchMock.mockReset();
    logs.length = 0;
});

afterEach(() => {
    expect(JSON.stringify(logs)).not.toContain(REFRESH);
    expect(JSON.stringify(logs)).not.toContain(ACCESS);
});

async function sessionCookie(
    name = "__Secure-authjs.session-token",
    token: Record<string, unknown> = {},
): Promise<string> {
    const now = Date.now();
    const value = await encode({
        salt: name,
        secret: SECRET,
        token: {
            access_token: ACCESS,
            expires_at: now + 60 * 60 * 1000,
            id: "user-1",
            last_validated: now,
            org_id: "org-1",
            refresh_token: REFRESH,
            sub: "user-1",
            ...token,
        },
    });
    return `${name}=${value}`;
}

function revokeRequest(headers: Record<string, string>): Request {
    return new Request(`${ORIGIN}/api/auth/revoke-session`, {
        headers: { origin: ORIGIN, ...headers },
        method: "POST",
    });
}

function opsLogoutCall(): { readonly url: string; readonly init: RequestInit } | undefined {
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/v1/auth/logout"));
    return call ? { init: call[1] as RequestInit, url: String(call[0]) } : undefined;
}

describe("POST /api/auth/revoke-session", () => {
    it.each([
        ["the secure cookie", "__Secure-authjs.session-token"],
        ["the plain cookie", "authjs.session-token"],
    ])(
        "Given %s, when Ops revokes, then it sends the session's refresh token to Ops logout and answers 204",
        async (_name, cookieName) => {
            fetchMock.mockResolvedValue(Response.json({ message: "Logout successful" }));

            const response = await POST(revokeRequest({ cookie: await sessionCookie(cookieName) }));

            expect(response.status).toBe(204);
            const call = opsLogoutCall();
            expect(call?.url).toBe(`${BACKEND}/api/v1/auth/logout`);
            expect(call?.init.method).toBe("POST");
            expect(JSON.parse(String(call?.init.body))).toEqual({ refresh_token: REFRESH });
            expect(new Headers(call?.init.headers).get("authorization")).toBe(`Bearer ${ACCESS}`);
        },
    );

    it("Given another origin, then it refuses with 403 and calls nothing", async () => {
        const response = await POST(
            revokeRequest({ cookie: await sessionCookie(), origin: "https://evil.example.test" }),
        );

        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Given no session cookie, then it answers 401 and calls nothing, even with a bearer header", async () => {
        const forged = (await sessionCookie()).split("=")[1] ?? "";

        const response = await POST(revokeRequest({ authorization: `Bearer ${forged}` }));

        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Given a session with no refresh token, then it answers 401 and calls nothing", async () => {
        const response = await POST(
            revokeRequest({ cookie: await sessionCookie(undefined, { refresh_token: undefined }) }),
        );

        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Given a cookie signed with another secret, then it answers 401 and calls nothing", async () => {
        const value = await encode({
            salt: "__Secure-authjs.session-token",
            secret: "another-secret",
            token: { refresh_token: REFRESH, sub: "user-1" },
        });

        const response = await POST(
            revokeRequest({ cookie: `__Secure-authjs.session-token=${value}` }),
        );

        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ["an error answer", () => Promise.resolve(new Response("{}", { status: 503 }))],
        ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ])(
        "Given Ops fails with %s, then it answers 502 and logs an error with no token",
        async (_name, answer) => {
            fetchMock.mockImplementation(answer);

            const response = await POST(revokeRequest({ cookie: await sessionCookie() }));

            expect(response.status).toBe(502);
            expect(await response.text()).not.toContain(REFRESH);
            expect(logs).toContainEqual(expect.objectContaining({ level: "error" }));
        },
    );
});
