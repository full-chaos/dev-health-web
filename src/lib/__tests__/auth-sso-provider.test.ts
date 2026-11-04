/**
 * CHAOS-10878 (7.5): the Auth.js provider `sso`. A route that has completed the SSO call seals the
 * session into a ticket; the provider opens it and the jwt callback stores it. This runs the REAL
 * Auth.js handlers (no next-auth mock): the sign-in request, the session cookie it writes, and
 * every credential the provider must refuse.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decode, encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import type { SsoSession } from "@/lib/authSso";

const SECRET = "chaos-10878-sso-provider-test-secret";
const COOKIE = "authjs.session-token";
const ORIGIN = "http://localhost:3000";

vi.stubEnv("AUTH_SECRET", SECRET);
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
vi.stubEnv("AUTH_SSO_ENABLED", "true");

const fetchSpy = vi.fn(async () => {
    throw new Error("no backend in this test");
});

type Route = (req: NextRequest) => Promise<Response>;
let GET: Route;
let POST: Route;
let auth: typeof import("@/lib/auth");

beforeAll(async () => {
    vi.stubGlobal("fetch", fetchSpy);
    auth = await import("@/lib/auth");
    ({ GET, POST } = (await import("@/app/api/auth/[...nextauth]/route")) as unknown as {
        GET: Route;
        POST: Route;
    });
});
beforeEach(() => {
    fetchSpy.mockClear();
    vi.stubEnv("AUTH_SSO_ENABLED", "true");
});
afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const SESSION: SsoSession = {
    userId: "user-sso-1",
    email: "a@example.test",
    orgId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    role: "member",
    accessToken: "sso-access",
    refreshToken: "sso-refresh",
    expiresIn: 3600,
    accessExp: Math.floor(Date.now() / 1000) + 3000,
    sid: "ses_AAAAAAAAAAAAAAAAAAAAAQ",
};

async function signInSso(credentials: Record<string, string>) {
    const csrfRes = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`));
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const csrfCookie = csrfRes.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .find((c) => c.startsWith("authjs.csrf-token="));
    const res = await POST(
        new NextRequest(`${ORIGIN}/api/auth/callback/sso`, {
            method: "POST",
            headers: {
                cookie: csrfCookie ?? "",
                "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ csrfToken, ...credentials }).toString(),
        }),
    );
    const written = res.headers
        .getSetCookie()
        .filter((c) => c.startsWith(`${COOKIE}=`))
        .map((c) => c.split(";")[0].slice(COOKIE.length + 1))
        .filter(Boolean);
    const token = written[0]
        ? await decode({ secret: SECRET, salt: COOKIE, token: written[0] })
        : null;
    return { res, written, token };
}

describe("provider sso", () => {
    it("mints the session from a sealed ticket", async () => {
        const ticket = await auth.sealSsoTicket(SESSION);
        expect(ticket).not.toContain("sso-access");
        const { written, token } = await signInSso({ ticket });
        expect(written).toHaveLength(1);
        expect(token).toMatchObject({
            id: "user-sso-1",
            org_id: SESSION.orgId,
            role: "member",
            needs_onboarding: false,
            access_token: "sso-access",
            refresh_token: "sso-refresh",
            sid: SESSION.sid,
        });
        expect((token as { expires_at: number }).expires_at).toBe(
            (SESSION.accessExp as number) * 1000,
        );
    });

    it("the social exchange does not run for it", async () => {
        const ticket = await auth.sealSsoTicket(SESSION);
        await signInSso({ ticket });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    const refused: [string, () => Promise<Record<string, string>>][] = [
        [
            "raw tokens in the credentials",
            async () => ({ access_token: "a", refresh_token: "r", id: "u" }),
        ],
        ["a raw token string as the ticket", async () => ({ ticket: "sso-access" })],
        ["no ticket", async () => ({})],
        [
            "a ticket of the session-handoff kind",
            async () => ({
                ticket: await encode({
                    secret: SECRET,
                    salt: auth.SESSION_HANDOFF_SALT,
                    maxAge: 60,
                    token: { sub: "user-sso-1", kind: "activeOrg", pair: SESSION },
                }),
            }),
        ],
        [
            "an expired ticket",
            async () => ({
                ticket: await encode({
                    secret: SECRET,
                    salt: auth.SSO_TICKET_SALT,
                    maxAge: -60,
                    token: { sub: SESSION.userId, kind: "sso", session: SESSION },
                }),
            }),
        ],
        [
            "a ticket sealed for another user",
            async () => ({
                ticket: await encode({
                    secret: SECRET,
                    salt: auth.SSO_TICKET_SALT,
                    maxAge: 60,
                    token: { sub: "someone-else", kind: "sso", session: SESSION },
                }),
            }),
        ],
        [
            "a ticket without an org",
            async () => ({
                ticket: await encode({
                    secret: SECRET,
                    salt: auth.SSO_TICKET_SALT,
                    maxAge: 60,
                    token: { sub: SESSION.userId, kind: "sso", session: { ...SESSION, orgId: "" } },
                }),
            }),
        ],
    ];
    it.each(refused)("refuses %s: no session cookie", async (_name, build) => {
        const { written } = await signInSso(await build());
        expect(written).toHaveLength(0);
    });

    it("refuses a good ticket while AUTH_SSO_ENABLED is off", async () => {
        const ticket = await auth.sealSsoTicket(SESSION);
        vi.stubEnv("AUTH_SSO_ENABLED", "");
        const { written } = await signInSso({ ticket });
        expect(written).toHaveLength(0);
    });

    it("the password provider does not accept a ticket", async () => {
        const ticket = await auth.sealSsoTicket(SESSION);
        const csrfRes = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`));
        const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
        const csrfCookie = csrfRes.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .find((c) => c.startsWith("authjs.csrf-token="));
        const res = await POST(
            new NextRequest(`${ORIGIN}/api/auth/callback/credentials`, {
                method: "POST",
                headers: {
                    cookie: csrfCookie ?? "",
                    "content-type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ csrfToken, ticket }).toString(),
            }),
        );
        expect(
            res.headers
                .getSetCookie()
                .some((c) => c.startsWith(`${COOKIE}=`) && !c.includes("Max-Age=0")),
        ).toBe(false);
    });
});
