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

// CHAOS-8538. On 2026-10-03 two CI jobs ran 35 minutes of 30 s timeouts: the
// dev server did not answer the app-shell logo request, so the `load` event
// never fired on a signed-in page. The four settings below make that class of
// failure name itself and stop early.
//
// 1. Server output. Playwright drops a web server's stdout by default, so the
//    job log had no server-side record. In CI both streams go to the job log
//    as `[WebServer]` lines.
const serverStdout = isCI ? "pipe" : "ignore";
// 2. Pending requests on a timeout: see the reporter entry below.
// 3. `maxFailures`. A test counts once, after its last retry. The job time
//    limit sets the number (15 minutes, `e2e-default` in tests.yml): a test
//    that fails by time-out costs 93.6 s (three tries, measured), so six such
//    tests stop the job after about 11 minutes, with "Testing stopped early"
//    and the end summary in the log. Ten need 17 minutes: the job limit
//    cancels the job first and the summary is lost. What the limit cuts:
//    after the sixth failed test the remaining tests of that job do not run.
//    On 2026-10-03, 23 of the 77 spec files had six tests or more, so one
//    fully broken file of those stops its shard early.
// 4. Logo canary: see the `shell-logo-canary` project below.
const ciMaxFailures = 6;

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
        "admin-row-links.production.spec.ts",
        "investment-duplicate-requests.production.spec.ts",
        "admin-customer-push.spec.ts",
        "nav-reachability.spec.ts",
    ],
    outputDir: resultsDirectory,
    // Keep CI's test-mode fixture requests serial. Customer-push runs in its own
    // short-lived Webpack config because this long-lived Turbopack server has
    // lost that dynamic route family after earlier requests in hosted CI.
    workers: isCI ? 1 : undefined,
    reporter: [
        ["list"],
        // CHAOS-8538 (2): on a test timeout, prints the requests that had no
        // response, with their age. It reads the trace of the failed try; it
        // runs after the try and cannot change a test.
        ["./ci/playwright-pending-requests.ts"],
        ["html", { outputFolder: htmlOutputFolder, open: "never" }],
        ["junit", { outputFile: junitOutputFile }],
    ],
    retries: isCI ? 2 : 0,
    maxFailures: isCI ? ciMaxFailures : 0,
    forbidOnly: isCI,
    projects: [
        {
            name: "auth-setup",
            testMatch: /auth\.setup\.ts/,
        },
        {
            // CHAOS-8538 (4): logo canary. A dependency project runs in each
            // shard, before the first test of `authenticated`. It fails in
            // 10 s with the URL when the server does not answer the app-shell
            // logo, and `authenticated` then does not start.
            name: "shell-logo-canary",
            testMatch: /shell-logo-canary\.setup\.ts/,
            dependencies: ["auth-setup"],
            use: {
                storageState: authFile,
            },
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
                /admin-row-links\.production\.spec\.ts/,
                /admin-customer-push\.spec\.ts/,
                /nav-reachability\.spec\.ts/,
                /pagerduty-final-qa-p[0-3]\.spec\.ts/,
                /acr-device-fresh-session\.spec\.ts/,
            ],
            dependencies: ["auth-setup", "shell-logo-canary"],
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
                /acr-device-fresh-session\.spec\.ts/,
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
            stdout: serverStdout,
            stderr: "pipe",
            env: {
                MOCK_SERVER_PORT: String(mockServerPort),
            },
        },
        {
            command: `npm run dev -- --hostname 127.0.0.1 --port ${webServerPort}`,
            url: baseURL,
            reuseExistingServer: false,
            timeout: 120_000,
            stdout: serverStdout,
            stderr: "pipe",
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
