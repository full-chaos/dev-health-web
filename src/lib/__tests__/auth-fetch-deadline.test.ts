import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { headersThenStalledBody, stallingFetch, track } from "@/test/stallFetch";

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

import type { JWT } from "next-auth/jwt";
import "@/lib/auth";
import { overrideDeadlinesForTests } from "@/lib/serverDeadline";
import { applyBackendValidationMemo, resetValidationMemoForTests } from "@/lib/authValidationMemo";

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
    overrideDeadlinesForTests({ auth: 40, outerMargin: 60, slow: 5_000 });
});
afterEach(() => {
    overrideDeadlinesForTests(null);
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

    it("an expired token: refresh is NOT bounded (it changes state) but is logged slow", async () => {
        overrideDeadlinesForTests({ auth: 40, outerMargin: 60, slow: 30 });
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise<Response>((resolve) =>
                        setTimeout(
                            () =>
                                resolve(
                                    new Response(
                                        JSON.stringify({
                                            access_token: "new-access",
                                            refresh_token: "new-refresh",
                                        }),
                                        { status: 200 },
                                    ),
                                ),
                            150,
                        ),
                    ),
            ),
        );
        const token: Token = {
            id: "user-1",
            access_token: "access",
            refresh_token: "refresh",
            expires_at: Date.now() - 1_000,
        };
        const out = await jwt()({ token, account: null });
        expect(out.access_token).toBe("new-access"); // answered at 150 ms, past the 40 ms auth deadline
        // the refresh is never bounded (the validate that follows it is, and its line is separate)
        expect(
            deadlineLines().filter(([f]) => String((f as { op: string }).op).includes("refresh")),
        ).toHaveLength(0);
        const slow = warn.mock.calls.filter(([, m]) => m === "server fetch slow");
        expect(slow.length).toBeGreaterThanOrEqual(1);
        expect(slow[0][0]).toMatchObject({ op: "POST /api/v1/auth/refresh", outcome: "ok" });
    });

    it("a stalled impersonate-status settles at the deadline and is not retried for 30 s", async () => {
        const fetchMock = stallingFetch();
        vi.stubGlobal("fetch", fetchMock);
        const make = (): Token => ({
            id: "su-1",
            is_superuser: true,
            access_token: "access",
            refresh_token: "refresh",
            expires_at: Date.now() + 3_600_000,
            last_validated: Date.now(),
        });
        const first = track(jwt()({ token: make(), account: null }));
        await sleep(600);
        expect(first.settled).toBe(true);
        expect(deadlineLines()[0][0]).toMatchObject({
            op: "GET /api/v1/admin/impersonate/status",
        });
        const calls = vi.mocked(fetchMock).mock.calls.length;
        const started = Date.now();
        await jwt()({ token: make(), account: null });
        expect(Date.now() - started).toBeLessThan(35); // no second wait
        expect(vi.mocked(fetchMock).mock.calls.length).toBe(calls);
    });

    it("stalled validate: EVERY waiter settles at the deadline, one log line, memo cleared, a later request starts a NEW validate", async () => {
        const fetchMock = stallingFetch();
        vi.stubGlobal("fetch", fetchMock);
        const now = Date.now();
        const waiters = Array.from({ length: 6 }, () =>
            track(applyBackendValidationMemo({ id: "u", access_token: "access" }, now)),
        );
        await sleep(600);
        expect(waiters.every((w) => w.settled)).toBe(true);
        expect(vi.mocked(fetchMock)).toHaveBeenCalledTimes(1); // one owner, five waiters
        expect(deadlineLines()).toHaveLength(1); // once per stalled owner
        expect(deadlineLines()[0][0]).toMatchObject({ op: "POST /api/v1/auth/validate" });

        // The entry is no longer in flight: past the backoff the next request validates again.
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ valid: true }), { status: 200 })),
        );
        const token = { id: "u", access_token: "access" } as JWT;
        await applyBackendValidationMemo(token, now + 60 * 60 * 1000);
        expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
        expect(token.error).toBeUndefined();
    });

    it("validate answers with headers and a body that never ends: settles at the deadline", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) =>
                headersThenStalledBody(init),
            ),
        );
        const state = track(
            applyBackendValidationMemo({ id: "u", access_token: "access" }, Date.now()),
        );
        await sleep(600);
        expect(state.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(1);
    });
});
