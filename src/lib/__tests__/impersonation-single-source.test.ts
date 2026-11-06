import { beforeEach, describe, expect, it, vi } from "vitest";

// D6720: impersonating = the delegated token fields are present. No stored flag: the status read
// can only end an impersonation or refresh display data. Real jwt + session callbacks, real seal,
// real server actions and routes; only fetch and next-auth's own session reader are replaced.

const { nextAuthConfig, sessionRead, signOutSpy, logLines } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    sessionRead: vi.fn(),
    signOutSpy: vi.fn(),
    logLines: [] as { level: string; fields: unknown; msg: unknown }[],
}));

vi.mock("@/lib/logger", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/logger")>();
    const make = (): unknown => {
        const at = (level: string) => (fields: unknown, msg?: unknown) => {
            logLines.push({ level, fields, msg });
        };
        return {
            trace: at("trace"),
            debug: at("debug"),
            info: at("info"),
            warn: at("warn"),
            error: at("error"),
            fatal: at("fatal"),
            child: () => make(),
        };
    };
    return { ...original, logger: make() };
});

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
            signOut: signOutSpy,
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
import { requireSuperuserToken } from "@/lib/admin/server/_shared";
import { requireRole, requireSuperuser } from "@/lib/auth";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { POST as switchOrg } from "@/app/api/auth/switch-org/route";

import { fakeHandoffConsume } from "@/test/handoffConsume";

const ops = fakeHandoffConsume();

type Obj = Record<string, unknown>;
type Cb = {
    jwt: (p: Obj) => Promise<Obj>;
    session: (p: Obj) => Promise<Obj & { user: Obj; access_token?: string }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

const ADMIN = "access-admin-1";
const DELEGATED = "access-delegated-1";

type StatusMode = "true" | "false" | "503" | "429" | "network" | "not-json" | "non-boolean";

const calls: { method: string; path: string; bearer: string | null }[] = [];
const backend = { status: "true" as StatusMode, stop: 200, startToken: true };

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
        session_access_token: "service-admin-1",
        expires_at: Date.now() + 3_600_000,
        last_validated: Date.now(),
        ...extra,
    };
}

async function startHandoff(access_token = DELEGATED): Promise<string> {
    return sealSessionHandoff(
        "impersonation",
        { access_token, expires_in: 600, handoff_id: ops.issue() },
        "admin-1",
    );
}

const jwt = (token: Obj, session?: Obj) =>
    callbacks().jwt({ token, user: null, account: null, trigger: "update", session });

async function started(mode: StatusMode): Promise<Obj> {
    backend.status = mode;
    return jwt(adminToken(), { impersonationChanged: true, sessionHandoff: await startHandoff() });
}

const sessionOf = (token: Obj) => callbacks().session({ session: { user: {} }, token });

function post(body: unknown): Request {
    return new Request("http://web.test/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

const delegatedCalls = () => calls.filter((c) => c.bearer === DELEGATED);

beforeEach(() => {
    resetImpersonationStatusForTests();
    calls.length = 0;
    logLines.length = 0;
    backend.status = "true";
    backend.stop = 200;
    backend.startToken = true;
    signOutSpy.mockReset();
    signOutSpy.mockImplementation(async () => {
        sessionRead.mockResolvedValue(null);
    });
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (ops.handles(input)) return ops.answer(init);
            const url = String(input).replace("http://backend.test", "");
            const headers = new Headers(init?.headers);
            const bearer = headers.get("authorization")?.replace("Bearer ", "") ?? null;
            calls.push({ method: init?.method ?? "GET", path: url, bearer });
            if (url.endsWith("/api/v1/admin/impersonate/status")) {
                if (bearer !== ADMIN) return json({ detail: "Forbidden" }, 403);
                switch (backend.status) {
                    case "503":
                        return json({ detail: "down" }, 503);
                    case "429":
                        return json({ detail: "slow down" }, 429);
                    case "network":
                        throw new TypeError("fetch failed");
                    case "not-json":
                        return new Response("<html>gateway</html>", {
                            status: 200,
                            headers: { "content-type": "text/html" },
                        });
                    case "non-boolean":
                        return json({ is_impersonating: "true", target_user_id: "target-1" });
                    case "false":
                        return json({ is_impersonating: false });
                    default:
                        return json({
                            is_impersonating: true,
                            target_user_id: "target-1",
                            target_email: "target@example.test",
                            target_org_id: "org-target",
                        });
                }
            }
            if (url.endsWith("/api/v1/admin/impersonate/stop")) {
                if (bearer !== ADMIN) return json({ detail: "Forbidden" }, 403);
                if (backend.stop !== 200) return json({ detail: "down" }, backend.stop);
                return json({ status: "stopped" });
            }
            if (url.endsWith("/api/v1/admin/impersonate")) {
                if (bearer !== ADMIN) return json({ detail: "Forbidden" }, 403);
                return json({
                    status: "impersonating",
                    target_user: {
                        id: "target-1",
                        email: "t@e.test",
                        org_id: "org-target",
                        role: "member",
                    },
                    expires_at: new Date(Date.now() + 600_000).toISOString(),
                    ...(backend.startToken
                        ? { access_token: DELEGATED, token_type: "Bearer", expires_in: 600 }
                        : {}),
                });
            }
            return json({ detail: "unexpected" }, 500);
        }),
    );
    sessionRead.mockResolvedValue({
        user: { id: "admin-1", is_superuser: true, is_impersonating: false },
        access_token: ADMIN,
    });
});

const FAILED_READS: StatusMode[] = ["503", "429", "network", "not-json", "non-boolean"];

describe("S1 start, then the forced status read fails: the token says impersonating", () => {
    it.each(FAILED_READS)("status %s: the session reports impersonating", async (mode) => {
        const token = await started(mode);
        expect(token.imp_access_token).toBe(DELEGATED);
        const s = await sessionOf(token);
        expect(s.access_token).toBe(DELEGATED);
        expect(s.user.is_impersonating).toBe(true);
        expect(s.admin_access_token).toBe(ADMIN);
    });

    it.each(FAILED_READS)(
        "status %s: change-password refuses 403, no backend call",
        async (mode) => {
            sessionRead.mockResolvedValue(await sessionOf(await started(mode)));
            calls.length = 0;
            const res = await changePassword(post({ current_password: "a", new_password: "b" }));
            expect(res.status).toBe(403);
            expect(calls).toEqual([]);
        },
    );

    it.each(FAILED_READS)("status %s: switch-org refuses 403, no backend call", async (mode) => {
        sessionRead.mockResolvedValue(await sessionOf(await started(mode)));
        calls.length = 0;
        const res = await switchOrg(post({ org_id: "org-other" }));
        expect(res.status).toBe(403);
        expect(calls).toEqual([]);
    });

    it.each(FAILED_READS)("status %s: a platform action is refused 403", async (mode) => {
        sessionRead.mockResolvedValue(await sessionOf(await started(mode)));
        await expect(requireSuperuserToken({ action: "admin.orgs" })).rejects.toMatchObject({
            status: 403,
        });
    });

    it.each(FAILED_READS)("status %s: requireRole and requireSuperuser refuse", async (mode) => {
        sessionRead.mockResolvedValue(await sessionOf(await started(mode)));
        await expect(requireRole(["admin", "owner"])).rejects.toThrow("NEXT_REDIRECT:/dashboard");
        await expect(requireSuperuser("/superadmin")).rejects.toThrow("NEXT_REDIRECT");
    });

    it.each(FAILED_READS)("status %s: an ended delegated token serves no bearer", async (mode) => {
        const token = await started(mode);
        backend.stop = 503;
        resetImpersonationStatusForTests();
        const next = await jwt({ ...token, imp_expires_at: Date.now() - 1000 });
        const s = await sessionOf(next);
        expect(s.access_token).toBeUndefined();
        expect(s).not.toHaveProperty("admin_access_token");
        expect(s.user.is_impersonating).toBe(true);
    });

    it.each(FAILED_READS)("status %s: the admin bearer is the administrator's", async (mode) => {
        sessionRead.mockResolvedValue(await sessionOf(await started(mode)));
        const bearer = await requireSuperuserToken({
            action: "admin.impersonate",
            allowImpersonating: true,
            guard: "unmapped",
        });
        expect(bearer).toBe(ADMIN);
        expect(bearer).not.toBe(DELEGATED);
    });
});

describe("S2 the status read never turns impersonation on", () => {
    it("status true with no delegated token: not impersonating, administrator bearer", async () => {
        backend.status = "true";
        const token = await jwt(adminToken(), { impersonationChanged: true });
        const s = await sessionOf(token);
        expect(s.user.is_impersonating).toBe(false);
        expect(s.access_token).toBe(ADMIN);
        expect(s.user.org_id).toBe("org-admin");
        expect(s).not.toHaveProperty("admin_access_token");
    });

    it("the JWT holds no stored impersonation flag after start, status or end", async () => {
        const token = await started("true");
        expect(token).not.toHaveProperty("is_impersonating");
        backend.status = "false";
        resetImpersonationStatusForTests();
        const ended = await jwt(token, { impersonationChanged: true });
        expect(ended.imp_access_token).toBeUndefined();
        expect(ended).not.toHaveProperty("is_impersonating");
    });

    it("a stale stored flag in an old cookie is ignored", async () => {
        backend.status = "503";
        const token = await jwt(adminToken({ is_impersonating: true }), {
            impersonationChanged: true,
        });
        const s = await sessionOf(token);
        expect(s.user.is_impersonating).toBe(false);
        expect(s.access_token).toBe(ADMIN);
    });
});

describe("S3 stop, then the status read fails: no delegated bearer is served", () => {
    it.each(FAILED_READS)("status %s after a successful stop", async (mode) => {
        const token = await started("true");
        sessionRead.mockResolvedValue(await sessionOf(token));
        const r = await stopImpersonation();
        expect(r.error).toBeUndefined();
        const handoff = (r.data as { sessionHandoff?: unknown }).sessionHandoff;
        expect(handoff).toEqual(expect.any(String));
        expect(JSON.stringify(r.data)).not.toContain(DELEGATED);
        backend.status = mode;
        resetImpersonationStatusForTests();
        calls.length = 0;
        const next = await jwt(token, { impersonationChanged: true, sessionHandoff: handoff });
        expect(next.imp_access_token).toBeUndefined();
        expect(next.imp_expires_at).toBeUndefined();
        const s = await sessionOf(next);
        expect(s.access_token).toBe(ADMIN);
        expect(s.user.is_impersonating).toBe(false);
        expect(s).not.toHaveProperty("admin_access_token");
        expect(delegatedCalls()).toEqual([]);
    });

    it("an end handoff for another delegated token does not end this one", async () => {
        const token = await started("true");
        const other = await sealSessionHandoff(
            "impersonationEnd",
            { access_token: "access-delegated-old" },
            "admin-1",
        );
        backend.status = "503";
        resetImpersonationStatusForTests();
        const next = await jwt(token, { impersonationChanged: true, sessionHandoff: other });
        expect(next.imp_access_token).toBe(DELEGATED);
        expect((await sessionOf(next)).user.is_impersonating).toBe(true);
    });

    it("an end handoff sealed for another user is refused", async () => {
        const token = await started("true");
        const other = await sealSessionHandoff(
            "impersonationEnd",
            { access_token: DELEGATED },
            "someone-else",
        );
        backend.status = "503";
        resetImpersonationStatusForTests();
        const next = await jwt(token, { impersonationChanged: true, sessionHandoff: other });
        expect(next.imp_access_token).toBe(DELEGATED);
    });

    it("an end handoff while not impersonating changes nothing", async () => {
        const end = await sealSessionHandoff(
            "impersonationEnd",
            { access_token: DELEGATED },
            "admin-1",
        );
        backend.status = "503";
        const next = await jwt(adminToken(), { sessionHandoff: end });
        expect(next.access_token).toBe(ADMIN);
        expect(next.refresh_token).toBe("refresh-admin-1");
        expect(next.session_access_token).toBe("service-admin-1");
        expect(next.imp_access_token).toBeUndefined();
    });

    it("a stop with no delegated token gives no handoff", async () => {
        const r = await stopImpersonation();
        expect(r.error).toBeUndefined();
        expect(r.data).not.toHaveProperty("sessionHandoff");
    });
});

describe("S4 the delegated bearer lives only in the imp_* fields (acp cond. A)", () => {
    it.each(["true", ...FAILED_READS] as StatusMode[])(
        "status %s: no other JWT field holds it",
        async (mode) => {
            const token = await started(mode);
            const holders = Object.entries(token)
                .filter(([, v]) => typeof v === "string" && v.includes(DELEGATED))
                .map(([k]) => k);
            expect(holders).toEqual(["imp_access_token"]);
            expect(token.access_token).toBe(ADMIN);
            expect(token.session_access_token).toBe("service-admin-1");
        },
    );
});

const stopEvents = () =>
    logLines.filter(
        (l) =>
            l.level === "error" &&
            (l.fields as { event?: string }).event === "impersonation_stop_not_recorded",
    );

describe("S5 a start answer with no delegated token is refused (acp option A)", () => {
    beforeEach(() => {
        backend.startToken = false;
    });

    it("the start is stopped at once with the administrator bearer and refused", async () => {
        const r = await startImpersonation("target-1");
        expect(r.data).toBeUndefined();
        expect(r.error).toBe("Impersonation needs the delegated token. It was stopped.");
        const stops = calls.filter((c) => c.path.endsWith("/impersonate/stop"));
        expect(stops).toHaveLength(1);
        expect(stops[0].bearer).toBe(ADMIN);
        expect(signOutSpy).not.toHaveBeenCalled();
        expect(stopEvents()).toEqual([]);
    });

    it("imp_* is never set: the next session read is not impersonating", async () => {
        await startImpersonation("target-1");
        backend.status = "true";
        resetImpersonationStatusForTests();
        const next = await jwt(adminToken(), { impersonationChanged: true });
        expect(next.imp_access_token).toBeUndefined();
        expect(next.imp_expires_at).toBeUndefined();
        const s = await sessionOf(next);
        expect(s.user.is_impersonating).toBe(false);
        expect(s.access_token).toBe(ADMIN);
        expect(s).not.toHaveProperty("admin_access_token");
    });

    it("a failed stop signs the user out and logs the loud event", async () => {
        backend.stop = 503;
        const r = await startImpersonation("target-1");
        expect(r.data).toBeUndefined();
        expect(r.error).toBe("Impersonation needs the delegated token. It was stopped.");
        expect(signOutSpy).toHaveBeenCalledTimes(1);
        expect(signOutSpy).toHaveBeenCalledWith({ redirect: false });
        const events = stopEvents();
        expect(events).toHaveLength(1);
        expect(events[0].fields).toEqual({
            event: "impersonation_stop_not_recorded",
            reason: "start_without_delegated_token",
            user_id: "admin-1",
            target_user_id: "target-1",
            org_id: "org-target",
        });
        expect(JSON.stringify(events)).not.toContain(ADMIN);
        expect(JSON.stringify(events)).not.toContain("@");
    });

    it("after a failed stop every guard refuses", async () => {
        backend.stop = 503;
        await startImpersonation("target-1");
        calls.length = 0;
        expect(
            (await changePassword(post({ current_password: "a", new_password: "b" }))).status,
        ).toBe(401);
        expect((await switchOrg(post({ org_id: "org-other" }))).status).toBe(401);
        await expect(requireSuperuserToken({ action: "admin.orgs" })).rejects.toMatchObject({
            status: 401,
        });
        await expect(requireSuperuser("/superadmin")).rejects.toThrow("NEXT_REDIRECT:/auth/signin");
        await expect(requireRole(["admin", "owner"])).rejects.toThrow("NEXT_REDIRECT:/auth/signin");
        expect(calls).toEqual([]);
    });
});
