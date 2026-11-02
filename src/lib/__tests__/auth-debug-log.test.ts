import { beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10777: next-auth debug metadata has no known shape. The debug callback logs
// key names and number or boolean values only: no string, no nested value.

const { nextAuthConfig, debug } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    debug: vi.fn(),
}));

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
vi.mock("@/lib/logger", () => {
    const child = (): Record<string, unknown> => ({
        trace: vi.fn(),
        debug,
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child,
    });
    return { logger: child() };
});

import "@/lib/auth";

type DebugFn = (message: string, metadata?: unknown) => void;

function debugCallback(): DebugFn {
    const config = nextAuthConfig.value as { logger?: { debug?: DebugFn } } | null;
    const fn = config?.logger?.debug;
    if (!fn) throw new Error("debug callback not captured from NextAuth config");
    return fn;
}

const SECRETS = {
    clientSecret: "client-secret-value-Zq81",
    accessToken: "access-token-value-Zq82",
    idToken: "id-token-value-Zq83",
    refreshToken: "refresh-token-value-Zq84",
    email: "person.zq85@example.test",
    code: "auth-code-value-Zq86",
    state: "state-value-Zq87",
    note: "free text with a password zq88 inside",
};

describe("next-auth debug metadata", () => {
    beforeEach(() => debug.mockClear());

    it("never logs a string value or a nested value", () => {
        debugCallback()("OAUTH_CALLBACK_RESPONSE", {
            provider: { id: "github", clientSecret: SECRETS.clientSecret },
            tokens: {
                access_token: SECRETS.accessToken,
                id_token: SECRETS.idToken,
                refresh_token: SECRETS.refreshToken,
            },
            profile: { email: SECRETS.email },
            url: `https://app.example/cb?code=${SECRETS.code}&state=${SECRETS.state}`,
            note: SECRETS.note,
        });
        expect(debug).toHaveBeenCalledTimes(1);
        const dump = JSON.stringify(debug.mock.calls);
        for (const value of Object.values(SECRETS)) expect(dump).not.toContain(value);
        expect(dump).not.toContain("github");
        expect(dump).toContain("OAUTH_CALLBACK_RESPONSE");
    });

    it("keeps key names and number or boolean values", () => {
        debugCallback()("step", { attempts: 3, ok: true, provider: { x: 1 }, name: "n" });
        const [fields, message] = debug.mock.calls[0] as [{ metadata: unknown }, string];
        expect(message).toBe("step");
        const meta = fields.metadata as { attempts: number; ok: boolean; keys: string[] };
        expect(meta.attempts).toBe(3);
        expect(meta.ok).toBe(true);
        expect(meta.keys).toEqual(expect.arrayContaining(["attempts", "ok", "provider", "name"]));
    });

    it.each([undefined, null, "a plain string " + SECRETS.code, 42, [SECRETS.code]])(
        "handles a non-object metadata %#",
        (metadata) => {
            debugCallback()("step", metadata);
            expect(JSON.stringify(debug.mock.calls)).not.toContain(SECRETS.code);
        },
    );
});
