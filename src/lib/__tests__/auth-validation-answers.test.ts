import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-8444: backend validation ends a session only on an answer that refuses
// it. An answer that says nothing about the user (a 404 from a router with no
// backend during a roll, a 400, a 422, a body without `valid`) keeps both
// tokens and is retried after backoff.

const { nextAuthConfig } = vi.hoisted(() => ({
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

vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/github", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/gitlab", () => ({ default: vi.fn() }));

vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));

vi.mock("@/lib/logger", () => {
    const child = (): Record<string, unknown> => ({
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child,
    });
    return { logger: child() };
});

import "@/lib/auth";
import { resetValidationMemoForTests } from "@/lib/authValidationMemo";

const ACCESS_TOKEN = "access-token";
const REFRESH_TOKEN = "refresh-token";

type Token = Record<string, unknown>;
type JwtCallback = (params: { token: Token; user?: unknown; account?: unknown }) => Promise<Token>;

function jwtCallback(): JwtCallback {
    const config = nextAuthConfig.value as { callbacks?: { jwt?: JwtCallback } } | null;
    const jwt = config?.callbacks?.jwt;
    if (!jwt) throw new Error("JWT callback not captured from NextAuth config");
    return jwt;
}

/** A fresh token whose last validation is older than the interval: validation runs. */
function validationDueToken(): Token {
    return {
        id: "user-1",
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_at: Date.now() + 60 * 60 * 1000,
        last_validated: Date.now() - 6 * 60 * 1000,
    };
}

function backendAnswers(status: number, body: string): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

async function validate(token: Token = validationDueToken()): Promise<Token> {
    return jwtCallback()({ token, account: null });
}

function expectSessionKept(token: Token): void {
    expect(token.access_token).toBe(ACCESS_TOKEN);
    expect(token.refresh_token).toBe(REFRESH_TOKEN);
    expect(token.error).toBeUndefined();
    expect(token.validation_failures).toBe(1);
}

function expectSessionEnded(token: Token): void {
    expect(token.access_token).toBeUndefined();
    expect(token.refresh_token).toBeUndefined();
    expect(token.error).toBe("user_invalid");
}

beforeEach(() => {
    resetValidationMemoForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("answers that refuse the session end it", () => {
    it("a 200 with valid false", async () => {
        backendAnswers(200, JSON.stringify({ valid: false }));

        expectSessionEnded(await validate());
    });

    it.each([401, 403])("status %i, whatever the body says", async (status) => {
        backendAnswers(status, JSON.stringify({ detail: "refused" }));

        expectSessionEnded(await validate());
    });
});

describe("answers that say nothing about the user keep the session", () => {
    it.each([400, 404, 409, 422])("status %i keeps both tokens", async (status) => {
        backendAnswers(status, JSON.stringify({ detail: "not this endpoint" }));

        expectSessionKept(await validate());
    });

    it.each([429, 500, 502, 503])("status %i keeps both tokens (as before)", async (status) => {
        backendAnswers(status, "");

        expectSessionKept(await validate());
    });

    it.each([
        ["an empty object", "{}"],
        ["valid as a string", JSON.stringify({ valid: "false" })],
        ["valid as null", JSON.stringify({ valid: null })],
        ["a JSON null", "null"],
        ["a body that is not JSON", "<html>bad gateway</html>"],
    ])("a 200 with %s keeps both tokens", async (_name, body) => {
        backendAnswers(200, body);

        expectSessionKept(await validate());
    });

    it("a kept session does not call the backend again before the backoff ends", async () => {
        const fetchMock = backendAnswers(404, "");

        const first = await validate();
        const second = await validate({ ...validationDueToken() });

        expectSessionKept(first);
        expect(second.access_token).toBe(ACCESS_TOKEN);
        expect(second.error).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("the failure count grows with each backend answer that keeps the session", async () => {
        backendAnswers(404, "");

        const token = await validate({ ...validationDueToken(), validation_failures: 2 });

        expect(token.validation_failures).toBe(3);
        expect(token.access_token).toBe(ACCESS_TOKEN);
    });
});

describe("an answer that confirms the user", () => {
    it("a 200 with valid true keeps the session and resets the failure count", async () => {
        backendAnswers(200, JSON.stringify({ valid: true }));

        const token = await validate({ ...validationDueToken(), validation_failures: 4 });

        expect(token.access_token).toBe(ACCESS_TOKEN);
        expect(token.refresh_token).toBe(REFRESH_TOKEN);
        expect(token.error).toBeUndefined();
        expect(token.validation_failures).toBe(0);
    });
});
