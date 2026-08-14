import { defineConfig } from "@playwright/test";

const isCI = process.env.CI === "true" || process.env.CI === "1";
const resultsDirectory =
    process.env.PLAYWRIGHT_RESULTS_DIR ?? "test-results/playwright/customer-push";
const htmlReportDirectory =
    process.env.PLAYWRIGHT_HTML_REPORT ?? "test-results/playwright-html/customer-push";
const mockServerPort = Number(process.env.PLAYWRIGHT_CUSTOMER_PUSH_MOCK_PORT ?? "8004");
const webServerPort = Number(process.env.PLAYWRIGHT_CUSTOMER_PUSH_WEB_PORT ?? "3004");
const baseURL = `http://127.0.0.1:${webServerPort}`;
const mockServerURL = `http://127.0.0.1:${mockServerPort}`;
const authFile = "test-results/.auth/state.json";

export default defineConfig({
    testDir: "./tests",
    outputDir: resultsDirectory,
    workers: 1,
    retries: isCI ? 2 : 0,
    forbidOnly: isCI,
    reporter: [
        ["list"],
        ["html", { outputFolder: htmlReportDirectory, open: "never" }],
        ["junit", { outputFile: `${resultsDirectory}/junit.xml` }],
    ],
    projects: [
        { name: "customer-push-auth-setup", testMatch: /auth\.setup\.ts/ },
        {
            name: "customer-push",
            testMatch: /admin-customer-push\.spec\.ts/,
            dependencies: ["customer-push-auth-setup"],
            use: { storageState: authFile },
        },
    ],
    use: {
        baseURL,
        headless: true,
        trace: "retain-on-failure",
        video: "retain-on-failure",
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
            command: `npm run dev -- --webpack --hostname 127.0.0.1 --port ${webServerPort}`,
            url: baseURL,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                PLAYWRIGHT_TEST: "true",
                DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_GUIDED_ONBOARDING: "false",
                BACKEND_URL: mockServerURL,
            },
        },
    ],
});
