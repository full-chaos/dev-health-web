import { defineConfig } from "@playwright/test";

const isCI = process.env.CI === "true" || process.env.CI === "1";
const resultsDirectory = process.env.PLAYWRIGHT_RESULTS_DIR ?? "test-results/playwright/default";
const htmlOutputFolder =
    process.env.PLAYWRIGHT_HTML_REPORT ?? "test-results/playwright-html/default";
const junitOutputFile = process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME ?? `${resultsDirectory}/junit.xml`;

const authFile = "test-results/.auth/state.json";
const mockServerPort = Number(process.env.PLAYWRIGHT_MOCK_PORT ?? "8001");
const webServerPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? "3001");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webServerPort}`;
const mockServerUrl = `http://127.0.0.1:${mockServerPort}`;

// The guided first-run onboarding journey (auth-onboard.spec.ts) runs with
// NEXT_PUBLIC_GUIDED_ONBOARDING enabled and therefore lives in its own config
// (playwright.onboarding.config.ts). Running a second flag-on `next dev` server
// alongside this flag-off one corrupts Turbopack's shared CSS cache, so the two
// suites must not start their dev servers at the same time. This default suite
// keeps the flag off and asserts the legacy single-page path via
// auth-onboard-legacy.spec.ts, while ignoring the guided spec; `pnpm
// test:e2e:onboarding` (and CI) runs the guided config separately.
export default defineConfig({
    testDir: "./tests",
    testMatch: /.*\.spec\.ts/,
    testIgnore: [
        "live/**",
        "**/mocks/**",
        "auth-onboard.spec.ts",
        "onboarding.setup.ts",
        "acr-context-fabric.production.spec.ts",
    ],
    outputDir: resultsDirectory,
    reporter: [
        ["list"],
        ["html", { outputFolder: htmlOutputFolder, open: "never" }],
        ["junit", { outputFile: junitOutputFile }],
    ],
    retries: isCI ? 2 : 0,
    forbidOnly: isCI,
    projects: [
        {
            name: "auth-setup",
            testMatch: /auth\.setup\.ts/,
        },
        {
            // These specs select a process-global MSW scenario through the mock
            // control endpoint. One worker prevents one file from replacing
            // another file's scenario while preserving normal-suite parallelism.
            name: "pagerduty-final-qa",
            testMatch: /pagerduty-final-qa-p[0-3]\.spec\.ts/,
            dependencies: ["auth-setup"],
            workers: 1,
            use: {
                storageState: authFile,
            },
        },
        {
            name: "authenticated",
            testIgnore: [
                /auth-signin\.spec\.ts/,
                /(?:^|\/)admin\.spec\.ts$/,
                /auth\.setup\.ts/,
                /live\//,
                /marketing-pricing\.spec\.ts/,
                /auth-signup\.spec\.ts/,
                /auth-onboard\.spec\.ts/,
                /onboarding\.setup\.ts/,
                /account-creation-journey\.spec\.ts/,
                /auth-onboard-legacy\.spec\.ts/,
                /acr-context-fabric\.production\.spec\.ts/,
                /pagerduty-final-qa-p[0-3]\.spec\.ts/,
            ],
            dependencies: ["auth-setup"],
            use: {
                storageState: authFile,
            },
        },
        {
            name: "unauthenticated",
            testMatch: [
                /auth-signin\.spec\.ts/,
                /(?:^|\/)admin\.spec\.ts$/,
                /marketing-pricing\.spec\.ts/,
                /auth-signup\.spec\.ts/,
                /auth-onboard-legacy\.spec\.ts/,
            ],
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
            url: `${mockServerUrl}/health`,
            reuseExistingServer: false,
            timeout: 30_000,
            env: {
                MOCK_SERVER_PORT: String(mockServerPort),
            },
        },
        {
            command: `npm run dev -- --hostname 127.0.0.1 --port ${webServerPort}`,
            url: baseURL,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                PLAYWRIGHT_TEST: "true",
                DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_GUIDED_ONBOARDING: "false",
                BACKEND_URL: mockServerUrl,
            },
        },
    ],
});
