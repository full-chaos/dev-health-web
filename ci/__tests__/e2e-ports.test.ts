import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { E2E_PORT_ENV, E2E_PORT_DEFAULTS, resolveE2ePorts } from "../e2e-ports.mjs";

// CHAOS-12807. Every e2e suite takes its ports from env, so two full gates can run at once on one
// host. Unset env keeps today's ports.

const REPO_ROOT = path.resolve(__dirname, "../..");
const ALTERNATE = {
    PLAYWRIGHT_WEB_PORT: "20101",
    PLAYWRIGHT_MOCK_PORT: "20102",
    PLAYWRIGHT_CUSTOMER_PUSH_WEB_PORT: "20103",
    PLAYWRIGHT_CUSTOMER_PUSH_MOCK_PORT: "20104",
    PLAYWRIGHT_NAVIGATION_WEB_PORT: "20105",
    PLAYWRIGHT_NAVIGATION_MOCK_PORT: "20106",
    PLAYWRIGHT_ONBOARDING_WEB_PORT: "20107",
    PLAYWRIGHT_ONBOARDING_MOCK_PORT: "20108",
    CONTEXT_FABRIC_BFF_PORT: "20109",
    CONTEXT_FABRIC_OPS_PORT: "20110",
    CONTEXT_FABRIC_ACR_PORT: "20111",
} as const;

const origin = (port: string) => `http://127.0.0.1:${port}`;

async function load(file: string, env: Record<string, string>) {
    vi.resetModules();
    for (const name of Object.values(E2E_PORT_ENV)) vi.stubEnv(name, undefined as never);
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    return (await import(file)).default as {
        use: { baseURL: string };
        webServer: { url: string; command?: string; env?: Record<string, string> }[];
    };
}

afterEach(() => vi.unstubAllEnvs());

describe("e2e port table", () => {
    it("keeps today's ports when no env is set", () => {
        expect(resolveE2ePorts({})).toEqual(E2E_PORT_DEFAULTS);
        expect(E2E_PORT_DEFAULTS).toMatchObject({
            webPort: 3001,
            mockPort: 8001,
            contextFabricBffPort: 3012,
        });
    });

    it("reads every port from its env var", () => {
        const ports = resolveE2ePorts(ALTERNATE);
        expect(ports.webPort).toBe(20101);
        expect(ports.mockPort).toBe(20102);
        expect(ports.onboardingWebPort).toBe(20107);
        expect(ports.contextFabricAcrPort).toBe(20111);
    });

    it("refuses a port that is not an integer in 1..65535", () => {
        expect(() => resolveE2ePorts({ PLAYWRIGHT_WEB_PORT: "abc" })).toThrow(
            /PLAYWRIGHT_WEB_PORT/,
        );
        expect(() => resolveE2ePorts({ PLAYWRIGHT_WEB_PORT: "70000" })).toThrow(
            /PLAYWRIGHT_WEB_PORT/,
        );
    });
});

describe("playwright configs follow the env", () => {
    it("default config: web, mock, and BACKEND_URL", async () => {
        const config = await load("../../playwright.config.ts", ALTERNATE);
        expect(config.use.baseURL).toBe(origin("20101"));
        expect(config.webServer.map((server) => server.url)).toEqual([
            `${origin("20102")}/health`,
            origin("20101"),
        ]);
        expect(config.webServer[1]?.command).toContain("--port 20101");
        expect(config.webServer[1]?.env?.BACKEND_URL).toBe(origin("20102"));
    });

    it("default config keeps 3001 / 8001 with no env", async () => {
        const config = await load("../../playwright.config.ts", {});
        expect(config.use.baseURL).toBe(origin("3001"));
        expect(config.webServer[0]?.url).toBe(`${origin("8001")}/health`);
    });

    it("onboarding config", async () => {
        const config = await load("../../playwright.onboarding.config.ts", ALTERNATE);
        expect(config.use.baseURL).toBe(origin("20107"));
        expect(config.webServer.map((server) => server.url)).toEqual([
            `${origin("20108")}/health`,
            origin("20107"),
        ]);
        expect(config.webServer[0]?.env?.MOCK_SERVER_PORT).toBe("20108");
        expect(config.webServer[1]?.env?.BACKEND_URL).toBe(origin("20108"));
    });

    it("onboarding config keeps 3003 / 8002 with no env", async () => {
        const config = await load("../../playwright.onboarding.config.ts", {});
        expect(config.use.baseURL).toBe(origin("3003"));
        expect(config.webServer[0]?.url).toBe(`${origin("8002")}/health`);
    });

    it("customer-push and navigation configs", async () => {
        const push = await load("../../playwright.customer-push.config.ts", ALTERNATE);
        expect(push.use.baseURL).toBe(origin("20103"));
        expect(push.webServer[0]?.url).toBe(`${origin("20104")}/health`);
        const navigation = await load("../../playwright.navigation.config.ts", ALTERNATE);
        expect(navigation.use.baseURL).toBe(origin("20105"));
        expect(navigation.webServer[0]?.url).toBe(`${origin("20106")}/health`);
    });

    it("context-fabric config", async () => {
        const config = await load("../../playwright.context-fabric.config.ts", ALTERNATE);
        expect(config.use.baseURL).toBe(origin("20109"));
        expect(config.webServer.map((server) => server.url)).toEqual([
            `${origin("20110")}/health`,
            `${origin("20111")}/health`,
            origin("20109"),
        ]);
    });
});

describe("no hard-coded e2e port outside the table", () => {
    it("no spec or helper names 3001, 8001 or 3012 as a literal origin", () => {
        const result = spawnSync(
            "git",
            [
                "grep",
                "-nE",
                '(127\\.0\\.0\\.1|localhost):(3001|8001|3012)\\b|\\?\\? "(3001|8001|3012)"',
                "--",
                "tests/*.ts",
                "tests/helpers",
                "playwright*.ts",
                "scripts/context-fabric-launch.mjs",
                ":(exclude)tests/mocks/*.test.ts",
            ],
            { cwd: REPO_ROOT, encoding: "utf8" },
        );
        expect(result.stdout.trim().split("\n").filter(Boolean)).toEqual([]);
    });
});
