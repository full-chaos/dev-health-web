import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Platform UI shadow on top of the real guards. A platform admin who impersonates keeps is_superuser=true on the session; the superadmin
// surfaces must still be denied while the session impersonates. Real jwt + session callbacks, real guards, real server actions;
// only fetch (the backend) and next-auth's own session reader are replaced.

const { nextAuthConfig, sessionRead, shadowRuns, shadowEnv, shadowTransport } = vi.hoisted(() => ({
    shadowRuns: [] as (() => Promise<unknown> | unknown)[],
    shadowEnv: { value: {} as Record<string, string | undefined> },
    shadowTransport: { value: undefined as unknown },
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
vi.mock("next/server", () => ({
    after: (fn: () => Promise<unknown> | unknown) => {
        shadowRuns.push(fn);
    },
}));
vi.mock("@/lib/config", async (orig) => {
    const real = await orig<typeof import("@/lib/config")>();
    return { ...real, getServerEnv: () => ({ ...real.getServerEnv(), ...shadowEnv.value }) };
});
vi.mock("@/lib/auth/shadow/config", async (orig) => ({
    ...(await orig<typeof import("@/lib/auth/shadow/config")>()),
    getShadowTransport: () => shadowTransport.value,
}));

import { requireSuperuser } from "@/lib/auth";
import { recordingTransport, DENY, TOKEN } from "@/lib/auth/shadow/__tests__/helpers";
import { processMemo } from "@/lib/processMemo";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";
import { listOrganizations, stopImpersonation } from "@/lib/admin/server";

type Cb = {
    jwt: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
    session: (p: Record<string, unknown>) => Promise<{
        user: Record<string, unknown>;
        access_token: string;
    }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

const backendCalls: string[] = [];

beforeEach(async () => {
    shadowRuns.length = 0;
    shadowEnv.value = {};
    shadowTransport.value = undefined;
    resetImpersonationStatusForTests();
    processMemo<number>("authzShadowSample").clear();
    backendCalls.length = 0;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/api/v1/admin/impersonate/status")) {
                return new Response(
                    JSON.stringify({
                        is_impersonating: true,
                        target_user_id: "target-1",
                        target_email: "target@example.test",
                        target_org_id: "org-target",
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                );
            }
            backendCalls.push(`${init?.method ?? "GET"} ${url.replace("http://backend.test", "")}`);
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }),
    );
    // A platform admin (org owner of org-admin) who is impersonating a plain member of org-target.
    const token = await callbacks().jwt({
        token: {
            id: "admin-1",
            org_id: "org-admin",
            role: "member",
            is_superuser: true,
            access_token: "access-admin-1",
            refresh_token: "refresh-admin-1",
            // The delegated token is the impersonation (D6720); the status read only adds display data.
            imp_access_token: "access-delegated-1",
            imp_expires_at: Date.now() + 600_000,
            expires_at: Date.now() + 3_600_000,
            last_validated: Date.now(),
        },
        user: null,
        account: null,
    });
    const session = await callbacks().session({
        session: { user: {} },
        token,
    });
    sessionRead.mockResolvedValue(session);
});

const flush = () => Promise.all(shadowRuns.map((fn) => fn()));
const wireActions = (calls: { body: string }[]) =>
    calls
        .flatMap((c) => (JSON.parse(c.body) as { requests: { action: string }[] }).requests)
        .map((r) => r.action);

describe("C3/C4 shadow on the real guards: outcomes do not move", () => {
    beforeEach(async () => {
        const s = await sessionRead();
        sessionRead.mockResolvedValue({ ...s, access_token: TOKEN });
    });

    afterEach(() => {
        shadowEnv.value = {};
    });

    it("off: the guard and the actions behave as on main and nothing is scheduled", async () => {
        await expect(requireSuperuser("/superadmin", "page:/superadmin")).rejects.toThrow(
            "NEXT_REDIRECT:/dashboard",
        );
        const r = await listOrganizations();
        expect(r.error).toBeDefined();
        expect(shadowRuns).toHaveLength(0);
    });

    it("shadow: an impersonating session is still redirected and still refused, and the PDP is asked once per surface", async () => {
        const { transport, calls } = recordingTransport([DENY]);
        shadowTransport.value = transport;
        shadowEnv.value = { AUTHZ_PLATFORM_UI: "shadow" };
        await expect(requireSuperuser("/superadmin", "page:/superadmin")).rejects.toThrow(
            "NEXT_REDIRECT:/dashboard",
        );
        const listed = await listOrganizations();
        expect(listed.data).toBeUndefined();
        expect(listed.error).toBeDefined();
        expect(backendCalls).toEqual([]);
        await flush();
        expect(wireActions(calls).sort()).toEqual(["admin.orgs", "admin.stats"]);
    });

    it("shadow: a stop call stays allowed and is asked as admin.impersonate", async () => {
        const { transport, calls } = recordingTransport([DENY]);
        shadowTransport.value = transport;
        shadowEnv.value = { AUTHZ_PLATFORM_UI: "shadow" };
        const r = await stopImpersonation();
        expect(r.error).toBeUndefined();
        await flush();
        expect(wireActions(calls)).toEqual(["admin.impersonate"]);
    });

    it("shadow: a throwing transport changes no outcome", async () => {
        shadowTransport.value = async () => {
            throw new Error("down");
        };
        shadowEnv.value = { AUTHZ_PLATFORM_UI: "shadow" };
        const s = await sessionRead();
        sessionRead.mockResolvedValue({ ...s, user: { ...s.user, is_impersonating: false } });
        await expect(requireSuperuser("/superadmin", "page:/superadmin")).resolves.toBeTruthy();
        const listed = await listOrganizations();
        expect(listed.error).toBeUndefined();
        await expect(flush()).resolves.toBeDefined();
    });
});
