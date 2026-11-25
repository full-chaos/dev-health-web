import { beforeEach, describe, expect, it, vi } from "vitest";

// The platform user actions use the shared platform guard. Real jwt + session callbacks, real guards,
// real server actions; only fetch (the backend) and next-auth's own session reader are replaced.

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

import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";
import * as server from "@/lib/admin/server";

type Cb = {
    jwt: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
    session: (p: Record<string, unknown>) => Promise<{
        user: Record<string, unknown>;
        access_token: string;
    }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

type Call = { method: string; path: string; org: string | undefined; auth: string | undefined };
const backendCalls: Call[] = [];

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
            const headers = (init?.headers ?? {}) as Record<string, string>;
            backendCalls.push({
                method: init?.method ?? "GET",
                path: url.replace("http://backend.test", ""),
                org: headers["X-Org-Id"],
                auth: headers.Authorization,
            });
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }),
    );
    const token = await callbacks().jwt({
        token: {
            id: "admin-1",
            org_id: "org-admin",
            role: "member",
            is_superuser: true,
            access_token: "access-admin-1",
            refresh_token: "refresh-admin-1",
            imp_access_token: "access-delegated-1",
            imp_expires_at: Date.now() + 600_000,
            expires_at: Date.now() + 3_600_000,
            last_validated: Date.now(),
        },
        user: null,
        account: null,
    });
    const session = await callbacks().session({ session: { user: {} }, token });
    sessionRead.mockResolvedValue(session);
});

const asPlainAdmin = async () => {
    const s = await sessionRead();
    sessionRead.mockResolvedValue({
        ...s,
        access_token: "access-admin-1",
        user: { ...s.user, is_impersonating: false, org_id: "org-admin" },
    });
};

type Result = Promise<{ error?: unknown }>;
const twins = server as unknown as {
    getPlatformUser: (id: string) => Result;
    updatePlatformUser: (id: string, data: { role: string }) => Result;
    deletePlatformUser: (id: string) => Result;
};

const PLATFORM_ACTIONS: [string, () => Promise<{ error?: unknown }>][] = [
    ["listPlatformUsers", () => server.listPlatformUsers("bob")],
    ["getPlatformUser", () => twins.getPlatformUser("u-2")],
    ["updatePlatformUser", () => twins.updatePlatformUser("u-2", { role: "admin" })],
    ["deletePlatformUser", () => twins.deletePlatformUser("u-2")],
    ["setUserPassword", () => server.setUserPassword("u-2", "p1", "p0")],
];

describe("platform user actions use the shared platform guard", () => {
    it.each(PLATFORM_ACTIONS)(
        "%s is refused while impersonating, with no backend call",
        async (_n, run) => {
            const r = await run();
            expect(r.error).toBeDefined();
            expect(backendCalls).toEqual([]);
        },
    );
});

describe("a platform admin who does not impersonate keeps the same backend request", () => {
    const EXPECTED: [
        string,
        () => Promise<{ error?: unknown }>,
        string,
        string,
        string | undefined,
    ][] = [
        [
            "listPlatformUsers",
            PLATFORM_ACTIONS[0]![1],
            "GET",
            "/api/v1/admin/users?q=bob&active_only=false",
            undefined,
        ],
        ["getPlatformUser", PLATFORM_ACTIONS[1]![1], "GET", "/api/v1/admin/users/u-2", "org-admin"],
        [
            "updatePlatformUser",
            PLATFORM_ACTIONS[2]![1],
            "PATCH",
            "/api/v1/admin/users/u-2",
            "org-admin",
        ],
        [
            "deletePlatformUser",
            PLATFORM_ACTIONS[3]![1],
            "DELETE",
            "/api/v1/admin/users/u-2",
            "org-admin",
        ],
        [
            "setUserPassword",
            PLATFORM_ACTIONS[4]![1],
            "POST",
            "/api/v1/admin/users/u-2/password",
            "org-admin",
        ],
    ];
    it.each(EXPECTED)("%s calls the backend as before", async (_n, run, method, path, org) => {
        await asPlainAdmin();
        const r = await run();
        expect(r.error).toBeUndefined();
        expect(backendCalls).toEqual([{ method, path, org, auth: "Bearer access-admin-1" }]);
    });
});

describe("the org admin actions keep their own path", () => {
    it("getUser still reads while impersonating, with the session org", async () => {
        const r = await server.getUser("u-2");
        expect(r.error).toBeUndefined();
        expect(backendCalls).toHaveLength(1);
        expect(backendCalls[0]).toMatchObject({
            method: "GET",
            path: "/api/v1/admin/users/u-2",
            org: "org-target",
        });
    });

    it.each([
        ["getUser", () => server.getUser("u-2"), "GET"],
        ["updateUser", () => server.updateUser("u-2", { role: "admin" } as never), "PATCH"],
        ["deleteUser", () => server.deleteUser("u-2"), "DELETE"],
    ] as const)(
        "%s calls the backend with the session org when not impersonating",
        async (_n, run, method) => {
            await asPlainAdmin();
            const r = await run();
            expect(r.error).toBeUndefined();
            expect(backendCalls).toEqual([
                {
                    method,
                    path: "/api/v1/admin/users/u-2",
                    org: "org-admin",
                    auth: "Bearer access-admin-1",
                },
            ]);
        },
    );
});
