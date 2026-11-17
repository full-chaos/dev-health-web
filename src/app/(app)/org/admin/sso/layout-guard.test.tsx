/** The SSO provider tab sits under the org admin layout: a member or viewer is redirected, as on every sibling admin page. */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    headers: async () => new Headers({ "x-dev-health-path": "/org/admin/sso" }),
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
vi.mock("@/lib/auth/shadow", () => ({ scheduleShadow: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({
    getOrgEntitlements: vi.fn(async () => ({ data: { tier: "community", features: {} } })),
}));

import AdminLayout from "@/app/(app)/org/admin/layout";

const sessionFor = (user: Record<string, unknown>) => ({
    user: { id: "u-1", org_id: "org-1", needs_onboarding: false, ...user },
    access_token: "tok",
    expires: "2999-01-01T00:00:00.000Z",
});

describe("org admin layout guard on the SSO route", () => {
    beforeEach(() => sessionRead.mockReset());

    it.each(["member", "viewer"])("redirects a %s to /dashboard", async (role) => {
        sessionRead.mockResolvedValue(sessionFor({ role }));
        await expect(AdminLayout({ children: <p>sso</p> })).rejects.toThrow(
            "NEXT_REDIRECT:/dashboard",
        );
    });

    it.each(["owner", "admin"])("renders for an %s", async (role) => {
        sessionRead.mockResolvedValue(sessionFor({ role }));
        await expect(AdminLayout({ children: <p>sso</p> })).resolves.toBeTruthy();
    });

    it("renders for a platform admin with a membership-less role (the write answers 403 there)", async () => {
        sessionRead.mockResolvedValue(sessionFor({ role: "", is_superuser: true }));
        await expect(AdminLayout({ children: <p>sso</p> })).resolves.toBeTruthy();
    });
});
