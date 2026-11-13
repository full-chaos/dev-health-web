/**
 * CHAOS-13541 consent screenshot only (tests/screenshot-chaos-13541.consent.ts). The web server runs with
 * ACR_SCOPES_FROM_GRANTS on and auth-service pointed at the mock server, which answers /v1/authorize with the ops
 * example decision (tests/mocks/chaos13541Pdp.ts). Its own ports and config keep that env off the default e2e
 * web server. Delete with the spec after the PR is merged.
 */
import { defineConfig } from "@playwright/test";
import { e2eAuthEnv } from "./ci/next-dev-env";
import { WORKLOAD_ISSUER, WORKLOAD_SUBJECT_FILE } from "./tests/mocks/chaos13541Pdp";

const resultsDirectory = "test-results/playwright/chaos-13541";
const mockServerPort = Number(process.env.PLAYWRIGHT_CHAOS_13541_MOCK_PORT ?? "8014");
const webServerPort = Number(process.env.PLAYWRIGHT_CHAOS_13541_WEB_PORT ?? "3014");
const baseURL = `http://127.0.0.1:${webServerPort}`;
const mockServerURL = `http://127.0.0.1:${mockServerPort}`;
const authFile = "test-results/.auth/state.json";

export default defineConfig({
    testDir: "./tests",
    outputDir: resultsDirectory,
    workers: 1,
    retries: 0,
    reporter: [["list"]],
    projects: [
        { name: "chaos-13541-auth-setup", testMatch: /auth\.setup\.ts/ },
        {
            name: "chaos-13541-consent",
            testMatch: /screenshot-chaos-13541\.consent\.ts/,
            dependencies: ["chaos-13541-auth-setup"],
            use: { storageState: authFile },
        },
    ],
    use: {
        baseURL,
        headless: true,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    webServer: [
        {
            command: "npx tsx ./tests/mocks/http-server.ts",
            url: `${mockServerURL}/health`,
            reuseExistingServer: false,
            timeout: 30_000,
            env: { MOCK_SERVER_PORT: String(mockServerPort) },
        },
        {
            command: `npm run dev -- --hostname 127.0.0.1 --port ${webServerPort}`,
            url: baseURL,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                ...e2eAuthEnv(mockServerURL),
                PLAYWRIGHT_TEST: "true",
                DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_GUIDED_ONBOARDING: "false",
                BACKEND_URL: mockServerURL,
                ACR_SCOPES_FROM_GRANTS: "1",
                AUTH_INTERNAL_URL: mockServerURL,
                AUTH_WORKLOAD_ISSUER: WORKLOAD_ISSUER,
                AUTH_WORKLOAD_SUBJECT_FILE: WORKLOAD_SUBJECT_FILE,
            },
        },
    ],
});
