import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-9238: the source-literal signing secret is used only when NODE_ENV is
// "development" or "test". Any other value, or none, fails closed.

const { nextAuthConfig } = vi.hoisted(() => ({ nextAuthConfig: { value: null as unknown } }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => ({
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: vi.fn(),
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

const SECRET_VARS = ["AUTH_SECRET", "NEXTAUTH_SECRET"] as const;

async function loadSecret(nodeEnv: string | undefined): Promise<unknown> {
    vi.resetModules();
    nextAuthConfig.value = null;
    vi.unstubAllEnvs();
    for (const name of SECRET_VARS) vi.stubEnv(name, "");
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else vi.stubEnv("NODE_ENV", nodeEnv);
    await import("@/lib/auth");
    return (nextAuthConfig.value as { secret?: unknown }).secret;
}

describe("session signing secret without AUTH_SECRET / NEXTAUTH_SECRET", () => {
    const original = process.env.NODE_ENV;
    beforeEach(() => vi.resetModules());
    afterEach(() => {
        vi.unstubAllEnvs();
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
    });

    it.each(["development", "test"])("uses the fallback when NODE_ENV is %s", async (env) => {
        expect(typeof (await loadSecret(env))).toBe("string");
    });

    it.each(["production", "staging", "preview", "", undefined])(
        "fails closed when NODE_ENV is %j",
        async (env) => {
            expect(await loadSecret(env)).toBeUndefined();
        },
    );

    it("uses a configured secret in any NODE_ENV", async () => {
        vi.resetModules();
        vi.stubEnv("NODE_ENV", "staging");
        vi.stubEnv("AUTH_SECRET", "configured-value");
        await import("@/lib/auth");
        expect((nextAuthConfig.value as { secret?: unknown }).secret).toBe("configured-value");
    });
});
