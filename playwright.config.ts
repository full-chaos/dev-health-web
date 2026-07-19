import { defineConfig } from "@playwright/test";

const isCI = process.env.CI === "true" || process.env.CI === "1";
const resultsDirectory = process.env.PLAYWRIGHT_RESULTS_DIR ?? "test-results/playwright/default";
const htmlOutputFolder =
    process.env.PLAYWRIGHT_HTML_REPORT ?? "test-results/playwright-html/default";
const junitOutputFile = process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME ?? `${resultsDirectory}/junit.xml`;

const AUTH_FILE = "test-results/.auth/state.json";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";

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
            testMatch: /pagerduty-final-qa-p[012]\.spec\.ts/,
            dependencies: ["auth-setup"],
            workers: 1,
            use: {
                storageState: AUTH_FILE,
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
                /pagerduty-final-qa-p[012]\.spec\.ts/,
            ],
            dependencies: ["auth-setup"],
            use: {
                storageState: AUTH_FILE,
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
            url: "http://127.0.0.1:8001/health",
            reuseExistingServer: false,
            timeout: 30_000,
            env: {
                MOCK_SERVER_PORT: "8001",
            },
        },
        {
            command: "npm run dev -- --hostname 127.0.0.1 --port 3001",
            url: "http://127.0.0.1:3001",
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                PLAYWRIGHT_TEST: "true",
                DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                BACKEND_URL: "http://127.0.0.1:8001",
            },
        },
    ],
});
