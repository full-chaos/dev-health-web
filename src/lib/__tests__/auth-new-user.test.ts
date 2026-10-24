import { afterEach, describe, expect, it, vi } from "vitest";

const { nextAuthConfig } = vi.hoisted(() => ({ nextAuthConfig: { value: null as unknown } }));

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
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://localhost:8000" }));

import "@/lib/auth";

type Token = Record<string, unknown>;
type Jwt = (params: {
    token: Token;
    user?: Token | null;
    account?: Token | null;
    trigger?: string;
    session?: Token | null;
}) => Promise<Token>;
type SessionCb = (params: {
    session: { user: Record<string, unknown> };
    token: Token;
}) => Promise<{ user: Record<string, unknown> }>;

function callbacks(): { jwt: Jwt; session: SessionCb } {
    const config = nextAuthConfig.value as { callbacks: { jwt: Jwt; session: SessionCb } };
    return config.callbacks;
}

function socialResponse(isNewUser: boolean | undefined): Response {
    const body: Record<string, unknown> = {
        user: { id: "user-9", org_id: null, role: null, is_superuser: false },
        needs_onboarding: true,
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
    };
    if (isNewUser !== undefined) body.is_new_user = isNewUser;
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

const socialAccount = { provider: "github", access_token: "provider-token" };

describe("jwt callback: is_new_user", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sets the flag only when the social exchange says the user is new", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(socialResponse(true)));
        const token = await callbacks().jwt({
            token: {},
            user: { id: "p" },
            account: socialAccount,
        });
        expect(token.is_new_user).toBe(true);
    });

    it.each([false, undefined])("does not set the flag when is_new_user is %s", async (value) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(socialResponse(value)));
        const token = await callbacks().jwt({
            token: {},
            user: { id: "p" },
            account: socialAccount,
        });
        expect(token.is_new_user).toBeFalsy();
    });

    it("a new social sign-in replaces a flag left by an earlier one", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(socialResponse(false)));
        const token = await callbacks().jwt({
            token: { is_new_user: true },
            user: { id: "p" },
            account: socialAccount,
        });
        expect(token.is_new_user).toBeFalsy();
    });

    it("does not set the flag on a credentials sign-in", async () => {
        const token = await callbacks().jwt({
            token: {},
            user: { id: "u", email: "a@example.com", access_token: "x", refresh_token: "y" },
            account: { provider: "credentials" },
        });
        expect(token.is_new_user).toBeFalsy();
    });

    it("does not set the flag on a later call without an account", async () => {
        const token = await callbacks().jwt({
            token: {
                id: "u",
                access_token: "x",
                refresh_token: "y",
                expires_at: Date.now() + 3_600_000,
                last_validated: Date.now(),
            },
            user: null,
            account: null,
        });
        expect(token.is_new_user).toBeFalsy();
    });

    it.each([true, false])(
        "a client update() carrying is_new_user=%s never sets or changes it",
        async (value) => {
            const base = {
                id: "u",
                access_token: "x",
                refresh_token: "y",
                expires_at: Date.now() + 3_600_000,
                last_validated: Date.now(),
            };
            const unset = await callbacks().jwt({
                token: { ...base },
                user: null,
                account: null,
                trigger: "update",
                session: { is_new_user: value, user: { is_new_user: value } },
            });
            expect(unset.is_new_user).toBeFalsy();
            const kept = await callbacks().jwt({
                token: { ...base, is_new_user: true },
                user: null,
                account: null,
                trigger: "update",
                session: { is_new_user: value, user: { is_new_user: value } },
            });
            expect(kept.is_new_user).toBe(true);
        },
    );
});

describe("session callback: is_new_user", () => {
    it("copies the flag from the token to the session user", async () => {
        const out = await callbacks().session({
            session: { user: {} },
            token: { id: "u", is_new_user: true },
        });
        expect(out.user.is_new_user).toBe(true);
    });

    it("leaves it false when the token has none", async () => {
        const out = await callbacks().session({ session: { user: {} }, token: { id: "u" } });
        expect(out.user.is_new_user).toBeFalsy();
    });
});
