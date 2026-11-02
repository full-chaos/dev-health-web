import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10877 (D6131): every social provider is built with PKCE S256 and a state check, pinned in
// auth.ts. W-3 reads the options the providers are built with; W-4 runs the real Auth.js sign-in
// and reads the redirect it answers.

type Options = Record<string, unknown>;
const { built, nextAuthConfig } = vi.hoisted(() => ({
    built: {} as Record<string, Options>,
    nextAuthConfig: { value: null as unknown },
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
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));

const PROVIDERS = ["github", "google", "gitlab"] as const;

function setSocialEnv() {
    for (const p of PROVIDERS) {
        vi.stubEnv(`AUTH_${p.toUpperCase()}_ID`, `${p}-client-id`);
        vi.stubEnv(`AUTH_${p.toUpperCase()}_SECRET`, `${p}-client-secret`);
    }
}

beforeEach(() => {
    vi.resetModules();
    nextAuthConfig.value = null;
    for (const k of Object.keys(built)) delete built[k];
    setSocialEnv();
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("W-3 social provider options", () => {
    beforeEach(() => {
        for (const p of PROVIDERS) {
            vi.doMock(`next-auth/providers/${p}`, () => ({
                default: (options: Options) => {
                    built[p] = options;
                    return { id: p, ...options };
                },
            }));
        }
    });
    afterEach(() => {
        for (const p of PROVIDERS) vi.doUnmock(`next-auth/providers/${p}`);
    });

    it.each(PROVIDERS)("%s is built with checks pkce and state", async (p) => {
        await import("@/lib/auth");
        expect(built[p]).toBeDefined();
        expect(built[p].checks).toEqual(["pkce", "state"]);
    });
});
