import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

// CHAOS-8441: a refused refresh runs through the real jwt and session callbacks, the real auth() read, the real
// proxy and the real sign-in page. Only the backend answer and next-auth's own cookie read are stubbed.
const { nextAuthConfig, nextAuthSession } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    nextAuthSession: { value: null as unknown },
}));

vi.mock("next/navigation", () => ({
    redirect: vi.fn((url: string) => {
        throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT", url });
    }),
}));

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
vi.mock("@/lib/logger", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/logger")>();
    return {
        ...actual,
        logger: {
            ...actual.logger,
            child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
        },
    };
});
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(async () => ({ limited: false, retryAfter: 0 })),
}));
vi.mock("@/components/auth/LoginForm", () => ({
    LoginForm: () => createElement("form", { "data-testid": "login-form" }),
}));
vi.mock("@/components/auth/AuthCard", () => ({
    AuthCard: ({ children }: { children?: unknown }) =>
        createElement("section", null, children as never),
}));
vi.mock("@/components/auth/SsoEntry", () => ({ SsoEntry: () => null }));

import { auth as authModuleAuth } from "@/lib/auth";
import { ISSUER } from "@/test/eddsaAnswer";
import { proxy } from "@/proxy";
import SignInPage from "@/app/(auth)/auth/signin/page";

type Callbacks = {
    jwt: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
    session: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const callbacks = (): Callbacks => (nextAuthConfig.value as { callbacks: Callbacks }).callbacks;

function refusedRefresh(headers: Record<string, string>): void {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            headers: new Headers(headers),
            json: async () => ({
                detail: { message: "Rate limit exceeded. Please try again later." },
            }),
        } as unknown as Response),
    );
}

async function sessionAfterRefusedRefresh(headers: Record<string, string>) {
    refusedRefresh(headers);
    const token = await callbacks().jwt({
        token: {
            id: "user-1",
            email: "u@example.com",
            org_id: "org-1",
            role: "member",
            access_token: "old-access",
            refresh_token: "old-refresh",
            expires_at: Date.now() - 1000,
            last_validated: Date.now(),
        },
        user: null,
        account: null,
    });
    const session = await callbacks().session({
        session: { user: {}, expires: "2099-01-01T00:00:00Z" },
        token,
    });
    return { token, session };
}

async function signInPageAt(
    params: Record<string, string>,
): Promise<{ redirect?: string; html?: string }> {
    try {
        const page = (await SignInPage({ searchParams: Promise.resolve(params) })) as ReactElement;
        return { html: renderToStaticMarkup(page) };
    } catch (error) {
        const url = (error as { url?: string }).url;
        if (url === undefined) throw error;
        return { redirect: url };
    }
}

beforeEach(() => {
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    nextAuthSession.value = null;
});

describe("a refused refresh (429)", () => {
    // W4: the sign-in page reads auth(), which answers null for a session without an access token or with an
    // error, so the page shows the form: there is no sign-in redirect loop.
    it("W4: the sign-in page renders and does not redirect to the callback URL", async () => {
        const { session } = await sessionAfterRefusedRefresh({ "Retry-After": "900" });
        nextAuthSession.value = session;
        expect(session.access_token).toBeUndefined();
        expect(await authModuleAuth()).toBeNull();
        const page = await signInPageAt({ callbackUrl: "/dashboard" });
        expect(page.redirect).toBeUndefined();
        expect(page.html).toContain("login-form");
    });

    it("keeps the refresh token and backs off for Retry-After", async () => {
        const before = Date.now();
        const { token } = await sessionAfterRefusedRefresh({ "Retry-After": "120" });
        expect(token.error).toBe("refresh_rate_limited");
        expect(token.refresh_token).toBe("old-refresh");
        expect(token.access_token).toBeUndefined();
        const nextRefreshAt = (token.expires_at as number) - 5 * 60 * 1000;
        expect(nextRefreshAt).toBeGreaterThanOrEqual(before + 120_000);
        expect(nextRefreshAt).toBeLessThanOrEqual(Date.now() + 120_000);
    });

    it("the proxy sends the user to sign-in with the rate-limit code, and the page says what to do", async () => {
        const { session } = await sessionAfterRefusedRefresh({ "Retry-After": "900" });
        nextAuthSession.value = session;
        const res = await proxy(
            new NextRequest(new URL("/dashboard?x=1", "http://localhost:3000")),
        );
        expect(res.status).toBe(303);
        const location = new URL(res.headers.get("Location")!);
        expect(location.pathname).toBe("/auth/signin");
        expect(location.searchParams.get("error")).toBe("refresh_rate_limited");
        expect(location.searchParams.get("callbackUrl")).toBe("/dashboard?x=1");
        const page = await signInPageAt(Object.fromEntries(location.searchParams));
        expect(page.html).toContain("Wait up to 15 minutes and reload the page, or sign in again.");
    });
});
