import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Periodic backend validation runs at most once per interval (60 s) per token, and a refused
// session ends on the first jwt callback after that interval.

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
import { processMemo } from "@/lib/processMemo";

const ACCESS_TOKEN = "access-token";
const REFRESH_TOKEN = "refresh-token";
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);

type Token = Record<string, unknown>;
type JwtCallback = (params: { token: Token; user?: unknown; account?: unknown }) => Promise<Token>;

function jwtCallback(): JwtCallback {
    const config = nextAuthConfig.value as { callbacks?: { jwt?: JwtCallback } } | null;
    const jwt = config?.callbacks?.jwt;
    if (!jwt) throw new Error("JWT callback not captured from NextAuth config");
    return jwt;
}

function freshToken(): Token {
    return {
        id: "user-1",
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_at: T0 + 60 * 60 * 1000,
    };
}

function dueToken(): Token {
    return { ...freshToken(), last_validated: T0 - 6 * 60 * 1000 };
}

async function callbackAt(offsetMs: number, token: Token): Promise<Token> {
    vi.setSystemTime(T0 + offsetMs);
    return jwtCallback()({ token, account: null });
}

function answers(status: number, body: string): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    resetValidationMemoForTests();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("validation interval", () => {
    it("200 callbacks in 59 s make one validate call; the callback at 61 s makes a second", async () => {
        const fetchMock = answers(200, JSON.stringify({ valid: true }));
        let token = await callbackAt(0, freshToken());
        expect(fetchMock).toHaveBeenCalledTimes(1);
        for (let i = 1; i <= 200; i += 1) {
            token = await callbackAt(Math.round((59_000 * i) / 200), token);
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);
        token = await callbackAt(61_000, token);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(token.error).toBeUndefined();
    });

    it("a token whose answer turns to valid false is signed out on the first callback after 60 s", async () => {
        answers(200, JSON.stringify({ valid: true }));
        let token = await callbackAt(0, freshToken());
        expect(token.error).toBeUndefined();

        answers(200, JSON.stringify({ valid: false }));
        token = await callbackAt(30_000, token);
        expect(token.error).toBeUndefined();
        token = await callbackAt(61_000, token);
        expect(token.error).toBe("user_invalid");
        expect(token.access_token).toBeUndefined();
        expect(token.refresh_token).toBeUndefined();
    });

    it("the callback at exactly 60 s validates and signs a refused token out", async () => {
        answers(200, JSON.stringify({ valid: true }));
        let token = await callbackAt(0, freshToken());
        expect(token.error).toBeUndefined();

        const fetchMock = answers(200, JSON.stringify({ valid: false }));
        token = await callbackAt(59_999, token);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(token.error).toBeUndefined();
        token = await callbackAt(60_000, token);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(token.error).toBe("user_invalid");
        expect(token.access_token).toBeUndefined();
    });
});

describe("forced sign-out bound (60 s from the last backend check)", () => {
    it("a memo hit keeps the memo's check time, so a refused session ends at 60 s, not 60 s after the hit", async () => {
        // A copy of the session cookie that was not updated by the last check (a parallel request,
        // a second tab) still carries the old last_validated; its access token is the same.
        answers(200, JSON.stringify({ valid: true }));
        const stale = await callbackAt(0, freshToken());
        let current = await callbackAt(61_000, { ...stale, last_validated: T0 });
        expect(current.last_validated).toBe(T0 + 61_000);

        // The backend ends the user at 62 s. A callback with the stale copy at 119 s hits the memo
        // (checked at 61 s, valid until 121 s).
        const fetchMock = answers(200, JSON.stringify({ valid: false }));
        let copy = await callbackAt(119_000, { ...stale, last_validated: T0 });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(copy.last_validated).toBe(T0 + 61_000);

        // At 121 s (60 s after the last backend check) the copy is checked and signed out.
        copy = await callbackAt(121_000, copy);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(copy.error).toBe("user_invalid");
        expect(copy.access_token).toBeUndefined();
        current = await callbackAt(121_000, current);
        expect(current.error).toBe("user_invalid");
    });
});

describe("every stamp the new code writes holds the 60 s bound", () => {
    // The backend's last real check is at C. Whatever path stamps a copy of the session after it,
    // the backend refusing the user makes that copy validate, and sign out, at C + 60 s.
    const C = 61_000;

    async function checkedAtC(): Promise<Token> {
        answers(200, JSON.stringify({ valid: true }));
        const login = await callbackAt(0, freshToken());
        const checked = await callbackAt(C, { ...login, last_validated: T0 });
        expect(checked.last_validated).toBe(T0 + C);
        return login;
    }

    async function signedOutAtBound(copy: Token): Promise<void> {
        const fetchMock = answers(200, JSON.stringify({ valid: false }));
        const out = await callbackAt(C + 60_000, copy);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(out.error).toBe("user_invalid");
        expect(out.access_token).toBeUndefined();
    }

    it("the stamp of the real check", async () => {
        const login = await checkedAtC();
        const checked = await callbackAt(C + 1, { ...login, last_validated: T0 + C });
        expect(checked.last_validated).toBe(T0 + C);
        await signedOutAtBound(checked);
    });

    it.each([1, 30_000, 59_999])("the stamp of a memo hit %i ms after the check", async (hitMs) => {
        const login = await checkedAtC();
        const hit = await callbackAt(C + hitMs, { ...login, last_validated: T0 });
        expect(hit.last_validated).toBe(T0 + C);
        await signedOutAtBound(hit);
    });

    it("the stamp of a callback that joins a check in flight", async () => {
        answers(200, JSON.stringify({ valid: true }));
        const login = await callbackAt(0, freshToken());
        let release: (res: Response) => void = () => undefined;
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise<Response>((resolve) => {
                        release = resolve;
                    }),
            ),
        );
        // Count the memo reads that find the check in flight: the cell fails unless the second
        // callback really joins it (the backend answer is held until then).
        const memoGet = vi.spyOn(processMemo<{ kind: string }>("authValidationMemo"), "get");
        const inFlightReads = (): number =>
            memoGet.mock.results.filter(
                (r) =>
                    r.type === "return" &&
                    (r.value as { kind?: string } | undefined)?.kind === "inFlight",
            ).length;
        try {
            vi.setSystemTime(T0 + C);
            const first = jwtCallback()({ token: { ...login, last_validated: T0 }, account: null });
            await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
            vi.setSystemTime(T0 + C + 5_000);
            const joined = jwtCallback()({
                token: { ...login, last_validated: T0 },
                account: null,
            });
            await vi.waitFor(() => expect(inFlightReads()).toBe(1), { timeout: 5_000 });
            release(new Response(JSON.stringify({ valid: true }), { status: 200 }));
            const [, copy] = await Promise.all([first, joined]);
            expect(inFlightReads()).toBe(1);
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(copy.last_validated).toBe(T0 + C);
            await signedOutAtBound(copy);
        } finally {
            memoGet.mockRestore();
        }
    });
});

describe("terminal answers end the session", () => {
    it("a 200 with valid false", async () => {
        answers(200, JSON.stringify({ valid: false }));
        const token = await callbackAt(0, dueToken());
        expect(token.error).toBe("user_invalid");
        expect(token.access_token).toBeUndefined();
    });

    it.each([401, 403])("status %i", async (status) => {
        answers(status, JSON.stringify({ detail: "refused" }));
        const token = await callbackAt(0, dueToken());
        expect(token.error).toBe("user_invalid");
        expect(token.access_token).toBeUndefined();
    });
});

describe("transient answers keep the session", () => {
    it.each([404, 429, 500, 502, 503])("status %i", async (status) => {
        answers(status, JSON.stringify({ detail: "later" }));
        const token = await callbackAt(0, dueToken());
        expect(token.error).toBeUndefined();
        expect(token.access_token).toBe(ACCESS_TOKEN);
        expect(token.validation_failures).toBe(1);
    });

    it("an unparseable 200 body", async () => {
        answers(200, "<html>not json</html>");
        const token = await callbackAt(0, dueToken());
        expect(token.error).toBeUndefined();
        expect(token.access_token).toBe(ACCESS_TOKEN);
        expect(token.validation_failures).toBe(1);
    });

    it.each([
        ["a network error", new TypeError("fetch failed")],
        ["a deadline", Object.assign(new Error("timed out"), { name: "TimeoutError" })],
    ])("%s", async (_name, failure) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw failure;
            }),
        );
        const token = await callbackAt(0, dueToken());
        expect(token.error).toBeUndefined();
        expect(token.access_token).toBe(ACCESS_TOKEN);
        expect(token.validation_failures).toBe(1);
    });
});
