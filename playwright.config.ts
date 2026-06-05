import { defineConfig } from "@playwright/test";

const isCI = process.env.CI === "true" || process.env.CI === "1";
const htmlOutputFolder = process.env.PLAYWRIGHT_HTML_REPORT ?? "playwright-report";
const junitOutputFile =
    process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME ?? "test-results/playwright/junit.xml";

const AUTH_FILE = "test-results/.auth/state.json";
const ONBOARDING_AUTH_FILE = "test-results/.auth/onboarding-state.json";

export default defineConfig({
    testDir: "./tests",
    testIgnore: ["live/**"],
    outputDir: "test-results/playwright",
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
            ],
        },
    ],
    use: {
        baseURL: "http://127.0.0.1:3001",
        headless: true,
        trace: "retain-on-failure",
        video: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    webServer: [
        {
            command: "npx tsx ./tests/mocks/http-server.ts",
            url: "http://127.0.0.1:8001/health",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
            env: {
                MOCK_SERVER_PORT: "8001",
            },
        },
        {
            command: "npm run dev -- --hostname 127.0.0.1 --port 3001",
            url: "http://127.0.0.1:3001",
            reuseExistingServer: !process.env.CI,
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
