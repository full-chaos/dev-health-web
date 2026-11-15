import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { nextAuthConfig, nextAuthSession } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    nextAuthSession: { value: null as unknown },
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => ({
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: vi.fn(async () => nextAuthSession.value),
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

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { ISSUER, inSeconds, mint } from "@/test/eddsaAnswer";

// The published key set is the test signer's key; the exchange answer carries a signed access token.
vi.mock("@/lib/authKeySource", async () => {
    const { keysResponse } = await import("@/test/eddsaAnswer");
    const { keys } = (await keysResponse().json()) as { keys: unknown[] };
    return {
        resetKeySourceForTests: vi.fn(),
        publishedKeysFor: vi.fn(async () => ({ ok: true, keys })),
    };
});
const ACCESS = mint({ exp: inSeconds(1800) });

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

type SignIn = (params: { account?: Token | null }) => Promise<boolean | string>;

function callbacks(): { jwt: Jwt; session: SessionCb; signIn: SignIn } {
    const config = nextAuthConfig.value as {
        callbacks: { jwt: Jwt; session: SessionCb; signIn: SignIn };
    };
    return config.callbacks;
}

// One OAuth callback (CHAOS-13756): signIn runs the social exchange and must accept it; jwt then
// stores the accepted answer for the same account object, is_new_user included.
async function socialSignIn(token: Token): Promise<Token> {
    const account = { ...socialAccount };
    expect(await callbacks().signIn({ account })).toBe(true);
    return callbacks().jwt({ token, user: { id: "p" }, account });
}

function socialResponse(isNewUser: boolean | undefined): Response {
    const body: Record<string, unknown> = {
        user: { id: "user-9", org_id: null, role: null, is_superuser: false },
        needs_onboarding: true,
        access_token: ACCESS,
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
    beforeEach(() => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("sets the flag only when the social exchange says the user is new", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(socialResponse(true)));
        const token = await socialSignIn({});
        expect(token.is_new_user).toBe(true);
    });

    it.each([false, undefined])("does not set the flag when is_new_user is %s", async (value) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(socialResponse(value)));
        const token = await socialSignIn({});
        expect(token.is_new_user).toBeFalsy();
    });

    it.each(["true", 1, "yes", {}])(
        "does not set the flag for a non-boolean is_new_user (%j)",
        async (value) => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue(
                    new Response(
                        JSON.stringify({
                            user: { id: "user-9" },
                            needs_onboarding: true,
                            access_token: ACCESS,
                            refresh_token: "rt",
                            expires_in: 3600,
                            is_new_user: value,
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } },
                    ),
                ),
            );
            const token = await socialSignIn({});
            expect(token.is_new_user).toBeFalsy();
        },
    );

    it("a new social sign-in replaces a flag left by an earlier one", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(socialResponse(false)));
        const token = await socialSignIn({ is_new_user: true });
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

describe("CHAOS-13756 the social sign-in contract for is_new_user", () => {
    beforeEach(() => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("Case 1: a new social user with an accepted hand-off gets is_new_user=true and reaches onboarding", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(socialResponse(true)));
        const token = await socialSignIn({});
        expect(token.is_new_user).toBe(true);
        expect(token.needs_onboarding).toBe(true);
        const out = await callbacks().session({ session: { user: {} }, token });
        expect(out.user.is_new_user).toBe(true);
        expect(out.user.needs_onboarding).toBe(true);
        // The onboarding consumer: requireSession sends a session that needs onboarding to /auth/onboard
        // (src/lib/auth.ts requireSession); the app layout passes is_new_user on as isNewUser.
        nextAuthSession.value = out;
        vi.mocked(redirect).mockClear();
        await requireSession();
        expect(vi.mocked(redirect).mock.calls).toEqual([["/auth/onboard"]]);
        nextAuthSession.value = null;
    });

    // Case 2: the old cases drove the exchange inside jwt. With no accepted hand-off jwt writes no
    // session at all (null): no token, no flag, and no backend call from jwt.
    const nonBoolean = (value: unknown) => () =>
        new Response(
            JSON.stringify({ user: { id: "user-9" }, access_token: ACCESS, is_new_user: value }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    const oldCases: [string, Token, () => Response][] = [
        [
            "sets the flag only when the social exchange says the user is new",
            {},
            () => socialResponse(true),
        ],
        ["does not set the flag when is_new_user is false", {}, () => socialResponse(false)],
        [
            "does not set the flag when is_new_user is undefined",
            {},
            () => socialResponse(undefined),
        ],
        ['does not set the flag for a non-boolean is_new_user ("true")', {}, nonBoolean("true")],
        ["does not set the flag for a non-boolean is_new_user (1)", {}, nonBoolean(1)],
        ['does not set the flag for a non-boolean is_new_user ("yes")', {}, nonBoolean("yes")],
        ["does not set the flag for a non-boolean is_new_user ({})", {}, nonBoolean({})],
        [
            "a new social sign-in replaces a flag left by an earlier one",
            { is_new_user: true },
            () => socialResponse(false),
        ],
    ];
    it.each(oldCases)(
        "Case 2 (%s): jwt without an accepted hand-off writes no session",
        async (_name, token, answer) => {
            const fetchMock = vi.fn().mockImplementation(async () => answer());
            vi.stubGlobal("fetch", fetchMock);
            const out = await callbacks().jwt({
                token,
                user: { id: "p" },
                account: { ...socialAccount },
            });
            expect(out).toBeNull();
            expect(fetchMock).not.toHaveBeenCalled();
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
