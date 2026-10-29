import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { auth } from "@/lib/auth";
import request from "@/lib/ask-dev/__tests__/captures/context_fabric_investigation_request.v1.json";
import { POST } from "./route";
import { logger } from "@/lib/logger";

const server = setupServer();
const temporaryPaths: string[] = [];

const OPS = "http://ops.example.test";
const ACR = "https://acr.example.test";

function writeSigningKey(): string {
    const pair = generateKeyPairSync("ed25519");
    const directory = mkdtempSync(join(tmpdir(), "ask-dev-route-key-"));
    temporaryPaths.push(directory);
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    return keyFile;
}

function configure(): void {
    vi.stubEnv("ACR_API_ORIGIN", ACR);
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", writeSigningKey());
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("BACKEND_URL", OPS);
}

function signedIn(extra: Record<string, unknown> = {}): void {
    vi.mocked(auth).mockResolvedValue({
        access_token: "ops-session-token",
        expires: "2026-07-16T00:00:00.000Z",
        user: { id: "user-123", org_id: "org-123", ...extra },
    } as Awaited<ReturnType<typeof auth>>);
}

type OpsCalls = { entitlement: number; scopes: number };

function installOps(
    features: Record<string, boolean>,
    scopes: readonly string[] = ["full-chaos/dev-health"],
): OpsCalls {
    const calls: OpsCalls = { entitlement: 0, scopes: 0 };
    server.use(
        http.get(`${OPS}/api/v1/licensing/entitlements/:orgId`, () => {
            calls.entitlement += 1;
            return HttpResponse.json({ features, is_valid: true });
        }),
        http.post(`${OPS}/graphql`, () => {
            calls.scopes += 1;
            return HttpResponse.json({
                data: {
                    catalog: {
                        __typename: "CatalogResult",
                        values: scopes.map((value) => ({
                            __typename: "CatalogValueItem",
                            count: 1,
                            value,
                        })),
                    },
                },
            });
        }),
    );
    return calls;
}

const ENTITLED = { agent_context_runtime: true, ask_dev: true };

const sse = (text: string): Response =>
    new HttpResponse(text, { headers: { "Content-Type": "text/event-stream" } });

function post(body: unknown = request, headers: Record<string, string> = {}): Promise<Response> {
    return POST(
        new Request("http://web.example.test/api/ask-dev/investigations", {
            body: JSON.stringify(body),
            headers: {
                "Content-Type": "application/json",
                Origin: "http://web.example.test",
                ...headers,
            },
            method: "POST",
        }),
    );
}

async function readAll(response: Response): Promise<string> {
    return await response.text();
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
    configure();
    signedIn();
});
afterEach(() => {
    vi.useRealTimers();
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.mocked(logger.warn).mockClear();
    for (const path of temporaryPaths.splice(0)) rmSync(path, { force: true, recursive: true });
});

const INVESTIGATIONS = `${ACR}/api/v1/context-fabric/investigations`;
const encoder = new TextEncoder();

/** The injected setup delay: the clock jumps while ops answers, as a slow authorization would. */
function setupTakes(ms: number): void {
    vi.setSystemTime(Date.now() + ms);
}

function installSlowOps(entitlementMs: number, scopesMs = 0): void {
    server.use(
        http.get(`${OPS}/api/v1/licensing/entitlements/:orgId`, () => {
            setupTakes(entitlementMs);
            return HttpResponse.json({ features: ENTITLED, is_valid: true });
        }),
        http.post(`${OPS}/graphql`, () => {
            setupTakes(scopesMs);
            return HttpResponse.json({
                data: {
                    catalog: {
                        __typename: "CatalogResult",
                        values: [
                            {
                                __typename: "CatalogValueItem",
                                count: 1,
                                value: "full-chaos/dev-health",
                            },
                        ],
                    },
                },
            });
        }),
    );
}

function frames(text: string): Record<string, unknown>[] {
    return [...text.matchAll(/event: error\ndata: (.+)\n\n/gu)].map(
        (match) => JSON.parse(match[1]!) as Record<string, unknown>,
    );
}

function warnings(spy: Mock): Record<string, unknown>[] {
    return spy.mock.calls.map((call) => call[0] as Record<string, unknown>);
}

describe("Ask Dev deadline chain: setup and the budget header", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    });

    it("sends the budget header from the time left AFTER setup: floor(W - 8 - 5) with an 8 s authorization", async () => {
        installSlowOps(8_000);
        let seen: string | null = null;
        server.use(
            http.post(INVESTIGATIONS, ({ request: upstream }) => {
                seen = upstream.headers.get("x-acr-wait-budget-seconds");
                return sse('event: accepted\ndata: {"seq":1}\n\n');
            }),
        );

        await readAll(await post());

        // W = 120 s default: 120 - 8 - 5 = 107. A header taken before setup would say 115.
        expect(seen).toBe("107");
    });

    it("sends floor(W - 5) when setup takes no time", async () => {
        installSlowOps(0);
        let seen: string | null = null;
        server.use(
            http.post(INVESTIGATIONS, ({ request: upstream }) => {
                seen = upstream.headers.get("x-acr-wait-budget-seconds");
                return sse("");
            }),
        );
        await readAll(await post());
        expect(seen).toBe("115");
    });

    it("honours ASK_DEV_RUN_TIMEOUT_MS and clamps it to 600 s", async () => {
        const seen: (string | null)[] = [];
        server.use(
            http.post(INVESTIGATIONS, ({ request: upstream }) => {
                seen.push(upstream.headers.get("x-acr-wait-budget-seconds"));
                return sse("");
            }),
        );
        installSlowOps(0);
        vi.stubEnv("ASK_DEV_RUN_TIMEOUT_MS", "60000");
        await readAll(await post());
        vi.stubEnv("ASK_DEV_RUN_TIMEOUT_MS", "9999999");
        const warn = vi.mocked(logger.warn);
        await readAll(await post());
        expect(seen).toEqual(["55", "595"]);
        expect(warnings(warn).some((w) => w.source === "clamped")).toBe(true);
    });

    it("bounds each setup read by min(5 s, D - now), the second by what the first left", async () => {
        const timeouts: number[] = [];
        const real = AbortSignal.timeout.bind(AbortSignal);
        vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
            timeouts.push(ms);
            return real(ms);
        });
        vi.stubEnv("ASK_DEV_RUN_TIMEOUT_MS", "20000");
        installSlowOps(17_000);
        server.use(http.post(INVESTIGATIONS, () => sse("")));

        await readAll(await post());

        // D - now: 20 s at the entitlement read (capped to 5 s), 3 s at the scope read.
        expect(timeouts).toEqual([5_000, 3_000]);
    });

    it("ends in budget_exhausted, with no ACR call, when setup leaves less than ACR's minimum", async () => {
        const warn = vi.mocked(logger.warn);
        let acrCalls = 0;
        vi.stubEnv("ASK_DEV_RUN_TIMEOUT_MS", "20000");
        installSlowOps(17_000);
        server.use(
            http.post(INVESTIGATIONS, () => {
                acrCalls += 1;
                return sse("");
            }),
        );

        const response = await post();
        const text = await readAll(response);

        expect(response.status).toBe(200);
        expect(acrCalls).toBe(0);
        expect(frames(text)).toEqual([
            expect.objectContaining({
                code: "budget_exhausted",
                request_id: response.headers.get("x-request-id"),
                retryable: true,
                source: "web",
            }),
        ]);
        // Loud: the refusal is logged with the request id and the numbers that decided it.
        expect(warnings(warn)).toContainEqual(
            expect.objectContaining({
                branch: "budget_exhausted",
                request_id: response.headers.get("x-request-id"),
                remaining_ms: 3_000,
                wait_budget_seconds: -2,
            }),
        );
    });

    it("calls ACR at exactly the minimum (header 10) and refuses one millisecond below it", async () => {
        const seen: (string | null)[] = [];
        server.use(
            http.post(INVESTIGATIONS, ({ request: upstream }) => {
                seen.push(upstream.headers.get("x-acr-wait-budget-seconds"));
                return sse("");
            }),
        );
        installSlowOps(0);
        vi.stubEnv("ASK_DEV_RUN_TIMEOUT_MS", "15000");
        await readAll(await post());
        vi.stubEnv("ASK_DEV_RUN_TIMEOUT_MS", "14999");
        const refused = frames(await readAll(await post()));
        expect(seen).toEqual(["10"]);
        expect(refused[0]).toMatchObject({ code: "budget_exhausted" });
    });
});

describe("Ask Dev deadline chain: the stream", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
        installOps(ENTITLED);
    });

    /** An upstream that sends `accepted`, then whatever `script` pushes, and records its abort. */
    function upstream(script: (push: (text: string) => void, close: () => void) => void) {
        const state = { aborted: false, hits: 0 };
        server.use(
            http.post(INVESTIGATIONS, ({ request: incoming }) => {
                state.hits += 1;
                incoming.signal.addEventListener("abort", () => {
                    state.aborted = true;
                });
                return new HttpResponse(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            const push = (text: string): void =>
                                controller.enqueue(encoder.encode(text));
                            push('event: accepted\ndata: {"seq":1}\n\n');
                            script(push, () => controller.close());
                        },
                    }),
                    { headers: { "Content-Type": "text/event-stream" } },
                );
            }),
        );
        return state;
    }

    async function drain(response: Response): Promise<{ text: Promise<string> }> {
        const reader = response.body!.getReader();
        let text = "";
        const done = (async () => {
            const decoder = new TextDecoder();
            for (;;) {
                const next = await reader.read();
                if (next.done) return text;
                text += decoder.decode(next.value);
            }
        })();
        return { text: done };
    }

    it("ends a stalled stream 30 s after the last upstream byte with `stalled`, and not a millisecond before", async () => {
        const warn = vi.mocked(logger.warn);
        const state = upstream(() => undefined);
        const response = await post();
        const read = await drain(response);
        // `accepted` has arrived; the clock for the stall window starts here.
        await vi.advanceTimersByTimeAsync(29_999);
        expect(state.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);

        const text = await read.text;
        expect(state.aborted).toBe(true);
        expect(frames(text)).toEqual([
            expect.objectContaining({ code: "stalled", phase: "streaming", retryable: true }),
        ]);
        expect(warnings(warn)).toContainEqual(
            expect.objectContaining({
                branch: "stalled",
                request_id: response.headers.get("x-request-id"),
                stall_ms: 30_000,
            }),
        );
    });

    it("restarts the stall window on every upstream byte, so a heartbeat keeps the run alive", async () => {
        let push: (text: string) => void = () => undefined;
        const state = upstream((p) => {
            push = p;
        });
        const read = await drain(await post());
        await vi.advanceTimersByTimeAsync(25_000);
        push('event: heartbeat\ndata: {"seq":2}\n\n');
        await vi.advanceTimersByTimeAsync(25_000);
        push('event: heartbeat\ndata: {"seq":3}\n\n');
        await vi.advanceTimersByTimeAsync(25_000);
        // 75 s of run time and no stall: each byte moved the window.
        expect(state.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(5_000);

        expect(frames(await read.text)).toEqual([expect.objectContaining({ code: "stalled" })]);
    });

    it("aborts ACR at D and writes `interrupted`, even while heartbeats keep arriving", async () => {
        const warn = vi.mocked(logger.warn);
        vi.stubEnv("ASK_DEV_RUN_TIMEOUT_MS", "60000");
        const state = upstream((push) => {
            setInterval(() => push("event: heartbeat\ndata: {}\n\n"), 10_000);
        });
        const response = await post();
        const read = await drain(response);
        await vi.advanceTimersByTimeAsync(59_999);
        expect(state.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);

        const text = await read.text;
        expect(state.aborted).toBe(true);
        expect(frames(text)).toEqual([
            expect.objectContaining({ code: "interrupted", phase: "streaming", retryable: true }),
        ]);
        expect(warnings(warn)).toContainEqual(
            expect.objectContaining({
                branch: "deadline",
                request_id: response.headers.get("x-request-id"),
                run_timeout_ms: 60_000,
            }),
        );
    });

    it("lets a run that finishes at W - 10 s complete with no error frame and no leftover timer", async () => {
        vi.stubEnv("ASK_DEV_RUN_TIMEOUT_MS", "60000");
        const state = upstream((push, close) => {
            // ACR's heartbeat every 10 s keeps the stall window open until the result at 50 s.
            const heartbeat = setInterval(() => push("event: heartbeat\ndata: {}\n\n"), 10_000);
            setTimeout(() => {
                clearInterval(heartbeat);
                push('event: result\ndata: {"seq":2}\n\n');
                close();
            }, 50_000);
        });
        const read = await drain(await post());
        await vi.advanceTimersByTimeAsync(50_000);
        const text = await read.text;

        expect(text).toContain('event: result\ndata: {"seq":2}\n\n');
        expect(frames(text)).toEqual([]);
        // No web timer won: nothing logged as a deadline or a stall, and none is left running.
        const branches = warnings(vi.mocked(logger.warn)).map((w) => w.branch);
        expect(branches).not.toContain("deadline");
        expect(branches).not.toContain("stalled");
        expect(state.hits).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("reports an admission error when D ends together with the header wait (W = 15 s)", async () => {
        vi.stubEnv("ASK_DEV_RUN_TIMEOUT_MS", "15000");
        server.use(http.post(INVESTIGATIONS, () => new Promise<Response>(() => undefined)));
        const read = await drain(await post());
        await vi.advanceTimersByTimeAsync(15_000);

        expect(frames(await read.text)).toEqual([
            expect.objectContaining({ code: "timeout", phase: "admission" }),
        ]);
    });

    it("turns a header wait that runs out into an admission error after 15 s", async () => {
        const warn = vi.mocked(logger.warn);
        server.use(http.post(INVESTIGATIONS, () => new Promise<Response>(() => undefined)));
        const response = await post();
        const read = await drain(response);
        await vi.advanceTimersByTimeAsync(14_999);
        // Only web's own keepalives so far.
        expect(frames(await Promise.race([read.text, Promise.resolve("")]))).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);

        expect(frames(await read.text)).toEqual([
            expect.objectContaining({ code: "timeout", phase: "admission", retryable: true }),
        ]);
        expect(warnings(warn)).toContainEqual(
            expect.objectContaining({
                code: "timeout",
                phase: "admission",
                request_id: response.headers.get("x-request-id"),
            }),
        );
    });
});
