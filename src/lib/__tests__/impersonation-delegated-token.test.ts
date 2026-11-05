import { beforeEach, describe, expect, it, vi } from "vitest";

// The delegated token (go-api answers /impersonate start with `access_token` under
// AUTH_PROXY_IMPERSONATION) reaches the session as a sealed handoff. The administrator's own pair
// is never replaced: stop and status carry it, and an expired delegated token ends the
// impersonation through a stop (never a silent fall back to the administrator token).
// Real jwt + session callbacks, real seal, real server actions; only fetch and next-auth's own
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

import { sealSessionHandoff } from "@/lib/auth";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";
import { startImpersonation, stopImpersonation } from "@/lib/admin/server";

type Obj = Record<string, unknown>;
type Cb = {
    jwt: (p: Obj) => Promise<Obj>;
    session: (p: Obj) => Promise<Obj & { user: Obj; access_token?: string }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

const ADMIN = "access-admin-1";
const DELEGATED = "access-delegated-1";
const DELEGATED_SERVICE = "service-delegated-1";

const calls: { method: string; path: string; bearer: string | null }[] = [];
const backend = {
    statusImpersonating: true,
    stopStatus: 200,
    startBody: {} as Obj,
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

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

async function handoff(userId = "admin-1", exp = Date.now() + 600_000): Promise<string> {
    return sealSessionHandoff(
        "impersonation",
        {
            access_token: DELEGATED,
            session_access_token: DELEGATED_SERVICE,
            expires_in: Math.round((exp - Date.now()) / 1000),
        },
        userId,
    );
}

async function started(exp = Date.now() + 600_000): Promise<Obj> {
    return callbacks().jwt({
        token: adminToken(),
        user: null,
        account: null,
        trigger: "update",
        session: { impersonationChanged: true, sessionHandoff: await handoff("admin-1", exp) },
    });
}

beforeEach(() => {
    resetImpersonationStatusForTests();
    calls.length = 0;
    backend.statusImpersonating = true;
    backend.stopStatus = 200;
    backend.startBody = {};
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input).replace("http://backend.test", "");
            const headers = new Headers(init?.headers);
            const bearer = headers.get("authorization")?.replace("Bearer ", "") ?? null;
            calls.push({ method: init?.method ?? "GET", path: url, bearer });
            if (url.endsWith("/api/v1/admin/impersonate/status")) {
                // go-api refuses the delegated bearer on /api/v1/admin/*.
                if (bearer !== ADMIN) return json({ detail: "Forbidden" }, 403);
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
                if (bearer !== ADMIN) return json({ detail: "Forbidden" }, 403);
                if (backend.stopStatus !== 200) return json({ detail: "down" }, backend.stopStatus);
                backend.statusImpersonating = false;
                return json({ status: "stopped" });
            }
            if (url.endsWith("/api/v1/admin/impersonate")) {
                return json({
                    status: "impersonating",
                    target_user: {
                        id: "target-1",
                        email: "t@e.test",
                        org_id: "org-target",
                        role: "member",
                    },
                    expires_at: new Date(Date.now() + 600_000).toISOString(),
                    ...backend.startBody,
                });
            }
            return json([]);
        }),
    );
    sessionRead.mockResolvedValue({
        user: { id: "admin-1", is_superuser: true, is_impersonating: false },
        access_token: ADMIN,
    });
});

describe("start: the delegated token never reaches the browser", () => {
    it("R1 a delegated answer gives a sealed handoff and no token member", async () => {
        backend.startBody = {
            access_token: DELEGATED,
            session_access_token: DELEGATED_SERVICE,
            token_type: "Bearer",
            expires_in: 600,
        };
        const r = await startImpersonation("target-1");
        expect(r.error).toBeUndefined();
        const text = JSON.stringify(r.data);
        expect(text).not.toContain(DELEGATED);
        expect(text).not.toContain(DELEGATED_SERVICE);
        expect(r.data).not.toHaveProperty("access_token");
        expect((r.data as { sessionHandoff?: string }).sessionHandoff).toEqual(expect.any(String));
    });

    it("R9 an answer with no access_token (flag off) gives the old members only", async () => {
        const r = await startImpersonation("target-1");
        expect(r.error).toBeUndefined();
        expect(r.data).not.toHaveProperty("sessionHandoff");
        expect(Object.keys(r.data as Obj).sort()).toEqual(["expires_at", "status", "target_user"]);
    });
});

describe("session: delegated token in, administrator pair kept", () => {
    it("R2 the handoff sets the delegated fields and keeps the administrator pair", async () => {
        const token = await started();
        expect(token.access_token).toBe(ADMIN);
        expect(token.refresh_token).toBe("refresh-admin-1");
        expect(token.imp_access_token).toBe(DELEGATED);
        // The delegated service token is not kept (cookie byte budget).
        expect(token.imp_session_access_token).toBeUndefined();
        expect(JSON.stringify(token)).not.toContain(DELEGATED_SERVICE);
        expect(token.imp_expires_at).toEqual(expect.any(Number));
        expect(token).not.toHaveProperty("is_impersonating");
        expect(token.imp_access_token).toEqual(expect.any(String));
    });

    it("R3 the session carries the delegated token and the administrator's aside", async () => {
        const s = await callbacks().session({ session: { user: {} }, token: await started() });
        expect(s.access_token).toBe(DELEGATED);
        expect(s.session_access_token).toBeUndefined();
        expect(s.admin_access_token).toBe(ADMIN);
        expect(s.user.is_impersonating).toBe(true);
    });

    it("R9 without a handoff the session is the administrator's and has no aside", async () => {
        const token = await callbacks().jwt({
            token: adminToken(),
            user: null,
            account: null,
            trigger: "update",
            session: { impersonationChanged: true },
        });
        const s = await callbacks().session({ session: { user: {} }, token });
        expect(s.access_token).toBe(ADMIN);
        expect(s).not.toHaveProperty("admin_access_token");
        expect(token).not.toHaveProperty("imp_access_token");
    });

    it("R8 a handoff sealed for another user is refused", async () => {
        const token = await callbacks().jwt({
            token: adminToken(),
            user: null,
            account: null,
            trigger: "update",
            session: { sessionHandoff: await handoff("someone-else") },
        });
        expect(token.imp_access_token).toBeUndefined();
    });

    it("R8 a clear-text delegated token in update() is ignored", async () => {
        const token = await callbacks().jwt({
            token: adminToken(),
            user: null,
            account: null,
            trigger: "update",
            session: { imp_access_token: DELEGATED, access_token: DELEGATED },
        });
        expect(token.imp_access_token).toBeUndefined();
        expect(token.access_token).toBe(ADMIN);
    });
});

describe("stop and status use the administrator token", () => {
    it("R4 stop is called with the administrator token while a delegated one is live", async () => {
        const s = await callbacks().session({ session: { user: {} }, token: await started() });
        sessionRead.mockResolvedValue(s);
        calls.length = 0;
        const r = await stopImpersonation();
        expect(r.error).toBeUndefined();
        expect(calls.find((c) => c.path.endsWith("/impersonate/stop"))?.bearer).toBe(ADMIN);
    });

    it("the status poll of the jwt callback carries the administrator token", async () => {
        await started();
        const poll = calls.filter((c) => c.path.endsWith("/impersonate/status"));
        expect(poll.length).toBeGreaterThan(0);
        for (const c of poll) expect(c.bearer).toBe(ADMIN);
    });
});

describe("end of the delegated token", () => {
    const later = (token: Obj, trigger?: string) =>
        callbacks().jwt({ token, user: null, account: null, trigger });

    it("R4b status false clears the delegated fields and makes no stop call", async () => {
        const token = await started();
        backend.statusImpersonating = false;
        resetImpersonationStatusForTests();
        calls.length = 0;
        const next = await later(token, "update");
        expect(next.imp_access_token).toBeUndefined();
        expect(next.imp_session_access_token).toBeUndefined();
        expect(next.imp_expires_at).toBeUndefined();
        expect(next).not.toHaveProperty("is_impersonating");
        expect(calls.some((c) => c.path.endsWith("/impersonate/stop"))).toBe(false);
        const s = await callbacks().session({ session: { user: {} }, token: next });
        expect(s.access_token).toBe(ADMIN);
    });

    it("R6 expiry calls stop once with the administrator token, then drops the fields", async () => {
        const token = await started();
        const expired = { ...token, imp_expires_at: Date.now() - 1000 };
        resetImpersonationStatusForTests();
        calls.length = 0;
        const next = await later(expired, "update");
        const stops = calls.filter((c) => c.path.endsWith("/impersonate/stop"));
        expect(stops).toHaveLength(1);
        expect(stops[0].bearer).toBe(ADMIN);
        expect(next.imp_access_token).toBeUndefined();
        expect(next).not.toHaveProperty("is_impersonating");
    });

    it("R6b expiry with a failing stop keeps the delegated fields and serves no bearer", async () => {
        const token = await started();
        const expired = { ...token, imp_expires_at: Date.now() - 1000 };
        backend.stopStatus = 503;
        resetImpersonationStatusForTests();
        const next = await later(expired, "update");
        expect(next.imp_access_token).toBe(DELEGATED);
        expect(next).not.toHaveProperty("is_impersonating");
        expect(next.imp_access_token).toEqual(expect.any(String));
        const s = await callbacks().session({ session: { user: {} }, token: next });
        expect(s.access_token).toBeUndefined();
        expect(s).not.toHaveProperty("admin_access_token");
        expect((s as { error?: string }).error).toBe("impersonation_ending");
        // The next poll retries the stop.
        backend.stopStatus = 200;
        resetImpersonationStatusForTests();
        calls.length = 0;
        const retried = await later(next, "update");
        expect(calls.filter((c) => c.path.endsWith("/impersonate/stop"))).toHaveLength(1);
        expect(retried.imp_access_token).toBeUndefined();
    });
});
