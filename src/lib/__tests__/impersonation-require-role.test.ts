import { beforeEach, describe, expect, it, vi } from "vitest";

// requireRole answers an impersonating session as web main does: a listed role admits it. Real jwt
// and session callbacks, the real caller; only fetch (the backend) and next-auth's session reader
// are replaced.

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

import AdminLayout from "@/app/(app)/org/admin/layout";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";

type Cb = {
    jwt: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
    session: (p: Record<string, unknown>) => Promise<{ user: Record<string, unknown> }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

beforeEach(() => {
    resetImpersonationStatusForTests();
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const body = String(input).endsWith("/api/v1/admin/impersonate/status")
                ? {
                      is_impersonating: true,
                      target_user_id: "target-1",
                      target_org_id: "org-target",
                  }
                : {};
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }),
    );
});

async function signIn(role: string, impersonating: boolean): Promise<void> {
    const token = await callbacks().jwt({
        token: {
            id: "admin-1",
            org_id: "org-admin",
            role,
            is_superuser: true,
            access_token: "access-admin",
            expires_at: Date.now() + 3_600_000,
            last_validated: Date.now(),
            ...(impersonating
                ? { imp_access_token: "access-delegated", imp_expires_at: Date.now() + 600_000 }
                : {}),
        },
        user: null,
        account: null,
    });
    const session = await callbacks().session({ session: { user: {} }, token });
    expect(session.user.is_impersonating).toBe(impersonating);
    sessionRead.mockResolvedValue(session);
}

async function outcome(): Promise<string> {
    try {
        await AdminLayout({ children: null });
        return "ACCEPTED";
    } catch (error) {
        const message = String((error as Error).message);
        return message === "NEXT_REDIRECT:/dashboard" ? "REFUSED" : `ACCEPTED (${message})`;
    }
}

describe("requireRole under impersonation", () => {
    it("/org/admin role=admin is_impersonating=true: accepted (web main's answer)", async () => {
        await signIn("admin", true);
        expect(await outcome()).not.toBe("REFUSED");
    });
});
