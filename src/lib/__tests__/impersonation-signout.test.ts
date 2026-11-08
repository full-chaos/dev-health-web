/**
 * The normal sign-out path ends a held impersonation: signOutEverywhere -> POST
 * /api/auth/revoke-session (the real route, with a sealed session cookie) -> Ops
 * `/api/v1/admin/impersonate/stop` with the administrator bearer, before Ops logout and before
 * NextAuth signOut clears the cookie. A failed stop never stops the sign-out: one error event says
 * the stop was not recorded.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";

import type { AcrSignOutHook } from "@/lib/ask-dev/acr-sign-out";
import type { SignOutDeps } from "@/lib/signOutEverywhere";

const SECRET = "chaos-signout-impersonation-secret";
const ORIGIN = "https://app.example.test";
const BACKEND = "http://ops.example.test";
const ADMIN = "access-admin-signout";
const REFRESH = "refresh-admin-signout";
const DELEGATED = "access-delegated-signout";
const COOKIE = "__Secure-authjs.session-token";

const { logs } = vi.hoisted(() => ({ logs: [] as { level: string; fields: unknown }[] }));

vi.mock("@/lib/logger", () => {
    const capture =
        (level: string) =>
        (fields: unknown): void => {
            logs.push({ level, fields });
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

type Call = { readonly path: string; readonly bearer: string | null };
const trace: Call[] = [];
let stopAnswer: "200" | "503" | "network" = "200";

let POST: (request: Request) => Promise<Response>;
let signOutEverywhere: (deps: SignOutDeps) => Promise<unknown>;

beforeAll(async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            trace.push({
                path: url.replace(BACKEND, ""),
                bearer: new Headers(init?.headers).get("authorization"),
            });
            if (url.endsWith("/api/v1/admin/impersonate/stop")) {
                if (stopAnswer === "network") throw new TypeError("fetch failed");
                return Response.json(
                    stopAnswer === "200" ? { status: "stopped" } : { detail: "unavailable" },
                    { status: Number(stopAnswer) },
                );
            }
            return Response.json({ message: "Logout successful" });
        }),
    );
    ({ POST } = (await import("@/app/api/auth/revoke-session/route")) as unknown as {
        POST: typeof POST;
    });
    ({ signOutEverywhere } = (await import("@/lib/signOutEverywhere")) as unknown as {
        signOutEverywhere: typeof signOutEverywhere;
    });
});

beforeEach(() => {
    trace.length = 0;
    logs.length = 0;
    stopAnswer = "200";
});

async function cookie(impersonating: boolean): Promise<string> {
    const now = Date.now();
    const value = await encode({
        salt: COOKIE,
        secret: SECRET,
        token: {
            sub: "admin-1",
            id: "admin-1",
            org_id: "org-admin",
            is_superuser: true,
            access_token: ADMIN,
            refresh_token: REFRESH,
            expires_at: now + 3_600_000,
            last_validated: now,
            ...(impersonating
                ? {
                      imp_access_token: DELEGATED,
                      imp_expires_at: now + 600_000,
                      impersonated_user_id: "target-1",
                      impersonated_org_id: "org-target",
                  }
                : {}),
        },
    });
    return `${COOKIE}=${value}`;
}

async function signOutWith(impersonating: boolean) {
    const sessionCookie = await cookie(impersonating);
    const signOut = vi.fn(async () => {
        trace.push({ path: "next-auth signOut", bearer: null });
    });
    const hook: AcrSignOutHook = { heldFamily: () => null, clearAllTabs: vi.fn() };
    const deps: SignOutDeps = {
        cancelLiveRun: async () => undefined,
        // The browser's call to this web server runs the real route with the session cookie.
        fetch: (async (input: string | URL | Request) => {
            trace.push({ path: String(input), bearer: null });
            return POST(
                new Request(`${ORIGIN}${String(input)}`, {
                    headers: { origin: ORIGIN, cookie: sessionCookie },
                    method: "POST",
                }),
            );
        }) as typeof fetch,
        forgetConversation: vi.fn(),
        hook,
        log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
        signOut,
    };
    const result = await signOutEverywhere(deps);
    return { result, signOut };
}

const paths = () => trace.map((c) => c.path);
const stopEvents = () =>
    logs.filter(
        (l) =>
            l.level === "error" &&
            (l.fields as { event?: string } | undefined)?.event ===
                "impersonation_stop_not_recorded",
    );

describe("sign-out while impersonating runs the delegated stop", () => {
    it("the request trace has the stop with the administrator bearer, before logout and signOut", async () => {
        const { result } = await signOutWith(true);

        const stop = trace.findIndex((c) => c.path === "/api/v1/admin/impersonate/stop");
        const logout = trace.findIndex((c) => c.path === "/api/v1/auth/logout");
        const cleared = trace.findIndex((c) => c.path === "next-auth signOut");
        console.log(
            `SIGN_OUT requests=${JSON.stringify(paths())} delegated_stop=${String(stop >= 0)}`,
        );
        expect(stop).toBeGreaterThanOrEqual(0);
        expect(trace[stop]?.bearer).toBe(`Bearer ${ADMIN}`);
        expect(logout).toBeGreaterThan(stop);
        expect(cleared).toBeGreaterThan(logout);
        expect(result).toEqual({ familyRevoked: null, sessionRevoked: true });
        expect(stopEvents()).toEqual([]);
    });

    it.each(["503", "network"] as const)(
        "stop %s: the sign-out still completes and one error event says the stop was not recorded",
        async (answer) => {
            stopAnswer = answer;
            const { result, signOut } = await signOutWith(true);

            expect(paths()).toEqual([
                "/api/auth/revoke-session",
                "/api/v1/admin/impersonate/stop",
                "/api/v1/auth/logout",
                "next-auth signOut",
            ]);
            expect(result).toEqual({ familyRevoked: null, sessionRevoked: true });
            expect(signOut).toHaveBeenCalledWith(undefined);
            expect(stopEvents()).toHaveLength(1);
            expect(stopEvents()[0]?.fields).toMatchObject({
                user_id: "admin-1",
                target_user_id: "target-1",
                org_id: "org-target",
            });
            expect(JSON.stringify(logs)).not.toContain(ADMIN);
            expect(JSON.stringify(logs)).not.toContain(DELEGATED);
            expect(JSON.stringify(logs)).not.toContain(REFRESH);
        },
    );

    it("control: a session that does not impersonate sends no stop", async () => {
        await signOutWith(false);
        expect(paths()).toEqual([
            "/api/auth/revoke-session",
            "/api/v1/auth/logout",
            "next-auth signOut",
        ]);
    });
});
