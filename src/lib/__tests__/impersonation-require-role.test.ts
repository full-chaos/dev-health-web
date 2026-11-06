import { beforeEach, describe, expect, it, vi } from "vitest";

// While a session impersonates (the delegated token fields are held, D6720), no requireRole caller
// admits it, whatever role the administrator holds in the administrator's own org. Real jwt and
// session callbacks, the real callers; only fetch (the backend) and next-auth's session reader are
// replaced.

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
import AISetupPage from "@/app/(app)/org/admin/ai/page";
import DataHealthLayout from "@/app/(app)/data-health/layout";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";

type Cb = {
    jwt: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
    session: (p: Record<string, unknown>) => Promise<{ user: Record<string, unknown> }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

const CALLERS = {
    "/org/admin": () => AdminLayout({ children: null }),
    "/org/admin/ai": () => AISetupPage(),
    "/data-health": () => DataHealthLayout({ children: null }),
} as const;
type Path = keyof typeof CALLERS;

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

async function outcome(path: Path): Promise<string> {
    try {
        await CALLERS[path]();
        return "ACCEPTED";
    } catch (error) {
        const message = String((error as Error).message);
        return message === "NEXT_REDIRECT:/dashboard" ? "REFUSED" : `ACCEPTED (${message})`;
    }
}

const MATRIX: readonly (readonly [Path, string])[] = [
    ["/org/admin", "admin"],
    ["/org/admin", "owner"],
    ["/org/admin/ai", "admin"],
    ["/org/admin/ai", "owner"],
    ["/data-health", "admin"],
    ["/data-health", "owner"],
    ["/data-health", "operator"],
];

describe("requireRole refuses every impersonating session", () => {
    it.each(MATRIX)("%s role=%s is_impersonating=true: refused", async (path, role) => {
        await signIn(role, true);
        expect(await outcome(path)).toBe("REFUSED");
    });

    it("control: /org/admin role=member is_impersonating=true: refused", async () => {
        await signIn("member", true);
        expect(await outcome("/org/admin")).toBe("REFUSED");
    });

    it.each(MATRIX)("control: %s role=%s is_impersonating=false: accepted", async (path, role) => {
        await signIn(role, false);
        expect(await outcome(path)).not.toBe("REFUSED");
    });
});
