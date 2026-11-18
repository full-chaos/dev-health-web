// CHAOS-14051 round-2 review cases (gpt-6.2-sol repro, adopted as cells): the bodyless deadline rule.
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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
    const logger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn,
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
    };
    logger.child.mockReturnValue(logger);
    return { logger };
});

import "@/lib/auth";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import * as serverDeadline from "@/lib/serverDeadline";
import { eddsaFetch, ISSUER, mint } from "@/test/eddsaAnswer";

type Token = Record<string, unknown>;
type JwtCallback = (params: { token: Token; account: null }) => Promise<Token>;
const T0 = 1_795_000_000_000;
const REFRESH_OP = "POST /api/v1/auth/refresh";
const REFRESH_PATH = "/api/v1/auth/refresh";
const OLD_REFRESH = "refresh-before-rotation";
const NEW_REFRESH = "refresh-after-rotation";
const deadlineTimes = () =>
    warn.mock.calls.flatMap(([fields, message]) =>
        message === "server fetch deadline exceeded" && fields.op === REFRESH_OP
            ? [fields.elapsed_ms]
            : [],
    );

function refresh(): Promise<Token> {
    const { callbacks } = nextAuthConfig.value as { callbacks: { jwt: JwtCallback } };
    return callbacks.jwt({
        token: {
            id: "user-1",
            access_token: "old-access",
            refresh_token: OLD_REFRESH,
            expires_at: T0 - 1_000,
            last_validated: T0,
        },
        account: null,
    });
}

function refusal(body: ReadableStream<Uint8Array> | null) {
    return new Response(body, { status: 429, headers: { "Retry-After": "900" } });
}

beforeEach(() => {
    vi.useFakeTimers({ now: T0, toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.stubEnv("SERVER_FETCH_DEADLINE_AUTH_MS", "1000");
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    resetKeySetCacheForTests();
    warn.mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

it("logs one deadline after the timer wins and a late 429 head still arrives", async () => {
    const cancel = vi.fn();
    const pull = vi.fn();
    vi.stubGlobal(
        "fetch",
        () =>
            new Promise<Response>((resolve) => {
                setTimeout(() => {
                    const body = new ReadableStream<Uint8Array>(
                        { pull, cancel },
                        { highWaterMark: 0 },
                    );
                    resolve(refusal(body));
                }, 1_250);
            }),
    );

    const pending = refresh();
    await vi.advanceTimersByTimeAsync(1_000);
    const output = await pending;
    expect(output.error).toBe("refresh_unavailable");
    expect(output.refresh_token).toBe(OLD_REFRESH);
    const beforeHead = deadlineTimes();
    expect(beforeHead).toEqual([1_000]);

    await vi.advanceTimersByTimeAsync(250);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledTimes(0);
    const afterHead = deadlineTimes();
    expect(afterHead).toEqual([1_000]);
});

it("keeps an on-time 429 when synchronous cancellation crosses the deadline", async () => {
    let receivedAt = 0;
    let cancelledAt = 0;
    const pull = vi.fn();
    vi.stubGlobal(
        "fetch",
        () =>
            new Promise<Response>((resolve) => {
                setTimeout(() => {
                    const body = new ReadableStream<Uint8Array>(
                        {
                            pull,
                            cancel() {
                                // Model synchronous work in the cancellation hook.
                                vi.setSystemTime(Date.now() + 20);
                                cancelledAt = Date.now() - T0;
                            },
                        },
                        { highWaterMark: 0 },
                    );
                    receivedAt = Date.now() - T0;
                    resolve(refusal(body));
                }, 990);
            }),
    );

    const pending = refresh();
    await vi.advanceTimersByTimeAsync(990);
    const output = await pending;
    expect(receivedAt).toBe(990);
    expect(cancelledAt).toBe(1_010);
    expect(pull).toHaveBeenCalledTimes(0);
    expect(output).toMatchObject({
        error: "refresh_rate_limited",
        expires_at: T0 + 990 + 900_000 + 300_000,
        refresh_token: OLD_REFRESH,
    });
    expect(deadlineTimes()).toEqual([]);
});

it("keeps a rotated 200 credential when the body resolves before the overdue timer runs", async () => {
    const access = mint();
    const answer = new TextEncoder().encode(
        JSON.stringify({ access_token: access, refresh_token: NEW_REFRESH }),
    );

    async function attempt() {
        let headAt = 0;
        let bodyAt = 0;
        vi.stubGlobal(
            "fetch",
            eddsaFetch({
                [REFRESH_PATH]: () =>
                    new Promise<Response>((resolve) => {
                        setTimeout(() => {
                            const body = new ReadableStream<Uint8Array>({
                                start(controller) {
                                    setTimeout(() => {
                                        // Model a callback delivering the last chunk and EOF
                                        // after the deadline, before the timer gets a turn.
                                        vi.setSystemTime(Date.now() + 10);
                                        bodyAt = Date.now() - T0;
                                        controller.enqueue(answer);
                                        controller.close();
                                    }, 45);
                                },
                            });
                            headAt = Date.now() - T0;
                            resolve(new Response(body, { status: 200 }));
                        }, 950);
                    }),
            }),
        );
        const pending = refresh();
        await vi.advanceTimersByTimeAsync(995);
        const output = await pending;
        expect(headAt).toBe(950);
        expect(bodyAt).toBe(1_005);
        return { output, headAt, bodyAt };
    }

    // Control: use the same JWT and wire code with the pre-PR deadlineFetch call shape.
    const original = serverDeadline.deadlineFetch;
    const legacy = vi
        .spyOn(serverDeadline, "deadlineFetch")
        .mockImplementation((kind, op) => original(kind, op));
    const control = await attempt();
    expect(control.output.refresh_token).toBe(NEW_REFRESH);
    expect(control.output.access_token).toBe(access);
    expect(control.output.error).toBeUndefined();
    legacy.mockRestore();
    vi.setSystemTime(T0);
    warn.mockClear();

    const { output } = await attempt();
    expect(output.refresh_token).toBe(NEW_REFRESH);
});

it("anchors the cooldown at headers when the 429 response has a null body", async () => {
    const { promise: head, resolve: deliver } = Promise.withResolvers<Response>();
    const fetchMock = vi.fn(() => head);
    vi.stubGlobal("fetch", fetchMock);

    const pending = refresh();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Another microtask runs after the fetch helper receives the head, before the wire resumes.
    const afterHead = head.then(() => vi.setSystemTime(Date.now() + 30));
    const receivedAt = Date.now();
    deliver(refusal(null));
    await afterHead;
    const output = await pending;
    const anchor = Number(output.expires_at) - 300_000 - 900_000;

    expect(output.error).toBe("refresh_rate_limited");
    expect(anchor - T0).toBe(receivedAt - T0);
});

it("times out a 429 head arriving at the exact deadline before the timer callback", async () => {
    const cancel = vi.fn();
    let logsWhenHeadArrived: number[] | undefined;
    vi.stubGlobal(
        "fetch",
        () =>
            new Promise<Response>((resolve) => {
                setTimeout(() => {
                    logsWhenHeadArrived = deadlineTimes();
                    resolve(refusal(new ReadableStream<Uint8Array>({ cancel })));
                }, 1_000);
            }),
    );

    const pending = refresh();
    await vi.advanceTimersByTimeAsync(1_000);
    const output = await pending;
    expect(logsWhenHeadArrived).toEqual([]);
    expect(output).toMatchObject({ error: "refresh_unavailable", refresh_token: OLD_REFRESH });
    expect(deadlineTimes()).toEqual([1_000]);
    expect(cancel).toHaveBeenCalledTimes(1);
});
