import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stallingFetch, track } from "@/test/stallFetch";

// CHAOS-9103: the auth jwt callback runs on the FIRST request of a session (validate, refresh)
// and in the app layout. A backend call that is accepted and never answered must not hold the
// request for ever. The deadline turns it into the existing "kept, retry after backoff" branch.

const { nextAuthConfig, warn } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    warn: vi.fn(),
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
    const l = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn,
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
    };
    l.child.mockReturnValue(l);
    return { logger: l };
});

import "@/lib/auth";
import { resetValidationMemoForTests } from "@/lib/authValidationMemo";

type Token = Record<string, unknown>;
type JwtCallback = (params: { token: Token; user?: unknown; account?: unknown }) => Promise<Token>;
const jwt = (): JwtCallback =>
    (nextAuthConfig.value as { callbacks: { jwt: JwtCallback } }).callbacks.jwt;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const deadlineLines = () =>
    warn.mock.calls.filter(([, msg]) => msg === "server fetch deadline exceeded");

beforeEach(() => {
    resetValidationMemoForTests();
    warn.mockClear();
    process.env.SERVER_FETCH_DEADLINE_AUTH_MS = "40";
});
afterEach(() => {
    delete process.env.SERVER_FETCH_DEADLINE_AUTH_MS;
    vi.unstubAllGlobals();
});

describe("auth jwt callback with a backend that never answers", () => {
    it("a FRESH session (never validated): validate settles at the deadline, session kept", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const token: Token = {
            id: "user-1",
            access_token: "access",
            refresh_token: "refresh",
            expires_at: Date.now() + 3_600_000,
        };
        const state = track(jwt()({ token, account: null }));
        await sleep(600);
        expect(state.settled).toBe(true);
        expect((state.value as Token).access_token).toBe("access");
        expect((state.value as Token).error).toBeUndefined();
        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toMatchObject({
            op: "POST /api/v1/auth/validate",
            deadline_ms: 40,
        });
    });

    it("a concurrent second request does not wait on the stuck validate for ever", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const make = (): Token => ({
            id: "user-1",
            access_token: "access",
            refresh_token: "refresh",
            expires_at: Date.now() + 3_600_000,
        });
        const a = track(jwt()({ token: make(), account: null }));
        const b = track(jwt()({ token: make(), account: null }));
        await sleep(600);
        expect(a.settled).toBe(true);
        expect(b.settled).toBe(true);
    });

    it("an expired token: refresh settles at the deadline (access token dropped, refresh kept)", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const token: Token = {
            id: "user-1",
            access_token: "access",
            refresh_token: "refresh",
            expires_at: Date.now() - 1_000,
        };
        const state = track(jwt()({ token, account: null }));
        await sleep(600);
        expect(state.settled).toBe(true);
        expect(deadlineLines()[0][0]).toMatchObject({ op: "POST /api/v1/auth/refresh" });
        expect((state.value as Token).refresh_token).toBe("refresh");
    });
});
