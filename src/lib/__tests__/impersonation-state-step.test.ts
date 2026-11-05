import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// One ordered impersonation state step runs first in the JWT callback: an expired delegated token
// is stopped with a live administrator bearer (refreshed inside the step when needed) before any
// refresh or handoff branch can return. imp_* goes only on a successful stop; a kept, expired
// delegated token serves no bearer at all; with no live bearer the session ends and one
// "impersonation stop not recorded" event is logged. Real jwt + session callbacks and real seal;
// fetch, the logger and next-auth's own session reader are replaced.

const { nextAuthConfig, sessionRead, logLines } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    sessionRead: vi.fn(),
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

import { decode } from "next-auth/jwt";
import { requireSession, SESSION_HANDOFF_SALT, sealSessionHandoff } from "@/lib/auth";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";
import { startImpersonation, stopImpersonation } from "@/lib/admin/server";

type Obj = Record<string, unknown>;
type Cb = {
    jwt: (p: Obj) => Promise<Obj>;
    session: (p: Obj) => Promise<Obj & { user: Obj; access_token?: string; error?: string }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const jwtOf = (claims: Obj) =>
    `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify(claims))}.c2ln`;

const MIN = 60_000;
const ADMIN = "access-admin-1";
const ADMIN_REFRESH = "refresh-admin-1";
const ADMIN_2 = jwtOf({ sub: "admin-1", exp: Math.floor(Date.now() / 1000) + 3600 });
// auth-service's delegated session id (its session row and audit row) and its wire form, the sid.
const DELEGATION_ID = "7f3a2b1c-0d4e-4f5a-8b6c-9d0e1f2a3b4c";
const SID = `ses_${Buffer.from(DELEGATION_ID.replace(/-/g, ""), "hex").toString("base64url")}`;
const DELEGATED = jwtOf({ sub: "target-1", sid: SID, exp: 4102444800 });
const DELEGATED_SERVICE = "service-delegated-1";
const DELEGATED_REFRESH = "refresh-delegated-1";

type Refresh = "ok" | 429 | 503 | "network" | "invalid_grant";
type StopOutcome = "ok" | 400 | 429 | 503 | "network" | 401 | 403;
type StatusAnswer =
    | "true"
    | "false"
    | 500
    | 429
    | 503
    | "network"
    | "missing-field"
    | "null"
    | "non-boolean"
    | "non-json";

const calls: { path: string; bearer: string | null; body: string; at: number }[] = [];
const backend = {
    statusImpersonating: true,
    refresh: "ok" as Refresh,
    stop: "ok" as StopOutcome,
    status: undefined as StatusAnswer | undefined,
    startBody: {} as Obj,
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

beforeEach(() => {
    resetImpersonationStatusForTests();
    calls.length = 0;
    logLines.length = 0;
    backend.statusImpersonating = true;
    backend.refresh = "ok";
    backend.stop = "ok";
    backend.status = undefined;
    backend.startBody = {};
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = String(input).replace("http://backend.test", "");
            const bearer =
                new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? null;
            const body = typeof init?.body === "string" ? init.body : "";
            calls.push({ path, bearer, body, at: Date.now() });
            const admin = bearer === ADMIN || bearer === ADMIN_2;
            if (path.endsWith("/api/v1/auth/refresh")) {
                const r = backend.refresh;
                if (r === "network") throw new TypeError("fetch failed");
                if (r === "invalid_grant") return json({ error: "invalid_grant" }, 400);
                if (r !== "ok") return json({ detail: "busy" }, r);
                if ((JSON.parse(body) as Obj).refresh_token !== ADMIN_REFRESH) {
                    return json({ error: "invalid_grant" }, 400);
                }
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
            if (path.endsWith("/api/v1/admin/impersonate/status")) {
                if (!admin) return json({ detail: "Forbidden" }, 403);
                const forced = backend.status;
                if (forced === "network") throw new TypeError("fetch failed");
                if (typeof forced === "number") return json({ detail: "busy" }, forced);
                if (forced === "false") return json({ is_impersonating: false });
                if (forced === "missing-field") return json({ target_user_id: "target-1" });
                if (forced === "null") return json({ is_impersonating: null });
                if (forced === "non-boolean") return json({ is_impersonating: "false" });
                if (forced === "non-json") {
                    return new Response("<html>ok</html>", {
                        status: 200,
                        headers: { "content-type": "text/html" },
                    });
                }
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
            if (path.endsWith("/api/v1/admin/impersonate/stop")) {
                if (!admin) return json({ detail: "Forbidden" }, 403);
                const s = backend.stop;
                if (s === "network") throw new TypeError("fetch failed");
                if (s !== "ok") return json({ detail: "refused" }, s);
                backend.statusImpersonating = false;
                return json({ status: "stopped" });
            }
            if (path.endsWith("/api/v1/admin/impersonate")) {
                return json({
                    status: "active",
                    target_user: {
                        id: "target-1",
                        email: "target@example.test",
                        org_id: "org-target",
                        role: "member",
                    },
                    expires_at: new Date(Date.now() + 15 * MIN).toISOString(),
                    ...backend.startBody,
                });
            }
            return json({ valid: true });
        }),
    );
});

type DelegatedState = "valid" | "expired";
type AdminState = "valid" | "near-expiry" | "expired";

async function impersonating(delegated: DelegatedState, admin: AdminState): Promise<Obj> {
    const sessionHandoff = await sealSessionHandoff(
        "impersonation",
        { access_token: DELEGATED, session_access_token: DELEGATED_SERVICE, expires_in: 600 },
        "admin-1",
    );
    const token = await callbacks().jwt({
        token: {
            id: "admin-1",
            sub: "admin-1",
            org_id: "org-admin",
            role: "member",
            is_superuser: true,
            access_token: ADMIN,
            refresh_token: ADMIN_REFRESH,
            expires_at: Date.now() + 60 * MIN,
            last_validated: Date.now(),
        },
        user: null,
        account: null,
        trigger: "update",
        session: { sessionHandoff },
    });
    expect(token.imp_access_token).toBe(DELEGATED);
    const now = Date.now();
    return {
        ...token,
        imp_expires_at: delegated === "valid" ? now + 10 * MIN : now - 1000,
        expires_at:
            admin === "valid"
                ? now + 60 * MIN
                : admin === "near-expiry"
                  ? now + 4 * MIN
                  : now - 1000,
    };
}

const later = (token: Obj, extra: Obj = {}) =>
    callbacks().jwt({ token, user: null, account: null, trigger: "update", ...extra });
const session = (token: Obj) => callbacks().session({ session: { user: {} }, token });
const stops = () => calls.filter((c) => c.path.endsWith("/impersonate/stop"));
const refreshes = () => calls.filter((c) => c.path.endsWith("/auth/refresh"));
const stopNotRecorded = () =>
    logLines.filter((l) => l.level === "error" && l.msg === "impersonation stop not recorded");

// Bearer rules for every outgoing call of one jwt run.
function expectBearers(adminExpired: boolean) {
    for (const c of calls) {
        expect(c.bearer).not.toBe(DELEGATED);
        expect(c.body).not.toContain(DELEGATED);
        expect(c.body).not.toContain(DELEGATED_SERVICE);
        if (adminExpired) expect(c.bearer).not.toBe(ADMIN);
    }
    for (const r of refreshes()) {
        expect(r.bearer).toBeNull();
        expect(JSON.parse(r.body)).toEqual({ refresh_token: ADMIN_REFRESH });
    }
    expect(refreshes().length).toBeLessThanOrEqual(1);
}

type Expect = {
    stop: string | null;
    imp: "kept" | "cleared";
    event: boolean;
    sessionBearer: string | undefined;
    error?: string;
};

function expected(d: DelegatedState, a: AdminState, r: Refresh): Expect {
    const transient = r === 429 || r === 503 || r === "network";
    if (d === "valid") {
        if (a === "valid" || r === "ok") {
            return { stop: null, imp: "kept", event: false, sessionBearer: DELEGATED };
        }
        if (transient) {
            return {
                stop: null,
                imp: "kept",
                event: false,
                sessionBearer: DELEGATED,
                error: "refresh_unavailable",
            };
        }
        // invalid_grant: the session ends; a still-live admin bearer stops first.
        return a === "near-expiry"
            ? {
                  stop: ADMIN,
                  imp: "cleared",
                  event: false,
                  sessionBearer: undefined,
                  error: "refresh_failed",
              }
            : {
                  stop: null,
                  imp: "cleared",
                  event: true,
                  sessionBearer: undefined,
                  error: "refresh_failed",
              };
    }
    if (a === "valid") return { stop: ADMIN, imp: "cleared", event: false, sessionBearer: ADMIN };
    if (r === "ok") return { stop: ADMIN_2, imp: "cleared", event: false, sessionBearer: ADMIN_2 };
    if (a === "near-expiry") {
        return {
            stop: ADMIN,
            imp: "cleared",
            event: false,
            sessionBearer: undefined,
            error: transient ? "refresh_unavailable" : "refresh_failed",
        };
    }
    // Case (c): no live bearer.
    return {
        stop: null,
        imp: "cleared",
        event: true,
        sessionBearer: undefined,
        error: "refresh_failed",
    };
}

const REFRESH: Refresh[] = ["ok", 429, 503, "network", "invalid_grant"];
const DELEGATED_STATES: DelegatedState[] = ["valid", "expired"];
const ADMIN_STATES: AdminState[] = ["valid", "near-expiry", "expired"];
const MATRIX = REFRESH.flatMap((r) =>
    DELEGATED_STATES.flatMap((d) => ADMIN_STATES.map((a) => [r, d, a] as const)),
);

describe("S1 matrix: refresh outcome x delegated x admin", () => {
    it.each(MATRIX)("refresh %s, delegated %s, admin %s", async (r, d, a) => {
        const token = await impersonating(d, a);
        backend.refresh = r;
        resetImpersonationStatusForTests();
        calls.length = 0;
        logLines.length = 0;
        const want = expected(d, a, r);
        const next = await later(token);

        expectBearers(a === "expired");
        expect(stops().map((c) => c.bearer)).toEqual(want.stop ? [want.stop] : []);
        if (want.imp === "kept") expect(next.imp_access_token).toBe(DELEGATED);
        else {
            expect(next.imp_access_token).toBeUndefined();
            expect(next.imp_session_access_token).toBeUndefined();
            expect(next.imp_expires_at).toBeUndefined();
        }
        const events = stopNotRecorded();
        expect(events).toHaveLength(want.event ? 1 : 0);
        if (want.event) {
            expect(events[0].fields).toMatchObject({ delegation_id: DELEGATION_ID, sid: SID });
            expect(next.access_token).toBeUndefined();
            expect(next.refresh_token).toBeUndefined();
            expect(next.is_impersonating).toBeFalsy();
        }
        expect(next.error).toBe(want.error);
        const s = await session(next);
        expect(s.access_token).toBe(want.sessionBearer);
        expect(JSON.stringify(next)).not.toContain(DELEGATED_REFRESH);
    });
});

describe("S2 stop outcome with an expired delegated token and a live admin bearer", () => {
    // 400 ("No active impersonation session") is not a successful stop either.
    const OUTCOMES: StopOutcome[] = ["ok", 400, 429, 503, "network", 401, 403];
    it.each(OUTCOMES)("stop %s", async (outcome) => {
        const token = await impersonating("expired", "valid");
        backend.stop = outcome;
        resetImpersonationStatusForTests();
        calls.length = 0;
        const next = await later(token);
        expectBearers(false);
        expect(stops().map((c) => c.bearer)).toEqual([ADMIN]);
        const s = await session(next);
        if (outcome === "ok") {
            expect(next.imp_access_token).toBeUndefined();
            expect(s.access_token).toBe(ADMIN);
            expect(s.error).toBeUndefined();
            return;
        }
        // Kept: no delegated bearer, no admin bearer under the impersonated view, fail closed.
        expect(next.imp_access_token).toBe(DELEGATED);
        expect(s.access_token).toBeUndefined();
        expect(s.session_access_token).toBeUndefined();
        expect(s.error).toBe("impersonation_ending");
        expect(s.user.is_impersonating).toBe(true);
        sessionRead.mockResolvedValueOnce(s);
        await expect(requireSession()).rejects.toThrow(
            "NEXT_REDIRECT:/auth/error?error=impersonation_ending",
        );
        // The next request retries the stop, with the admin bearer only.
        backend.stop = "ok";
        resetImpersonationStatusForTests();
        calls.length = 0;
        const retried = await later(next);
        expectBearers(false);
        expect(stops().map((c) => c.bearer)).toEqual([ADMIN]);
        expect(retried.imp_access_token).toBeUndefined();
        expect((await session(retried)).access_token).toBe(ADMIN);
    });
});

describe("S3 the state step runs before any other branch", () => {
    it("an expired delegated token is stopped even when the update carries an unreadable handoff", async () => {
        const token = await impersonating("expired", "near-expiry");
        backend.refresh = 503;
        calls.length = 0;
        const next = await later(token, { session: { sessionHandoff: "garbage" } });
        expect(stops().map((c) => c.bearer)).toEqual([ADMIN]);
        expect(next.imp_access_token).toBeUndefined();
        expectBearers(false);
    });

    it("the stop precedes the refresh-failure handling in call order", async () => {
        const token = await impersonating("expired", "near-expiry");
        backend.refresh = 429;
        calls.length = 0;
        await later(token);
        const order = calls.map((c) => c.path.split("/").pop());
        expect(order.indexOf("refresh")).toBeLessThan(order.indexOf("stop"));
        expect(order.filter((p) => p === "refresh")).toHaveLength(1);
    });

    it("an admin bearer already dropped by a transient refresh is refreshed inside the step", async () => {
        const token = { ...(await impersonating("expired", "valid")), access_token: undefined };
        calls.length = 0;
        const next = await later(token);
        expect(stops().map((c) => c.bearer)).toEqual([ADMIN_2]);
        expect(next.imp_access_token).toBeUndefined();
    });
});

describe("S4 case (c): no valid bearer", () => {
    it("drops imp_* and the admin pair, signs out, logs one event with the delegation id", async () => {
        const token = await impersonating("expired", "expired");
        backend.refresh = 503;
        calls.length = 0;
        logLines.length = 0;
        const next = await later(token);
        expect(stops()).toHaveLength(0);
        const events = stopNotRecorded();
        expect(events).toHaveLength(1);
        // Ids only: the delegated session id (audit row id) and its sid, the actor, target and org.
        expect(events[0].fields).toEqual({
            event: "impersonation_stop_not_recorded",
            delegation_id: DELEGATION_ID,
            sid: SID,
            user_id: "admin-1",
            target_user_id: "target-1",
            org_id: "org-target",
        });
        expect(JSON.stringify(events)).not.toContain(DELEGATED);
        expect(JSON.stringify(events)).not.toContain("@");
        for (const k of ["imp_access_token", "imp_session_access_token", "imp_expires_at"]) {
            expect(next[k]).toBeUndefined();
        }
        expect(next.access_token).toBeUndefined();
        expect(next.refresh_token).toBeUndefined();
        expect(next.session_access_token).toBeUndefined();
        expect(next.is_impersonating).toBeFalsy();
        expect(next.error).toBe("refresh_failed");
        const s = await session(next);
        expect(s.access_token).toBeUndefined();
        expect(s).not.toHaveProperty("admin_access_token");
        sessionRead.mockResolvedValueOnce(s);
        await expect(requireSession()).rejects.toThrow(
            "NEXT_REDIRECT:/auth/signin?error=refresh_failed",
        );
    });
});

describe("S4b a sid that does not decode", () => {
    it("logs the raw sid without a delegation id and still signs out", async () => {
        const token = await impersonating("expired", "expired");
        const odd = jwtOf({ sub: "target-1", sid: "not-a-session-id", exp: 4102444800 });
        backend.refresh = 503;
        logLines.length = 0;
        const next = await later({ ...token, imp_access_token: odd });
        const events = stopNotRecorded();
        expect(events).toHaveLength(1);
        expect(events[0].fields).toMatchObject({ sid: "not-a-session-id", user_id: "admin-1" });
        expect(events[0].fields).not.toHaveProperty("delegation_id");
        expect(next.imp_access_token).toBeUndefined();
        expect(next.access_token).toBeUndefined();
        expect(next.error).toBe("refresh_failed");
    });
});

describe("S5 the delegated token has a bounded life and no refresh path", () => {
    it("a refresh token in the start answer never enters the handoff or the session", async () => {
        backend.startBody = {
            access_token: DELEGATED,
            session_access_token: DELEGATED_SERVICE,
            refresh_token: DELEGATED_REFRESH,
            token_type: "bearer",
        };
        sessionRead.mockResolvedValue({
            user: { id: "admin-1", is_superuser: true, is_impersonating: false },
            access_token: ADMIN,
        });
        const r = await startImpersonation("target-1");
        expect(r.error).toBeUndefined();
        expect(JSON.stringify(r.data)).not.toContain(DELEGATED_REFRESH);
        // The sealed handoff itself holds only the delegated access token and its life.
        const sealed = await decode({
            token: (r.data as { sessionHandoff: string }).sessionHandoff,
            secret: "dev-secret-change-in-production",
            salt: SESSION_HANDOFF_SALT,
        });
        const pair = (sealed as { pair?: Obj } | null)?.pair;
        expect(pair?.access_token).toBe(DELEGATED);
        expect(pair).not.toHaveProperty("session_access_token");
        expect(pair).not.toHaveProperty("refresh_token");
        const before = Date.now();
        const token = await callbacks().jwt({
            token: {
                id: "admin-1",
                sub: "admin-1",
                is_superuser: true,
                access_token: ADMIN,
                refresh_token: ADMIN_REFRESH,
                expires_at: Date.now() + 4 * MIN,
            },
            user: null,
            account: null,
            trigger: "update",
            session: { sessionHandoff: (r.data as { sessionHandoff: string }).sessionHandoff },
        });
        expect(JSON.stringify(token)).not.toContain(DELEGATED_REFRESH);
        // The delegated service token is not kept either (cookie byte budget, CHAOS-13105).
        expect(JSON.stringify(token)).not.toContain(DELEGATED_SERVICE);
        expect((await session(token)).session_access_token).toBeUndefined();
        // No expires_in in the answer: the delegated life is the 15 min bound, never unbounded.
        expect(token.imp_expires_at).toEqual(expect.any(Number));
        expect(token.imp_expires_at as number).toBeLessThanOrEqual(Date.now() + 15 * MIN);
        expect(token.imp_expires_at as number).toBeGreaterThan(before);
        for (const c of refreshes()) {
            expect(JSON.parse(c.body)).toEqual({ refresh_token: ADMIN_REFRESH });
        }
    });

    it("no call carries the delegated bearer after its expiry, across repeated failing requests", async () => {
        let token = await impersonating("expired", "valid");
        backend.stop = 503;
        calls.length = 0;
        for (let i = 0; i < 3; i++) {
            resetImpersonationStatusForTests();
            token = await later(token);
            const s = await session(token);
            expect(s.access_token).toBeUndefined();
        }
        expect(calls.length).toBeGreaterThan(0);
        for (const c of calls) expect(c.bearer).not.toBe(DELEGATED);
        expect(refreshes()).toHaveLength(0);
        expect(stops()).toHaveLength(3);
    });
});

describe("S6 the status read clears imp_* only on an administrator-bearer answer of false", () => {
    const ANSWERS: StatusAnswer[] = [
        "false",
        "true",
        500,
        429,
        503,
        "network",
        "missing-field",
        "null",
        "non-boolean",
        "non-json",
    ];
    it.each(ANSWERS)("status %s after a failed stop", async (answer) => {
        const token = await impersonating("expired", "valid");
        backend.stop = 503;
        backend.status = answer;
        resetImpersonationStatusForTests();
        calls.length = 0;
        const next = await later(token);
        expectBearers(false);
        expect(stops().map((c) => c.bearer)).toEqual([ADMIN]);
        const reads = calls.filter((c) => c.path.endsWith("/impersonate/status"));
        expect(reads.length).toBeGreaterThan(0);
        for (const r of reads) expect(r.bearer).toBe(ADMIN);
        if (answer === "false") {
            expect(next.imp_access_token).toBeUndefined();
            expect(next.is_impersonating).toBe(false);
            expect((await session(next)).access_token).toBe(ADMIN);
            return;
        }
        expect(next.imp_access_token).toBe(DELEGATED);
        expect(next.imp_expires_at).toEqual(token.imp_expires_at);
        expect(next.is_impersonating).toBe(true);
        const s = await session(next);
        expect(s.access_token).toBeUndefined();
        expect(s.error).toBe("impersonation_ending");
    });

    it("a live delegated token is kept when the status answer has no boolean field", async () => {
        const token = await impersonating("valid", "valid");
        backend.status = "missing-field";
        resetImpersonationStatusForTests();
        const next = await later(token);
        expect(next.imp_access_token).toBe(DELEGATED);
        expect(next.is_impersonating).toBe(true);
        expect((await session(next)).access_token).toBe(DELEGATED);
    });
});

describe("S7 no path needs or regains the delegated service token", () => {
    it("stop and the status read carry the administrator bearer while the session has no service token", async () => {
        const token = await impersonating("valid", "valid");
        const s = await session(token);
        expect(s.access_token).toBe(DELEGATED);
        expect(s.session_access_token).toBeUndefined();
        resetImpersonationStatusForTests();
        calls.length = 0;
        await later(token);
        sessionRead.mockResolvedValue(s);
        const r = await stopImpersonation();
        expect(r.error).toBeUndefined();
        const admin = calls.filter((c) => c.path.includes("/api/v1/admin/impersonate/"));
        expect(admin.map((c) => c.path.split("/").pop()).sort()).toEqual(["status", "stop"]);
        for (const c of admin) expect(c.bearer).toBe(ADMIN);
        for (const c of calls) expect(c.bearer).not.toBe(DELEGATED_SERVICE);
    });

    // Static census of the source: the delegated service token has no field, the service bearer has
    // one user (change-password, refused while impersonating), and every write of a session's
    // service token outside setServiceToken (auth.ts; fed by login, refresh, social, activeOrg and
    // SSO answers of the administrator) clears it.
    const sources = (dir: string): string[] =>
        readdirSync(dir).flatMap((name) => {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
            return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
        });
    const files = sources(join(process.cwd(), "src")).map((path) => ({
        path: path.slice(process.cwd().length + 1),
        text: readFileSync(path, "utf8"),
    }));

    it("no source file holds a delegated service token field", () => {
        expect(files.length).toBeGreaterThan(100);
        expect(files.filter((f) => f.text.includes("imp_session_access_token"))).toEqual([]);
    });

    it("the service bearer has one user, refused while impersonating before any call", () => {
        const users = files
            .filter((f) => /\bserviceBearer\(/.test(f.text))
            .map((f) => f.path)
            .sort();
        expect(users).toEqual([
            "src/app/api/auth/change-password/route.ts",
            "src/lib/authServiceOutcome.ts",
        ]);
        const route = files.find(
            (f) => f.path === "src/app/api/auth/change-password/route.ts",
        )!.text;
        expect(route.indexOf("session.user?.is_impersonating")).toBeGreaterThan(-1);
        expect(route.indexOf("session.user?.is_impersonating")).toBeLessThan(
            route.indexOf("serviceBearer(session)"),
        );
    });

    it("every other write of a session service token clears it", () => {
        const writes = files.flatMap((f) =>
            [...f.text.matchAll(/token\.session_access_token = ([^;]+);/g)].map((m) => ({
                path: f.path,
                value: m[1].trim(),
            })),
        );
        expect(writes).toEqual(
            expect.arrayContaining([{ path: "src/lib/auth.ts", value: "value.token" }]),
        );
        for (const w of writes.filter((x) => x.value !== "value.token")) {
            expect(w.value).toBe("undefined");
        }
        expect(writes.filter((x) => x.value === "value.token")).toHaveLength(1);
    });
});
