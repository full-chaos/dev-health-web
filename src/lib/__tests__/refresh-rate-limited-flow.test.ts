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

import { auth as authModuleAuth } from "@/lib/auth";
import { ISSUER } from "@/test/eddsaAnswer";
import { proxy } from "@/proxy";
import SignInPage from "@/app/(auth)/auth/signin/page";

const NAVIGATE = { "sec-fetch-mode": "navigate" };

type Callbacks = {
    jwt: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
    session: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const callbacks = (): Callbacks => (nextAuthConfig.value as { callbacks: Callbacks }).callbacks;

function refusedRefresh(headers: Record<string, string>, latencyMs = 0): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
            if (latencyMs > 0) vi.setSystemTime(Date.now() + latencyMs);
            return {
                ok: false,
                status: 429,
                headers: new Headers(headers),
                json: async () => ({
                    detail: { message: "Rate limit exceeded. Please try again later." },
                }),
            } as unknown as Response;
        }),
    );
}

async function sessionAfterRefusedRefresh(headers: Record<string, string>, latencyMs = 0) {
    refusedRefresh(headers, latencyMs);
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
    vi.useRealTimers();
    vi.restoreAllMocks();
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
            new NextRequest(new URL("/dashboard?x=1", "http://localhost:3000"), {
                headers: NAVIGATE,
            }),
        );
        expect(res.status).toBe(303);
        const location = new URL(res.headers.get("Location")!);
        expect(location.pathname).toBe("/auth/signin");
        expect(location.searchParams.get("error")).toBe("refresh_rate_limited");
        expect(location.searchParams.get("callbackUrl")).toBe("/dashboard?x=1");
        const page = await signInPageAt(Object.fromEntries(location.searchParams));
        expect(page.html).toContain("Wait up to 15 minutes and reload the page, or sign in again.");
    });

    it("waits Retry-After from the answer, not from the request start", async () => {
        vi.useFakeTimers({ toFake: ["Date"], now: 1_795_000_000_000 });
        const { token } = await sessionAfterRefusedRefresh({ "Retry-After": "900" }, 2_000);
        expect((token.expires_at as number) - 5 * 60 * 1000).toBe(
            1_795_000_000_000 + 2_000 + 900_000,
        );
    });

    it.each([
        ["0", 5_000],
        ["\t30", 30_000],
        ["86400", 15 * 60 * 1000],
    ])("Retry-After %j waits %i ms (floor 5 s, cap 15 min)", async (header, wait) => {
        vi.useFakeTimers({ toFake: ["Date"], now: 1_795_000_000_000 });
        const { token } = await sessionAfterRefusedRefresh({ "Retry-After": header });
        expect((token.expires_at as number) - 5 * 60 * 1000 - 1_795_000_000_000).toBe(wait);
    });

    it("a malformed Retry-After gets the jittered back-off", async () => {
        vi.useFakeTimers({ toFake: ["Date"], now: 1_795_000_000_000 });
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        const { token } = await sessionAfterRefusedRefresh({ "Retry-After": "\u00a0120" });
        expect((token.expires_at as number) - 5 * 60 * 1000 - 1_795_000_000_000).toBe(32_500);
    });

    it("the site root redirects to sign-in with the code; a non-GET request keeps the plain redirect", async () => {
        const { session } = await sessionAfterRefusedRefresh({ "Retry-After": "900" });
        nextAuthSession.value = session;
        const root = await proxy(
            new NextRequest(new URL("/", "http://localhost:3000"), { headers: NAVIGATE }),
        );
        expect(root.status).toBe(303);
        expect(new URL(root.headers.get("Location")!).searchParams.get("error")).toBe(
            "refresh_rate_limited",
        );
        const graphql = await proxy(
            new NextRequest(new URL("/graphql", "http://localhost:3000"), { method: "POST" }),
        );
        expect(graphql.status).toBe(303);
        const location = new URL(graphql.headers.get("Location")!);
        expect(location.pathname + location.search).toBe("/auth/signin?callbackUrl=%2Fgraphql");
    });

    // An errored session that still holds a bearer (a live delegated one) is null to every auth() read, as on
    // main: the proxy never lets it through.
    it("a rate-limited session that still holds an access token is refused by the proxy", async () => {
        nextAuthSession.value = {
            user: { id: "user-1", org_id: "org-2", is_impersonating: true },
            access_token: "live-delegated",
            error: "refresh_rate_limited",
            expires: "2099-01-01T00:00:00Z",
        };
        expect(await authModuleAuth({ refusal: "refresh_rate_limited" })).toBeNull();
        const res = await proxy(new NextRequest(new URL("/dashboard", "http://localhost:3000")));
        expect(res.status).toBe(303);
        const location = new URL(res.headers.get("Location")!);
        expect(location.pathname).toBe("/auth/signin");
        expect(location.searchParams.get("error")).toBeNull();
    });

    // Only a browser navigation (Sec-Fetch-Mode: navigate, GET or HEAD) gets the code; every other request keeps
    // main's plain sign-in redirect.
    it.each([
        [
            "a navigate GET",
            "GET",
            "/dashboard",
            { "sec-fetch-mode": "navigate" },
            "refresh_rate_limited",
        ],
        [
            "a navigate HEAD",
            "HEAD",
            "/dashboard",
            { "sec-fetch-mode": "navigate" },
            "refresh_rate_limited",
        ],
        [
            "a background fetch (cors GET)",
            "GET",
            "/api/agent-context/repositories",
            { "sec-fetch-mode": "cors" },
            null,
        ],
        ["a GET with no fetch metadata", "GET", "/dashboard", {}, null],
        ["a navigate POST", "POST", "/dashboard", { "sec-fetch-mode": "navigate" }, null],
        ["a POST with no fetch metadata", "POST", "/dashboard", {}, null],
    ])(
        "%s: the sign-in redirect code is as expected",
        async (_name, method, path, headers, code) => {
            const { session } = await sessionAfterRefusedRefresh({ "Retry-After": "900" });
            nextAuthSession.value = session;
            const res = await proxy(
                new NextRequest(new URL(path, "http://localhost:3000"), { method, headers }),
            );
            expect(res.status).toBe(303);
            const location = new URL(res.headers.get("Location")!);
            expect(location.pathname).toBe("/auth/signin");
            expect(location.searchParams.get("error")).toBe(code);
        },
    );
});
