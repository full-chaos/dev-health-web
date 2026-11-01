/**
 * CHAOS-12088: a new Ops token pair (workspace creation, org switch, password change) reaches the
 * session only as a sealed handoff: the server seals it, the page passes it to update() unread, and
 * the jwt callback opens it. This runs the REAL Auth.js handlers and the real seal (no next-auth
 * mock): the browser's update request, the cookie it gets back, and every handoff the jwt callback
 * must refuse.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decode, encode } from "next-auth/jwt";
import { NextRequest } from "next/server";

const SECRET = "chaos-12088-handoff-test-secret";
const COOKIE = "authjs.session-token";
const ORIGIN = "http://localhost:3000";

vi.stubEnv("AUTH_SECRET", SECRET);
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);

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

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const ACTIVE_ORG = {
    access_token: "new-access",
    refresh_token: "new-refresh",
    expires_in: 3600,
    user: { org_id: "org-2", role: "admin", is_superuser: false },
};
const ONBOARDED = {
    access_token: "new-access",
    refresh_token: "new-refresh",
    org_id: "org-2",
    role: "owner",
    expires_in: 3600,
};

async function sessionCookie(): Promise<string> {
    const now = Date.now();
    const value = await encode({
        secret: SECRET,
        salt: COOKIE,
        token: {
            sub: "user-1",
            id: "user-1",
            org_id: "org-1",
            role: "member",
            is_superuser: false,
            needs_onboarding: true,
            access_token: "old-access",
            refresh_token: "old-refresh",
            expires_at: now + 60 * 60 * 1000,
            last_validated: now,
        },
    });
    return `${COOKIE}=${value}`;
}

/** The browser's update(): csrf first, then the POST with the handoff. */
async function browserUpdate(sessionHandoff: unknown) {
    const cookie = await sessionCookie();
    const csrfRes = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`, { headers: { cookie } }));
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const csrfCookie = csrfRes.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .find((c) => c.startsWith("authjs.csrf-token="));
    const res = await POST(
        new NextRequest(`${ORIGIN}/api/auth/session`, {
            method: "POST",
            headers: { cookie: `${cookie}; ${csrfCookie}`, "content-type": "application/json" },
            body: JSON.stringify({ csrfToken, data: { sessionHandoff } }),
        }),
    );
    const text = await res.text();
    const written = res.headers
        .getSetCookie()
        .filter((c) => c.startsWith(`${COOKIE}=`))
        .map((c) => c.split(";")[0].slice(COOKIE.length + 1))
        .filter(Boolean);
    expect(written).toHaveLength(1);
    const token = await decode({ secret: SECRET, salt: COOKIE, token: written[0] });
    return { status: res.status, text, token, cookie: `${COOKIE}=${written[0]}` };
}

describe("sealed session handoff through the real Auth.js update", () => {
    it.each([
        ["activeOrg", ACTIVE_ORG, { role: "admin" }],
        ["onboardComplete", ONBOARDED, { role: "owner" }],
    ] as const)(
        "%s: the session adopts the pair and the page never reads it",
        async (kind, pair, extra) => {
            const handoff = await auth.sealSessionHandoff(kind, pair, "user-1");
            // What the page holds is ciphertext.
            expect(handoff).not.toContain("new-access");
            expect(handoff).not.toContain("new-refresh");

            const { status, text, token, cookie } = await browserUpdate(handoff);
            expect(status).toBe(200);
            expect(token).toMatchObject({
                access_token: "new-access",
                refresh_token: "new-refresh",
                org_id: "org-2",
                needs_onboarding: false,
                ...extra,
            });
            expect(text).not.toContain("new-access");
            expect(text).not.toContain("new-refresh");
            expect((JSON.parse(text) as { user: { org_id: string } }).user.org_id).toBe("org-2");

            // The next session read sees the new org, still with no token.
            const next = await GET(
                new NextRequest(`${ORIGIN}/api/auth/session`, { headers: { cookie } }),
            );
            const nextText = await next.text();
            expect((JSON.parse(nextText) as { user: { org_id: string } }).user.org_id).toBe(
                "org-2",
            );
            expect(nextText).not.toContain("new-access");
            expect(fetchSpy).not.toHaveBeenCalled();
        },
    );

    const refused: [string, () => Promise<unknown>][] = [
        ["a forged string", async () => "not-a-sealed-handoff"],
        ["an empty string", async () => ""],
        ["a number", async () => 7],
        ["a plain object pair", async () => ACTIVE_ORG],
        [
            "a handoff for another user",
            () => auth.sealSessionHandoff("activeOrg", ACTIVE_ORG, "user-2"),
        ],
        [
            "an expired handoff",
            () =>
                encode({
                    secret: SECRET,
                    salt: auth.SESSION_HANDOFF_SALT,
                    maxAge: -60,
                    token: { sub: "user-1", kind: "activeOrg", pair: ACTIVE_ORG },
                }),
        ],
        [
            "a session cookie value (other salt)",
            async () =>
                encode({
                    secret: SECRET,
                    salt: COOKIE,
                    token: { sub: "user-1", kind: "activeOrg", pair: ACTIVE_ORG },
                }),
        ],
        [
            "a handoff sealed with another secret",
            () =>
                encode({
                    secret: "another-secret",
                    salt: "dev-health.session-handoff.v1",
                    token: { sub: "user-1", kind: "activeOrg", pair: ACTIVE_ORG },
                }),
        ],
        [
            "an unknown kind",
            () =>
                encode({
                    secret: SECRET,
                    salt: auth.SESSION_HANDOFF_SALT,
                    token: { sub: "user-1", kind: "superuser", pair: ACTIVE_ORG },
                }),
        ],
        [
            "a pair without an access token",
            () =>
                auth.sealSessionHandoff("activeOrg", { ...ACTIVE_ORG, access_token: "" }, "user-1"),
        ],
        [
            "an activeOrg pair without a user",
            () =>
                encode({
                    secret: SECRET,
                    salt: auth.SESSION_HANDOFF_SALT,
                    token: {
                        sub: "user-1",
                        kind: "activeOrg",
                        pair: { access_token: "new-access" },
                    },
                }),
        ],
    ];

    it.each(refused)("refuses %s: the session keeps its pair", async (_label, make) => {
        const { status, token } = await browserUpdate(await make());
        expect(status).toBe(200);
        expect(token).toMatchObject({
            access_token: "old-access",
            refresh_token: "old-refresh",
            org_id: "org-1",
        });
    });

    it("refuses to seal without a user id", async () => {
        await expect(auth.sealSessionHandoff("activeOrg", ACTIVE_ORG, "")).rejects.toThrow();
    });
});

describe("a handoff drops the service session token of the old pair (CHAOS-10876)", () => {
    async function update(handoff: string) {
        const now = Date.now();
        const value = await encode({
            secret: SECRET,
            salt: COOKIE,
            token: {
                sub: "user-1",
                id: "user-1",
                org_id: "org-1",
                role: "member",
                access_token: "old-access",
                refresh_token: "old-refresh",
                session_access_token: "old-service-token",
                session_expires_at: now + 3600_000,
                act_sub: "prn_OLDOLDOLDOLDOLDOLDOLDO",
                expires_at: now + 3600_000,
                last_validated: now,
            },
        });
        const cookie = `${COOKIE}=${value}`;
        const csrfRes = await GET(
            new NextRequest(`${ORIGIN}/api/auth/csrf`, { headers: { cookie } }),
        );
        const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
        const csrfCookie = csrfRes.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .find((c) => c.startsWith("authjs.csrf-token="));
        const res = await POST(
            new NextRequest(`${ORIGIN}/api/auth/session`, {
                method: "POST",
                headers: { cookie: `${cookie}; ${csrfCookie}`, "content-type": "application/json" },
                body: JSON.stringify({ csrfToken, data: { sessionHandoff: handoff } }),
            }),
        );
        const written = res.headers
            .getSetCookie()
            .filter((c) => c.startsWith(`${COOKIE}=`))
            .map((c) => c.split(";")[0].slice(COOKIE.length + 1));
        const token = await decode({ secret: SECRET, salt: COOKIE, token: written[0] });
        return { token, text: await res.text() };
    }

    it.each([
        ["activeOrg", ACTIVE_ORG],
        ["onboardComplete", ONBOARDED],
    ] as const)(
        "%s: the new pair replaces the access token and the old service token, expiry and actor are gone",
        async (kind, pair) => {
            const { token, text } = await update(
                await auth.sealSessionHandoff(kind, pair, "user-1"),
            );
            expect(token).toMatchObject({ access_token: "new-access" });
            expect(token?.session_access_token).toBeUndefined();
            expect(token?.session_expires_at).toBeUndefined();
            expect(token?.act_sub).toBeUndefined();
            expect(text).not.toContain("old-service-token");
        },
    );
});
