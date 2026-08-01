import { defineConfig } from "@playwright/test";
import { PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "./scripts/owned-process-lifecycle.mjs";

export const BFF_PORT = process.env.CONTEXT_FABRIC_BFF_PORT ?? "3012";
export const OPS_MOCK_PORT = process.env.CONTEXT_FABRIC_OPS_PORT ?? "8012";
export const ACR_MOCK_PORT = process.env.CONTEXT_FABRIC_ACR_PORT ?? "8013";
export const BFF_ORIGIN = `http://127.0.0.1:${BFF_PORT}`;
export const OPS_MOCK_ORIGIN = `http://127.0.0.1:${OPS_MOCK_PORT}`;
export const ACR_API_ORIGIN = `http://127.0.0.1:${ACR_MOCK_PORT}`;

const AUTH_FILE = "test-results/.auth/state.json";
const RESULTS_DIRECTORY =
    process.env.PLAYWRIGHT_RESULTS_DIR ?? "test-results/playwright/context-fabric";
const JUNIT_PATH = process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME ?? `${RESULTS_DIRECTORY}/junit.xml`;
const HTML_REPORT_DIRECTORY =
    process.env.PLAYWRIGHT_HTML_REPORT ?? "test-results/playwright-html/context-fabric";
const PERSIST_TRACE = process.env.CI === "true" || process.env.CI === "1";
const GRACEFUL_SHUTDOWN = {
    signal: "SIGTERM",
    timeout: PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS,
} as const;

export default defineConfig({
    testDir: "./tests",
    testMatch: /acr-context-fabric\.production\.spec\.ts/,
    fullyParallel: false,
    workers: 1,
    outputDir: RESULTS_DIRECTORY,
    reporter: [
        ["list"],
        ["junit", { outputFile: JUNIT_PATH }],
        ["html", { open: "never", outputFolder: HTML_REPORT_DIRECTORY }],
    ],
    use: {
        baseURL: BFF_ORIGIN,
        headless: true,
        screenshot: "only-on-failure",
        trace: PERSIST_TRACE ? "on" : "retain-on-failure",
    },
    projects: [
        {
            name: "auth-setup",
            testMatch: /auth\.setup\.ts/,
        },
        {
            name: "authenticated",
            dependencies: ["auth-setup"],
            use: { storageState: AUTH_FILE },
        },
    ],
    webServer: [
        {
            command: "node scripts/context-fabric-launch.mjs ops-mock",
            url: `${OPS_MOCK_ORIGIN}/health`,
            reuseExistingServer: false,
            gracefulShutdown: GRACEFUL_SHUTDOWN,
            timeout: 30_000,
            env: { MOCK_SERVER_PORT: OPS_MOCK_PORT },
        },
        {
            command: "node scripts/context-fabric-launch.mjs acr-mock",
            url: `${ACR_API_ORIGIN}/health`,
            reuseExistingServer: false,
            gracefulShutdown: GRACEFUL_SHUTDOWN,
            timeout: 30_000,
            env: { ACR_MOCK_PORT },
        },
        {
            command: "node scripts/context-fabric-launch.mjs bff",
            url: BFF_ORIGIN,
            reuseExistingServer: false,
            gracefulShutdown: GRACEFUL_SHUTDOWN,
            timeout: 120_000,
            env: {
                BACKEND_URL: OPS_MOCK_ORIGIN,
                AUTH_SECRET: "context-fabric-production-playwright",
                AUTH_URL: BFF_ORIGIN,
                ACR_API_ORIGIN,
                ACR_WEB_ASSERTION_AUDIENCE: "dev-health-acr",
                ACR_WEB_ASSERTION_ISSUER: "dev-health-web",
                ACR_WEB_ASSERTION_KEY_FILE: "../context-fabric-keys/web-assertion.key",
                ACR_WEB_ASSERTION_KID: "context-fabric-e2e",
                NODE_ENV: "production",
                PORT: BFF_PORT,
            },
        },
    ],
});
