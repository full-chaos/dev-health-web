import { defineConfig } from "@playwright/test";
import { nextDevNodeOptions } from "./ci/next-dev-env";

const guided =
    process.env.LIVE_GUIDED_ONBOARDING === "true" || process.env.LIVE_GUIDED_ONBOARDING === "1";

const liveBackendUrl =
    process.env.PLAYWRIGHT_LIVE_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
    testDir: "./tests/live",
    reporter: [
        ["html"],
        ["list"],
        // Read by ci/live-e2e-skip-gate.mjs: a skipped test fails the CI tier (CHAOS-12138).
        [
            "json",
            { outputFile: process.env.LIVE_E2E_JSON ?? "playwright-report/live-results.json" },
        ],
    ],
    // Two passes: the default backend auto-creates an org on register, the guided pass runs the
    // orgless journey (tests tagged @guided) against a backend started with
    // AUTH_AUTO_CREATE_ORG_ON_REGISTER=false.
    ...(guided ? { grep: /@guided/ } : { grepInvert: /@guided/ }),
    /* Run onboarding-ui first — it exercises the browser signup form and is
     sensitive to the backend's 3-per-hour register rate limit. */
    projects: [
        {
            name: "onboarding-ui",
            testMatch: /onboarding-ui\.spec\.ts/,
            use: { baseURL: "http://127.0.0.1:3002", headless: true },
        },
        {
            name: "live-api",
            testIgnore: [/onboarding-ui\.spec\.ts/],
            dependencies: ["onboarding-ui"],
            use: { baseURL: "http://127.0.0.1:3002", headless: true },
        },
    ],
    webServer: [
        {
            command: "npm run dev -- --hostname 127.0.0.1 --port 3002",
            url: "http://127.0.0.1:3002",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
                NODE_OPTIONS: nextDevNodeOptions(),
                PLAYWRIGHT_TEST: "true",
                BACKEND_URL: liveBackendUrl,
                // The Next proxy has its own register limiter (5/hour per IP, fail-closed) that answered
                // 429 to the browser signup test in CI (CHAOS-12138). The test-mode bypass is the same
                // one the other playwright configs use; the backend limiter is still in the path.
                DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                ...(guided ? { NEXT_PUBLIC_GUIDED_ONBOARDING: "true" } : {}),
            },
        },
    ],
});
