import { defineConfig } from "@playwright/test";
import { e2eOrigin, e2ePorts } from "./ci/e2e-ports.mjs";
import { nextDevNodeOptions } from "./ci/next-dev-env";

const isCI = process.env.CI === "true" || process.env.CI === "1";
const resultsDirectory = process.env.PLAYWRIGHT_RESULTS_DIR ?? "test-results/playwright/navigation";
const htmlReportDirectory =
    process.env.PLAYWRIGHT_HTML_REPORT ?? "test-results/playwright-html/navigation";
const mockServerPort = e2ePorts.navigationMockPort;
const webServerPort = e2ePorts.navigationWebPort;
const baseURL = e2eOrigin(webServerPort);
const mockServerURL = e2eOrigin(mockServerPort);
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
        { name: "navigation-auth-setup", testMatch: /auth\.setup\.ts/ },
        {
            name: "navigation",
            testMatch: /nav-reachability\.spec\.ts/,
            dependencies: ["navigation-auth-setup"],
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
            command: `npm run dev -- --hostname 127.0.0.1 --port ${webServerPort}`,
            url: baseURL,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                NODE_OPTIONS: nextDevNodeOptions(),
                NEXT_DIST_DIR: ".next/navigation",
                PLAYWRIGHT_TEST: "true",
                DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_GUIDED_ONBOARDING: "false",
                BACKEND_URL: mockServerURL,
            },
        },
    ],
});
