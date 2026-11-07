import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "wl-canary-AAAA.wl-canary-BBBB.wl-canary-CCCC";
const logCalls: unknown[][] = [];
vi.mock("@/lib/logger", () => {
    const rec =
        () =>
        (...a: unknown[]) => {
            logCalls.push(a);
        };
    const logger = {
        trace: rec(),
        debug: rec(),
        info: rec(),
        warn: rec(),
        error: rec(),
        fatal: rec(),
        child: () => logger,
    };
    return { logger };
});
vi.mock("@/lib/auth/workload/token", () => ({
    getWorkloadToken: async () => TOKEN,
    workloadTokenConfigured: () => true,
}));

beforeEach(() => {
    logCalls.length = 0;
    vi.stubEnv("AUTH_INTERNAL_URL", "https://auth-internal.example.test:8097");
    for (const m of ["log", "info", "warn", "error", "debug", "trace"] as const)
        vi.spyOn(console, m).mockImplementation(() => undefined);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

function seen(): string {
    const all = [
        ...logCalls,
        ...vi.mocked(console.log).mock.calls,
        ...vi.mocked(console.info).mock.calls,
        ...vi.mocked(console.warn).mock.calls,
        ...vi.mocked(console.error).mock.calls,
        ...vi.mocked(console.debug).mock.calls,
        ...vi.mocked(console.trace).mock.calls,
    ];
    return JSON.stringify(all, (_k, v) => (v instanceof Error ? { m: v.message, s: v.stack } : v));
}

describe("the token never reaches a logger, console or error", () => {
    it.each([
        ["200", async () => new Response("{}", { status: 200 })],
        ["503", async () => new Response("down", { status: 503 })],
        [
            "network error carrying the header",
            async (_u: string, init: RequestInit) => {
                throw new TypeError(`fetch failed ${JSON.stringify(init.headers)}`);
            },
        ],
    ])("%s", async (_name, impl) => {
        vi.stubGlobal("fetch", vi.fn(impl));
        vi.resetModules();
        const { createAuthorizeTransport } = await import("../transport");
        let thrown = "";
        try {
            await createAuthorizeTransport()({ path: "/v1/authorize", body: "{}" });
        } catch (e) {
            thrown = JSON.stringify({ m: (e as Error).message, s: (e as Error).stack });
        }
        expect(seen()).not.toContain("wl-canary");
        expect(thrown).not.toContain("wl-canary");
    });
});
