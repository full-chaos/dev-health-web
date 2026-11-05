import { beforeEach, describe, expect, it, vi } from "vitest";

// While an impersonation is live, no JWT-callback path may replace the administrator's pair:
// switch-org and change-password (activeOrg handoff), workspace onboarding (onboardComplete
// handoff), refresh, and an SSO ticket. For each path: (a) the administrator pair and flag
// survive, (b) stop still works with the administrator token, (c) no delegated token outlives
// the stop. Real jwt + session callbacks, real routes and seal; only fetch and next-auth's own
// session reader are replaced.

const { nextAuthConfig, sessionRead } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    sessionRead: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    redirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    }),
}));
vi.mock("next/headers", () => ({
    headers: async () => new Headers(),
    cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next-auth", () => ({
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: sessionRead,
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

import { sealSessionHandoff, sealSsoTicket } from "@/lib/auth";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";
import { stopImpersonation } from "@/lib/admin/server";
import { POST as switchOrg } from "@/app/api/auth/switch-org/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";

type Obj = Record<string, unknown>;
type Cb = {
    jwt: (p: Obj) => Promise<Obj>;
    session: (p: Obj) => Promise<Obj & { user: Obj; access_token?: string }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const at = (name: string) =>
    `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(
        JSON.stringify({ sub: name, exp: Math.floor(Date.now() / 1000) + 3600 }),
    )}.c2ln`;

const ADMIN = "access-admin-1";
const ADMIN_2 = at("admin-1-rotated");
const DELEGATED = "access-delegated-1";
const DELEGATED_SERVICE = "service-delegated-1";
const TARGET_B = "access-target-org-b";
const TARGET_B_REFRESH = "refresh-target-org-b";

const calls: { method: string; path: string; bearer: string | null; body: string }[] = [];
const backend = { statusImpersonating: true, adminTokens: new Set<string>() };

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const targetPair = {
    access_token: TARGET_B,
    refresh_token: TARGET_B_REFRESH,
    expires_in: 3600,
    user: { org_id: "org-b", role: "member", is_superuser: false },
};

function adminToken(extra: Obj = {}): Obj {
    return {
        id: "admin-1",
        sub: "admin-1",
        org_id: "org-admin",
        role: "member",
        is_superuser: true,
        access_token: ADMIN,
        refresh_token: "refresh-admin-1",
        expires_at: Date.now() + 3_600_000,
        last_validated: Date.now(),
        ...extra,
    };
}

async function started(extra: Obj = {}): Promise<Obj> {
    const sessionHandoff = await sealSessionHandoff(
        "impersonation",
        { access_token: DELEGATED, session_access_token: DELEGATED_SERVICE, expires_in: 600 },
        "admin-1",
    );
    return callbacks().jwt({
        token: adminToken(extra),
        user: null,
        account: null,
        trigger: "update",
        session: { impersonationChanged: true, sessionHandoff },
    });
}

const session = (token: Obj) => callbacks().session({ session: { user: {} }, token });
const update = (token: Obj, sessionHandoff?: string) =>
    callbacks().jwt({
        token,
        user: null,
        account: null,
        trigger: "update",
        session: sessionHandoff ? { sessionHandoff } : {},
    });

// The three questions, asked of the token a path left behind.
async function expectAdminKept(token: Obj, adminAccess = ADMIN, adminRefresh = "refresh-admin-1") {
    expect(token.access_token).toBe(adminAccess);
    expect(token.refresh_token).toBe(adminRefresh);
    expect(token.is_superuser).toBe(true);
    expect(token.org_id).toBe("org-admin");
    expect(token.imp_access_token).toBe(DELEGATED);
    const s = await session(token);
    expect(s.access_token).toBe(DELEGATED);
    expect(s.admin_access_token).toBe(adminAccess);
    expect(s.user.is_superuser).toBe(true);
    expect(s.user.is_impersonating).toBe(true);
}

async function expectStopWorks(token: Obj, adminAccess = ADMIN) {
    sessionRead.mockResolvedValue(await session(token));
    calls.length = 0;
    const r = await stopImpersonation();
    expect(r.error).toBeUndefined();
    const stops = calls.filter((c) => c.path.endsWith("/impersonate/stop"));
    expect(stops).toHaveLength(1);
    expect(stops[0].bearer).toBe(adminAccess);
}

async function expectNothingOutlivesStop(token: Obj, adminAccess = ADMIN) {
    await expectStopWorks(token, adminAccess);
    resetImpersonationStatusForTests();
    const after = await update(token);
    expect(after.imp_access_token).toBeUndefined();
    expect(after.imp_session_access_token).toBeUndefined();
    expect(after.imp_expires_at).toBeUndefined();
    expect(after).not.toHaveProperty("is_impersonating");
    const text = JSON.stringify(after);
    expect(text).not.toContain(DELEGATED);
    expect(text).not.toContain(TARGET_B);
    const s = await session(after);
    expect(s.access_token).toBe(adminAccess);
    expect(s).not.toHaveProperty("admin_access_token");
}

beforeEach(() => {
    resetImpersonationStatusForTests();
    calls.length = 0;
    backend.statusImpersonating = true;
    backend.adminTokens = new Set([ADMIN, ADMIN_2]);
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input).replace("http://backend.test", "");
            const headers = new Headers(init?.headers);
            const bearer = headers.get("authorization")?.replace("Bearer ", "") ?? null;
            const body = typeof init?.body === "string" ? init.body : "";
            calls.push({ method: init?.method ?? "GET", path: url, bearer, body });
            const admin = bearer !== null && backend.adminTokens.has(bearer);
            if (url.endsWith("/api/v1/admin/impersonate/status")) {
                if (!admin) return json({ detail: "Forbidden" }, 403);
                return json(
                    backend.statusImpersonating
                        ? {
                              is_impersonating: true,
                              target_user_id: "target-1",
                              target_email: "target@example.test",
                              target_org_id: "org-target",
                          }
                        : { is_impersonating: false },
                );
            }
            if (url.endsWith("/api/v1/admin/impersonate/stop")) {
                if (!admin) return json({ detail: "Forbidden" }, 403);
                backend.statusImpersonating = false;
                return json({ status: "stopped" });
            }
            // The delegated bearer acts as the target user: these answer the target's pair.
            if (url.endsWith("/api/v1/auth/switch-org")) return json(targetPair);
            if (url.endsWith("/api/v1/auth/change-password")) return json(targetPair);
            if (url.endsWith("/api/v1/auth/refresh")) {
                const sent = JSON.parse(body) as { refresh_token?: string };
                if (sent.refresh_token === "refresh-admin-1") {
                    return json({
                        access_token: ADMIN_2,
                        refresh_token: "refresh-admin-2",
                        expires_in: 3600,
                        user: {
                            id: "admin-1",
                            email: "admin@example.test",
                            org_id: "org-admin",
                            role: "member",
                            is_superuser: true,
                        },
                    });
                }
                return json({
                    access_token: at("target-1-rotated"),
                    refresh_token: "refresh-target-rotated",
                    expires_in: 3600,
                    user: {
                        id: "target-1",
                        email: "target@example.test",
                        org_id: "org-b",
                        role: "member",
                        is_superuser: false,
                    },
                });
            }
            return json([]);
        }),
    );
});

const post = (path: string, body: unknown) =>
    new Request(`http://web.test${path}`, { method: "POST", body: JSON.stringify(body) });

// While impersonating, both routes refuse before any backend call (no service token is held, and
// the pair is the administrator's). The jwt guard is still asked about the handoff those routes
// mint, as one sealed before the impersonation started would arrive (120 s life).
async function refusedWhileImpersonating(res: Response) {
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not available while impersonating" });
    expect(calls).toHaveLength(0);
}

async function switchOrgHandoff(token: Obj): Promise<string> {
    sessionRead.mockResolvedValue(await session(token));
    calls.length = 0;
    await refusedWhileImpersonating(
        await switchOrg(post("/api/auth/switch-org", { org_id: "org-b" })),
    );
    return sealSessionHandoff("activeOrg", targetPair, "admin-1");
}

async function changePasswordHandoff(token: Obj): Promise<string> {
    sessionRead.mockResolvedValue(await session(token));
    calls.length = 0;
    await refusedWhileImpersonating(
        await changePassword(
            post("/api/auth/change-password", { current_password: "a", new_password: "b" }),
        ),
    );
    return sealSessionHandoff("activeOrg", targetPair, "admin-1");
}

describe("G1 switch-org (activeOrg handoff) while impersonating", () => {
    it("G1a the administrator pair and flag survive", async () => {
        const token = await started();
        await expectAdminKept(await update(token, await switchOrgHandoff(token)));
    });
    it("G1b stop still works with the administrator token", async () => {
        const token = await started();
        await expectStopWorks(await update(token, await switchOrgHandoff(token)));
    });
    it("G1c no delegated token outlives the stop", async () => {
        const token = await started();
        await expectNothingOutlivesStop(await update(token, await switchOrgHandoff(token)));
    });
});

describe("G2 change-password (activeOrg handoff) while impersonating", () => {
    it("G2a the administrator pair and flag survive", async () => {
        const token = await started();
        await expectAdminKept(await update(token, await changePasswordHandoff(token)));
    });
    it("G2b stop still works with the administrator token", async () => {
        const token = await started();
        await expectStopWorks(await update(token, await changePasswordHandoff(token)));
    });
    it("G2c no delegated token outlives the stop", async () => {
        const token = await started();
        await expectNothingOutlivesStop(await update(token, await changePasswordHandoff(token)));
    });
});

describe("G3 onboardComplete handoff while impersonating", () => {
    const onboard = () =>
        sealSessionHandoff(
            "onboardComplete",
            { access_token: TARGET_B, refresh_token: TARGET_B_REFRESH, org_id: "org-b" },
            "admin-1",
        );
    it("G3a the administrator pair and flag survive", async () => {
        await expectAdminKept(await update(await started(), await onboard()));
    });
    it("G3b stop still works with the administrator token", async () => {
        await expectStopWorks(await update(await started(), await onboard()));
    });
    it("G3c no delegated token outlives the stop", async () => {
        await expectNothingOutlivesStop(await update(await started(), await onboard()));
    });
});

describe("G4 refresh while impersonating", () => {
    const expired = () => started({ expires_at: Date.now() - 1000 });
    const refreshBodies = () =>
        calls.filter((c) => c.path.endsWith("/api/v1/auth/refresh")).map((c) => c.body);

    it("G4a the refresh rotates the administrator's own pair; the flag survives", async () => {
        const token = await expired();
        expect(refreshBodies()).toEqual([JSON.stringify({ refresh_token: "refresh-admin-1" })]);
        await expectAdminKept(token, ADMIN_2, "refresh-admin-2");
    });
    it("G4b stop still works with the rotated administrator token", async () => {
        await expectStopWorks(await expired(), ADMIN_2);
    });
    it("G4c no delegated token outlives the stop", async () => {
        await expectNothingOutlivesStop(await expired(), ADMIN_2);
    });
    it("G4d a refresh after a refused switch-org handoff still rotates the administrator's pair", async () => {
        const token = await started();
        const next = await update(token, await switchOrgHandoff(token));
        calls.length = 0;
        const refreshed = await update({ ...next, expires_at: Date.now() - 1000 });
        expect(refreshBodies()).toEqual([JSON.stringify({ refresh_token: "refresh-admin-1" })]);
        await expectAdminKept(refreshed, ADMIN_2, "refresh-admin-2");
        await expectNothingOutlivesStop(refreshed, ADMIN_2);
    });
});

describe("G5 SSO ticket while impersonating", () => {
    const ticket = () =>
        sealSsoTicket({
            userId: "admin-1",
            orgId: "org-b",
            accessToken: TARGET_B,
            refreshToken: TARGET_B_REFRESH,
        } as Parameters<typeof sealSsoTicket>[0]);

    it("G5a an SSO ticket offered as a session handoff writes nothing", async () => {
        await expectAdminKept(await update(await started(), await ticket()));
    });
    it("G5b stop still works after the ticket is offered", async () => {
        await expectStopWorks(await update(await started(), await ticket()));
    });
    it("G5c an SSO sign-in carries no delegated token or impersonation state into the new session", async () => {
        const token = await started();
        const signedIn = await callbacks().jwt({
            token,
            user: {
                id: "sso-user-1",
                org_id: "org-b",
                role: "member",
                is_superuser: false,
                needs_onboarding: false,
                access_token: TARGET_B,
                refresh_token: TARGET_B_REFRESH,
                expires_in: 3600,
            },
            account: { provider: "sso", type: "credentials" },
            trigger: "signIn",
        });
        expect(signedIn.imp_access_token).toBeUndefined();
        expect(signedIn.imp_session_access_token).toBeUndefined();
        expect(signedIn).not.toHaveProperty("is_impersonating");
        expect(JSON.stringify(signedIn)).not.toContain(DELEGATED);
        const s = await session(signedIn);
        expect(s.access_token).toBe(TARGET_B);
        expect(s).not.toHaveProperty("admin_access_token");
        expect(s.user.is_impersonating).toBe(false);
    });
    it("G5d the administrator, signed in again after an SSO sign-in, can still stop", async () => {
        // The backend row is still open: the next administrator session sees it and stops it.
        const signedIn = await callbacks().jwt({
            token: {},
            user: {
                id: "admin-1",
                org_id: "org-admin",
                role: "member",
                is_superuser: true,
                access_token: ADMIN,
                refresh_token: "refresh-admin-1",
                expires_in: 3600,
            },
            account: { provider: "credentials", type: "credentials" },
            trigger: "signIn",
        });
        const polled = await update(signedIn);
        // No delegated token: the status answer does not start an impersonation (D6720).
        expect(polled).not.toHaveProperty("is_impersonating");
        expect(polled.imp_access_token).toBeUndefined();
        const s = await session(polled);
        expect(s.user.is_impersonating).toBe(false);
        sessionRead.mockResolvedValue(s);
        calls.length = 0;
        expect((await stopImpersonation()).error).toBeUndefined();
        expect(calls.find((c) => c.path.endsWith("/impersonate/stop"))?.bearer).toBe(ADMIN);
    });
});
