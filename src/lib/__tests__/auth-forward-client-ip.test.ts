import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// End-user address on the auth-service calls: login and refresh forward one validated
// X-Forwarded-For value, so auth-service rate limits per user and not per web pod.

const { nextAuthConfig } = vi.hoisted(() => ({ nextAuthConfig: { value: null as unknown } }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));
vi.mock("next/headers", () => ({ headers: headersMock }));
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
    const l = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
    };
    l.child.mockReturnValue(l);
    return { logger: l };
});

import "@/lib/auth";
import Credentials from "next-auth/providers/credentials";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import { ISSUER, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";

const user = {
    id: "u1",
    email: "a@example.test",
    org_id: "o1",
    role: "admin",
    is_superuser: false,
};
const answer = () =>
    new Response(
        JSON.stringify({
            access_token: mint({ exp: inSeconds(3600) }),
            refresh_token: "ref-2",
            expires_in: 3600,
            needs_onboarding: false,
            user,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
    );

type Authorize = (
    credentials: Record<string, string>,
    request?: Request,
) => Promise<Record<string, unknown> | null>;
function authorize(): Authorize {
    const configs = vi.mocked(Credentials).mock.calls.map((c) => c[0] as { authorize?: unknown });
    const found = configs.find((c) => typeof c.authorize === "function")?.authorize;
    if (typeof found !== "function") throw new Error("authorize not captured");
    return found as Authorize;
}
type Jwt = (p: { token: Record<string, unknown> }) => Promise<Record<string, unknown>>;
const jwt = (): Jwt => (nextAuthConfig.value as { callbacks: { jwt: Jwt } }).callbacks.jwt;

const creds = { email: "a@example.test", password: "pw" };
const fetchMock = vi.fn();
const withXff = (value: string) =>
    new Request("http://web.test/api/auth/callback/credentials", {
        method: "POST",
        headers: { "x-forwarded-for": value },
    });
const sentXff = (): string[] =>
    fetchMock.mock.calls
        .filter(([url]) => !String(url).startsWith(ISSUER))
        .map(([, init]) => new Headers((init as RequestInit).headers).get("x-forwarded-for") ?? "");
const expiredToken = () => ({
    access_token: "old",
    refresh_token: "ref-1",
    expires_at: Date.now() - 60_000,
    last_validated: Date.now(),
});

beforeEach(() => {
    fetchMock.mockReset();
    resetKeySetCacheForTests();
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    fetchMock.mockImplementation(
        eddsaFetch({ "/api/v1/auth/login": answer, "/api/v1/auth/refresh": answer }),
    );
    headersMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("login forwards the end-user address", () => {
    it("sends the right-most hop as X-Forwarded-For when TRUST_PROXY is on", async () => {
        vi.stubEnv("TRUST_PROXY", "true");
        await authorize()(creds, withXff("203.0.113.9, 198.51.100.7"));
        expect(sentXff()).toEqual(["198.51.100.7"]);
    });

    it("sends the header with exactly one value when the client wrote more hops", async () => {
        vi.stubEnv("TRUST_PROXY", "true");
        await authorize()(creds, withXff("6.6.6.6, 203.0.113.9, 198.51.100.7"));
        expect(sentXff()).toEqual(["198.51.100.7"]);
    });

    it("sends none when TRUST_PROXY is off", async () => {
        vi.stubEnv("TRUST_PROXY", "false");
        await authorize()(creds, withXff("198.51.100.7"));
        expect(sentXff()).toEqual([""]);
    });

    it("sends none when the selected hop is not an address (no anon or unknown value)", async () => {
        vi.stubEnv("TRUST_PROXY", "true");
        await authorize()(creds, withXff("not-an-ip"));
        await authorize()(creds, new Request("http://web.test/x", { method: "POST" }));
        expect(sentXff()).toEqual(["", ""]);
    });

    it("sends none when authorize has no request", async () => {
        vi.stubEnv("TRUST_PROXY", "true");
        await authorize()(creds);
        expect(sentXff()).toEqual([""]);
    });
});

describe("refresh forwards the end-user address", () => {
    it("sends the right-most hop as X-Forwarded-For when TRUST_PROXY is on", async () => {
        vi.stubEnv("TRUST_PROXY", "true");
        headersMock.mockResolvedValue(
            new Headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.7" }),
        );
        await jwt()({ token: expiredToken() });
        expect(sentXff()).toEqual(["198.51.100.7"]);
    });

    it("sends none when TRUST_PROXY is off", async () => {
        vi.stubEnv("TRUST_PROXY", "false");
        headersMock.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.7" }));
        await jwt()({ token: expiredToken() });
        expect(sentXff()).toEqual([""]);
    });

    it("sends none when the hop is invalid", async () => {
        vi.stubEnv("TRUST_PROXY", "true");
        headersMock.mockResolvedValue(new Headers({ "x-forwarded-for": "garbage" }));
        await jwt()({ token: expiredToken() });
        expect(sentXff()).toEqual([""]);
    });

    it("sends none when request headers are not available", async () => {
        vi.stubEnv("TRUST_PROXY", "true");
        headersMock.mockRejectedValue(new Error("outside a request scope"));
        await jwt()({ token: expiredToken() });
        expect(sentXff()).toEqual([""]);
    });
});
