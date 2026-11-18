import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-14051: a refused refresh (429) is decided from its status and Retry-After header alone. The
// body is cancelled unread, so a late, endless or broken body can neither move the cooldown nor turn
// the refusal into a transient. Everything but the backend answer is the real code.

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
import { fetchWithDeadline, overrideDeadlinesForTests } from "@/lib/serverDeadline";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import { ISSUER } from "@/test/eddsaAnswer";

type Token = Record<string, unknown>;
type JwtCallback = (params: { token: Token; user?: unknown; account?: unknown }) => Promise<Token>;
const jwt = (): JwtCallback =>
    (nextAuthConfig.value as { callbacks: { jwt: JwtCallback } }).callbacks.jwt;

const T0 = 1_795_000_000_000;
const FIVE_MIN = 5 * 60 * 1000;
const deadlineLines = () =>
    warn.mock.calls.filter(([, msg]) => msg === "server fetch deadline exceeded");

const dueToken = (): Token => ({
    id: "user-1",
    access_token: "access",
    refresh_token: "refresh-credential",
    expires_at: T0 - 1_000,
    last_validated: T0,
});

/** A 429 refusal whose headers arrive `headMs` after the request and whose body is `body`. */
function answer429(body: ReadableStream<Uint8Array> | null, headMs = 0) {
    const calls: string[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            calls.push(String(input));
            if (headMs > 0) vi.setSystemTime(Date.now() + headMs);
            return new Response(body, { status: 429, headers: { "Retry-After": "900" } });
        }),
    );
    return calls;
}

const encoded = (text: string) => new TextEncoder().encode(text);

beforeEach(() => {
    resetKeySetCacheForTests();
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    warn.mockClear();
    vi.useFakeTimers({ toFake: ["Date"], now: T0 });
    overrideDeadlinesForTests({ auth: 200, outerMargin: 100, slow: 60_000 });
});
afterEach(() => {
    overrideDeadlinesForTests(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("a refused refresh is decided from its head", () => {
    it("R1: a late body does not move the cooldown: Retry-After counts from the headers", async () => {
        const body = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    vi.setSystemTime(Date.now() + 2_000);
                    controller.enqueue(encoded('{"detail":{"message":"Rate limit exceeded."}}'));
                    controller.close();
                },
            },
            { highWaterMark: 0 },
        );
        answer429(body, 2_000);
        const out = await jwt()({ token: dueToken(), account: null });
        expect(out.error).toBe("refresh_rate_limited");
        expect((out.expires_at as number) - FIVE_MIN).toBe(T0 + 2_000 + 900_000);
    });

    it("R1b: a body that never ends is cancelled; the refresh returns at once and leaks nothing", async () => {
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            start() {
                // never enqueues, never closes
            },
            cancel() {
                cancelled = true;
            },
        });
        answer429(body);
        const out = await jwt()({ token: dueToken(), account: null });
        expect(out.error).toBe("refresh_rate_limited");
        expect(out.refresh_token).toBe("refresh-credential");
        expect((out.expires_at as number) - FIVE_MIN).toBe(T0 + 900_000);
        expect(cancelled).toBe(true);
        expect(deadlineLines()).toHaveLength(0);
    });

    it("R2: a body stream that fails after the headers keeps the rate-limit refusal", async () => {
        const body = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    controller.error(new TypeError("connection closed while reading body"));
                },
            },
            { highWaterMark: 0 },
        );
        answer429(body);
        const out = await jwt()({ token: dueToken(), account: null });
        expect(out.error).toBe("refresh_rate_limited");
        expect(out.refresh_token).toBe("refresh-credential");
        expect((out.expires_at as number) - FIVE_MIN).toBe(T0 + 900_000);
    });

    it("R3 (guard): a 200 refresh whose body fails is still transient and keeps the credential", async () => {
        const body = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    controller.error(new TypeError("connection closed while reading body"));
                },
            },
            { highWaterMark: 0 },
        );
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(body, {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
            ),
        );
        const out = await jwt()({ token: dueToken(), account: null });
        expect(out.error).toBe("refresh_unavailable");
        expect(out.refresh_token).toBe("refresh-credential");
    });

    it("C2 (guard): a 429 head that arrives after the deadline is today's timeout outcome", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise<Response>((resolve) =>
                        setTimeout(
                            () =>
                                resolve(
                                    new Response(null, {
                                        status: 429,
                                        headers: { "Retry-After": "900" },
                                    }),
                                ),
                            500,
                        ),
                    ),
            ),
        );
        const out = await jwt()({ token: dueToken(), account: null });
        expect(out.error).toBe("refresh_unavailable");
        expect(out.refresh_token).toBe("refresh-credential");
        const lines = deadlineLines().filter(
            ([f]) => (f as { op: string }).op === "POST /api/v1/auth/refresh",
        );
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toMatchObject({ outcome: "deadline", layer: "inner" });
    });
});

describe("fetchWithDeadline bodyless option", () => {
    const url = "http://backend.test/x";

    it("R4 (guard): without the option the body is read and returned, as before", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response('{"a":1}', { status: 429 })),
        );
        const res = await fetchWithDeadline(url, undefined, { kind: "auth" });
        expect(res.status).toBe(429);
        expect(await res.json()).toEqual({ a: 1 });
    });

    it("R4 (guard): a status the option does not name is read in full", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response('{"a":2}', { status: 200 })),
        );
        const res = await fetchWithDeadline(url, undefined, {
            kind: "auth",
            bodyless: (status) => status === 429,
        });
        expect(await res.json()).toEqual({ a: 2 });
    });

    it("a named status returns its status and headers with no body, and cancels the stream", async () => {
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            cancel() {
                cancelled = true;
            },
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () => new Response(body, { status: 429, headers: { "Retry-After": "900" } }),
            ),
        );
        const res = await fetchWithDeadline(url, undefined, {
            kind: "auth",
            bodyless: (status) => status === 429,
        });
        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBe("900");
        expect(res.body).toBeNull();
        expect(cancelled).toBe(true);
    });
});
