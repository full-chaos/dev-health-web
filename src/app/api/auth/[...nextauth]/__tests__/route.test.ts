/**
 * CHAOS-12088: the session endpoint is what `useSession` reads, so any page JS can read what it
 * serves. These tests run the REAL next-auth handlers (no next-auth mock) with a signed session
 * cookie, the same request a browser sends.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decode, encode } from "next-auth/jwt";
import { NextRequest } from "next/server";

const SECRET = "chaos-12088-route-test-secret";
const COOKIE = "authjs.session-token";
const ACCESS = "ops-access-token-chaos-12088";
const REFRESH = "ops-refresh-token-chaos-12088";
const ORIGIN = "http://localhost:3000";

vi.stubEnv("AUTH_SECRET", SECRET);
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);

// No backend in this test: a call that leaves the process is a test defect.
const fetchSpy = vi.fn(async () => {
    throw new Error("no backend in this test");
});

let GET: (req: NextRequest) => Promise<Response>;
let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
    vi.stubGlobal("fetch", fetchSpy);
    ({ GET, POST } = (await import("../route")) as unknown as {
        GET: typeof GET;
        POST: typeof POST;
    });
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

async function sessionCookie(): Promise<string> {
    const now = Date.now();
    const value = await encode({
        secret: SECRET,
        salt: COOKIE,
        token: {
            sub: "user-1",
            id: "user-1",
            email: "member@example.test",
            org_id: "org-1",
            role: "member",
            is_superuser: false,
            access_token: ACCESS,
            refresh_token: REFRESH,
            // Fresh and just validated: the jwt callback calls no backend.
            expires_at: now + 60 * 60 * 1000,
            last_validated: now,
        },
    });
    return `${COOKIE}=${value}`;
}

async function csrf(cookie: string): Promise<{ cookie: string; token: string }> {
    const res = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`, { headers: { cookie } }));
    const { csrfToken } = (await res.json()) as { csrfToken: string };
    const csrfCookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .find((c) => c.startsWith("authjs.csrf-token="));
    expect(csrfCookie).toBeTruthy();
    return { cookie: `${cookie}; ${csrfCookie}`, token: csrfToken };
}

describe("GET /api/auth/session (what useSession reads)", () => {
    it("serves the signed-in user without the Ops access or refresh token", async () => {
        const res = await GET(
            new NextRequest(`${ORIGIN}/api/auth/session`, {
                headers: { cookie: await sessionCookie() },
            }),
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        const body = JSON.parse(text) as Record<string, unknown> & { user?: { id?: string } };

        // The session itself still works: the user is there.
        expect(body.user?.id).toBe("user-1");
        // The tokens are not, under any key.
        expect(body).not.toHaveProperty("access_token");
        expect(body).not.toHaveProperty("refresh_token");
        expect(text).not.toContain(ACCESS);
        expect(text).not.toContain(REFRESH);
        // The rolling cookie refresh still reaches the browser.
        expect(res.headers.getSetCookie().some((c) => c.startsWith(`${COOKIE}=`))).toBe(true);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("answers null without a session", async () => {
        const res = await GET(new NextRequest(`${ORIGIN}/api/auth/session`));
        expect(res.status).toBe(200);
        expect(await res.json()).toBeNull();
    });
});

describe("POST /api/auth/session (useSession().update)", () => {
    it("serves the updated session without the Ops tokens", async () => {
        const { cookie, token } = await csrf(await sessionCookie());
        const res = await POST(
            new NextRequest(`${ORIGIN}/api/auth/session`, {
                method: "POST",
                headers: { cookie, "content-type": "application/json" },
                body: JSON.stringify({ csrfToken: token, data: { impersonationChanged: true } }),
            }),
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        expect((JSON.parse(text) as { user?: { id?: string } }).user?.id).toBe("user-1");
        expect(text).not.toContain(ACCESS);
        expect(text).not.toContain(REFRESH);
    });

    it.each(["activeOrg", "onboardComplete"])(
        "refuses a browser update that carries a token pair under %s",
        async (key) => {
            const { cookie, token } = await csrf(await sessionCookie());
            const planted = {
                access_token: "planted-access",
                refresh_token: "planted-refresh",
                org_id: "org-evil",
                role: "owner",
                expires_in: 3600,
                user: { org_id: "org-evil", role: "owner" },
            };
            const res = await POST(
                new NextRequest(`${ORIGIN}/api/auth/session`, {
                    method: "POST",
                    headers: { cookie, "content-type": "application/json" },
                    body: JSON.stringify({ csrfToken: token, data: { [key]: planted } }),
                }),
            );
            expect(res.status).toBe(400);
            // No new session cookie: the planted pair never reached the JWT.
            expect(res.headers.getSetCookie().some((c) => c.startsWith(`${COOKIE}=`))).toBe(false);
            expect(await res.text()).not.toContain("planted-access");
        },
    );

    // Bodies the guard does not parse: Auth.js must not read a token pair out of them either.
    it.each([
        [
            "text/plain",
            (csrfToken: string) => JSON.stringify({ csrfToken, data: { activeOrg: PLANT } }),
        ],
        [
            "application/x-www-form-urlencoded",
            (csrfToken: string) =>
                new URLSearchParams({
                    csrfToken,
                    data: JSON.stringify({ activeOrg: PLANT }),
                }).toString(),
        ],
    ] as const)("a %s update cannot plant a token pair either", async (type, makeBody) => {
        const { cookie, token } = await csrf(await sessionCookie());
        const res = await POST(
            new NextRequest(`${ORIGIN}/api/auth/session`, {
                method: "POST",
                headers: { cookie, "content-type": type },
                body: makeBody(token),
            }),
        );
        expect(await res.text()).not.toContain("planted-access");
        for (const set of res.headers.getSetCookie()) {
            if (!set.startsWith(`${COOKIE}=`)) continue;
            const value = set.split(";")[0].slice(COOKIE.length + 1);
            if (!value) continue;
            const decoded = await decode({ secret: SECRET, salt: COOKIE, token: value });
            expect(decoded?.access_token).toBe(ACCESS);
        }
    });
});

const PLANT = {
    access_token: "planted-access",
    refresh_token: "planted-refresh",
    expires_in: 3600,
    user: { org_id: "org-evil", role: "owner" },
};
