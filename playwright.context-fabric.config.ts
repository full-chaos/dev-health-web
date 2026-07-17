import { defineConfig } from "@playwright/test";
import { PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "./scripts/owned-process-lifecycle.mjs";

export const BFF_ORIGIN = "http://127.0.0.1:3012";
export const OPS_MOCK_ORIGIN = "http://127.0.0.1:8012";
export const ACR_API_ORIGIN = "https://127.0.0.1:8013";

const AUTH_FILE = "test-results/.auth/state.json";
const GRACEFUL_SHUTDOWN = {
    signal: "SIGTERM",
    timeout: PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS,
} as const;

export default defineConfig({
    testDir: "./tests",
    testMatch: /acr-context-fabric\.production\.spec\.ts/,
    fullyParallel: false,
    workers: 1,
    reporter: [["list"]],
    use: {
        baseURL: BFF_ORIGIN,
        headless: true,
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
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
            env: { MOCK_SERVER_PORT: "8012" },
        },
        {
            command: "node scripts/context-fabric-launch.mjs acr-mock",
            url: `${ACR_API_ORIGIN}/health`,
            ignoreHTTPSErrors: true,
            reuseExistingServer: false,
            gracefulShutdown: GRACEFUL_SHUTDOWN,
            timeout: 30_000,
            env: {
                ACR_MOCK_CERT_FILE: "test-results/context-fabric-keys/tls.crt",
                ACR_MOCK_KEY_FILE: "test-results/context-fabric-keys/tls.key",
                ACR_MOCK_PORT: "8013",
            },
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
                NODE_TLS_REJECT_UNAUTHORIZED: "0",
            },
        },
    ],
});
