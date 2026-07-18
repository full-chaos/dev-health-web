import { defineConfig } from "@playwright/test";

/**
 * Guided first-run onboarding E2E config (CHAOS-2670 / CHAOS-2679).
 *
 * Runs the guided journey (tests/auth-onboard.spec.ts) against a SINGLE
 * `next dev` server with NEXT_PUBLIC_GUIDED_ONBOARDING enabled, so the
 * /auth/onboard/{workspace,integration,complete} routes are active. It lives in
 * its own config — not the default suite — because running a second flag-on dev
 * server alongside the default flag-off one corrupts Turbopack's shared CSS
 * cache. Kept on dedicated ports (3003 / mock 8002) and an isolated build dir
 * (NEXT_DIST_DIR) so it can never collide with the default suite.
 *
 * Run with: pnpm test:e2e:onboarding
 */

const isCI = process.env.CI === "true" || process.env.CI === "1";
const resultsDirectory = process.env.PLAYWRIGHT_RESULTS_DIR ?? "test-results/playwright/onboarding";
const htmlReportDirectory =
    process.env.PLAYWRIGHT_HTML_REPORT ?? "test-results/playwright-html/onboarding";

const ONBOARDING_AUTH_FILE = "test-results/.auth/onboarding-state.json";
const GUIDED_BASE_URL = "http://127.0.0.1:3003";

export default defineConfig({
    testDir: "./tests",
    outputDir: resultsDirectory,
    reporter: [
        ["list"],
        [
            "html",
            {
                outputFolder: htmlReportDirectory,
                open: "never",
            },
        ],
        [
            "junit",
            {
                outputFile:
                    process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME ?? `${resultsDirectory}/junit.xml`,
            },
        ],
    ],
    retries: isCI ? 2 : 0,
    forbidOnly: isCI,
    projects: [
        {
            name: "onboarding-setup",
            testMatch: /onboarding\.setup\.ts/,
        },
        {
            name: "onboarding-user",
            testMatch: [/auth-onboard\.spec\.ts/],
            dependencies: ["onboarding-setup"],
            use: {
                storageState: ONBOARDING_AUTH_FILE,
            },
        },
    ],
    use: {
        baseURL: GUIDED_BASE_URL,
        headless: true,
        trace: isCI ? "on" : "retain-on-failure",
        video: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    webServer: [
        {
            command: "npx tsx ./tests/mocks/http-server.ts",
            url: "http://127.0.0.1:8002/health",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
            env: {
                MOCK_SERVER_PORT: "8002",
            },
        },
        {
            // Single guided dev server (flag on). An isolated .next dir keeps its
            // build artifacts away from the default suite's server.
            command: "npm run dev -- --hostname 127.0.0.1 --port 3003",
            url: "http://127.0.0.1:3003",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
                PLAYWRIGHT_TEST: "true",
                DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_GUIDED_ONBOARDING: "true",
                NEXT_DIST_DIR: ".next-guided",
                BACKEND_URL: "http://127.0.0.1:8002",
            },
        },
    ],
});
