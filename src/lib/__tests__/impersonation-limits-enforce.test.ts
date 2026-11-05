import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AUTHZ_PLATFORM_UI=enforce with real jwt + session callbacks, real guards and real server
// actions; only fetch (the backend) and next-auth's own session reader are replaced.

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

import { requireSuperuser } from "@/lib/auth";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";
import SuperadminLayout from "@/app/(app)/superadmin/layout";
import {
    deleteCurrentOrg,
    deleteUser,
    getCurrentOrg,
    getImpersonationStatus,
    inviteCurrentOrgMember,
    listUsers,
    setUserPassword,
    stopImpersonation,
    updateCurrentOrg,
    updateOrgProfile,
    updateUser,
} from "@/lib/admin/server";
import type { ActionResult } from "@/lib/result";

type Cb = {
    jwt: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
    session: (p: Record<string, unknown>) => Promise<{
        user: Record<string, unknown>;
        access_token: string;
    }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

const backendCalls: string[] = [];
const status = { mode: "impersonating" as "impersonating" | "not" | "fail" };

// C7: the web server actions for organization writes and the catalog action each maps to.
const ORG_WRITES: ReadonlyArray<[string, () => Promise<ActionResult<unknown>>]> = [
    ["updateCurrentOrg (org.write)", () => updateCurrentOrg({ name: "x" } as never)],
    ["updateOrgProfile (org.write)", () => updateOrgProfile({ name: "x" })],
    ["deleteCurrentOrg (org.delete)", () => deleteCurrentOrg()],
    [
        "inviteCurrentOrgMember (members.invite)",
        () => inviteCurrentOrgMember("n@example.test", "member"),
    ],
    ["updateUser (members.update)", () => updateUser("u-2", { role: "admin" } as never)],
    ["deleteUser (members.manage)", () => deleteUser("u-2")],
    ["setUserPassword (members.manage)", () => setUserPassword("u-2", "p1", "p0")],
];

async function signIn(over: Record<string, unknown> = {}) {
    const token = await callbacks().jwt({
        token: {
            id: "admin-1",
            org_id: "org-admin",
            role: "owner",
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
    const session = await callbacks().session({ session: { user: {} }, token });
    sessionRead.mockResolvedValue({ ...session, user: { ...session.user, ...over } });
}

beforeEach(async () => {
    resetImpersonationStatusForTests();
    backendCalls.length = 0;
    status.mode = "impersonating";
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/api/v1/admin/impersonate/status")) {
                if (status.mode === "fail") throw new Error("status down");
                return new Response(
                    JSON.stringify(
                        status.mode === "impersonating"
                            ? {
                                  is_impersonating: true,
                                  target_user_id: "target-1",
                                  target_email: "target@example.test",
                                  target_org_id: "org-target",
                              }
                            : { is_impersonating: false },
                    ),
                    { status: 200, headers: { "content-type": "application/json" } },
                );
            }
            backendCalls.push(`${init?.method ?? "GET"} ${url.replace("http://backend.test", "")}`);
            return new Response(JSON.stringify({ id: "x", slug: "x", name: "x" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }),
    );
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("C3/C4 off and shadow: today's behavior", () => {
    it.each([undefined, "off", "shadow"])(
        "AUTHZ_PLATFORM_UI=%j: /superadmin redirects to /dashboard while impersonating",
        async (value) => {
            if (value !== undefined) vi.stubEnv("AUTHZ_PLATFORM_UI", value);
            await signIn();
            await expect(requireSuperuser("/superadmin")).rejects.toThrow(
                "NEXT_REDIRECT:/dashboard",
            );
        },
    );

    it.each([undefined, "off", "shadow"])(
        "AUTHZ_PLATFORM_UI=%j: org writes reach the backend while impersonating",
        async (value) => {
            if (value !== undefined) vi.stubEnv("AUTHZ_PLATFORM_UI", value);
            await signIn();
            for (const [, run] of ORG_WRITES) await run();
            expect(backendCalls).toHaveLength(ORG_WRITES.length);
        },
    );
});

describe("enforce, impersonating", () => {
    beforeEach(async () => {
        vi.stubEnv("AUTHZ_PLATFORM_UI", "enforce");
        await signIn();
    });

    it("C6 requireSuperuser sends the session to the deny page", async () => {
        await expect(requireSuperuser("/superadmin")).rejects.toThrow(
            "NEXT_REDIRECT:/impersonation-restricted",
        );
    });

    it("C6 the /superadmin layout does not render and fetches nothing", async () => {
        await expect(SuperadminLayout({ children: null })).rejects.toThrow(
            "NEXT_REDIRECT:/impersonation-restricted",
        );
        expect(backendCalls).toEqual([]);
    });

    it.each(ORG_WRITES)("C7 %s is refused with 403 and no backend call", async (_, run) => {
        const r = await run();
        expect(r.data).toBeUndefined();
        expect(r.error).toBeDefined();
        expect(backendCalls).toEqual([]);
    });

    it("C7 organization reads still work", async () => {
        expect((await getCurrentOrg()).error).toBeUndefined();
        expect((await listUsers()).error).toBeUndefined();
        expect(backendCalls).toHaveLength(2);
    });

    it("C8 stop impersonation and the status read stay allowed", async () => {
        expect((await stopImpersonation()).error).toBeUndefined();
        expect((await getImpersonationStatus()).error).toBeUndefined();
        expect(backendCalls.some((c) => c.includes("/impersonate"))).toBe(true);
    });
});

describe("enforce, not impersonating", () => {
    beforeEach(() => {
        vi.stubEnv("AUTHZ_PLATFORM_UI", "enforce");
        status.mode = "not";
    });

    it("C5 a platform admin passes the guard and writes", async () => {
        await signIn();
        await expect(requireSuperuser("/superadmin")).resolves.toBeTruthy();
        await expect(SuperadminLayout({ children: null })).resolves.toBeTruthy();
        for (const [, run] of ORG_WRITES) expect((await run()).error).toBeUndefined();
        expect(backendCalls).toHaveLength(ORG_WRITES.length);
    });

    it("C9 an org owner that is not a superuser is not sent to the deny page", async () => {
        await signIn({ is_superuser: false });
        await expect(requireSuperuser("/superadmin")).rejects.toThrow("NEXT_REDIRECT:/dashboard");
        expect((await updateOrgProfile({ name: "x" })).error).toBeUndefined();
    });

    it("C10 a forged session flag does not change the server status", async () => {
        await signIn({ is_impersonating: false });
        resetImpersonationStatusForTests();
        status.mode = "impersonating";
        await expect(requireSuperuser("/superadmin")).rejects.toThrow(
            "NEXT_REDIRECT:/impersonation-restricted",
        );
        expect((await updateOrgProfile({ name: "x" })).error).toBeDefined();
        expect(backendCalls).toEqual([]);
    });

    it("C11 a status read that fails is a deny", async () => {
        await signIn();
        resetImpersonationStatusForTests();
        status.mode = "fail";
        await expect(requireSuperuser("/superadmin")).rejects.toThrow(
            "NEXT_REDIRECT:/impersonation-restricted",
        );
        expect((await deleteCurrentOrg()).error).toBeDefined();
        expect(backendCalls).toEqual([]);
    });
});
