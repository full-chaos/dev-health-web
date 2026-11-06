import { beforeEach, describe, expect, it, vi } from "vitest";

// A platform admin who impersonates keeps is_superuser=true on the session; the superadmin
// surfaces must still be denied while the session impersonates. Real jwt + session callbacks, real guards, real server actions;
// only fetch (the backend) and next-auth's own session reader are replaced.

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

import { requireRole, requireSuperuser } from "@/lib/auth";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";
import SuperadminLayout from "@/app/(app)/superadmin/layout";
import AdminLayout from "@/app/(app)/org/admin/layout";
import {
    createPlatformUser,
    deleteOrganization,
    getImpersonationStatus,
    listOrganizations,
    startImpersonation,
    stopImpersonation,
} from "@/lib/admin/server";

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
    resetImpersonationStatusForTests();
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

describe("superadmin surfaces are denied while impersonating", () => {
    it("the session carries is_impersonating and is_superuser", async () => {
        const s = await sessionRead();
        expect(s.user.is_impersonating).toBe(true);
        expect(s.user.org_id).toBe("org-target");
        expect(s.user.is_superuser).toBe(true);
    });

    it("requireSuperuser (the /superadmin guard) redirects an impersonating session", async () => {
        await expect(requireSuperuser("/superadmin")).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });

    it("the /superadmin layout does not render while impersonating", async () => {
        await expect(SuperadminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    });

    it("requireSuperuserToken actions are refused with 403 and make no backend call", async () => {
        const listed = await listOrganizations();
        const deleted = await deleteOrganization("org-victim");
        const created = await createPlatformUser({
            email: "new@example.test",
            password: "x",
        } as never);
        for (const r of [listed, deleted, created]) {
            expect(r.data).toBeUndefined();
            expect(r.error).toBeDefined();
        }
        expect(backendCalls).toEqual([]);
    });

    it("start impersonation is refused while already impersonating (no nesting)", async () => {
        const r = await startImpersonation("target-2");
        expect(r.error).toBeDefined();
        expect(backendCalls).toEqual([]);
    });

    it("stop impersonation stays allowed while impersonating", async () => {
        const r = await stopImpersonation();
        expect(r.error).toBeUndefined();
        expect(backendCalls.some((c) => c.includes("/impersonate"))).toBe(true);
    });

    it("impersonation status stays readable while impersonating", async () => {
        const r = await getImpersonationStatus();
        expect(r.error).toBeUndefined();
    });

    it("requireRole: the superuser bypass does not apply while impersonating (member is refused)", async () => {
        await expect(requireRole(["admin", "owner"])).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });

    it("requireRole: a matching role does not admit an impersonating session", async () => {
        const s = await sessionRead();
        sessionRead.mockResolvedValue({ ...s, user: { ...s.user, role: "admin" } });
        await expect(requireRole(["admin", "owner"])).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });

    it("the /org/admin layout denies an impersonating session whose role is member", async () => {
        await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });

    it("a platform admin who is not impersonating still passes every guard", async () => {
        const s = await sessionRead();
        sessionRead.mockResolvedValue({ ...s, user: { ...s.user, is_impersonating: false } });
        await expect(requireSuperuser("/superadmin")).resolves.toBeTruthy();
        await expect(SuperadminLayout({ children: null })).resolves.toBeTruthy();
        await expect(requireRole(["admin", "owner"])).resolves.toBeTruthy();
        const listed = await listOrganizations();
        expect(listed.error).toBeUndefined();
        expect(backendCalls).toEqual(["GET /api/v1/admin/orgs"]);
    });
});
