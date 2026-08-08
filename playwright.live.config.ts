import { defineConfig } from "@playwright/test";

const liveBackendUrl =
    process.env.PLAYWRIGHT_LIVE_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
    testDir: "./tests/live",
    reporter: [["html"], ["list"]],
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
            // CHAOS-3510 adds two things under tests/live/ that this suite must
            // NOT collect, for different reasons:
            //
            //   __tests__/  — vitest specs for the wave4 Playwright reporter.
            //     Playwright's default testMatch includes `*.test.ts`, so it
            //     picked these up and died on `Vitest cannot be imported in a
            //     CommonJS module`. They are colocated with the reporter they
            //     guard on purpose; this exclusion is what keeps that safe.
            //
            //   ask-dev-wave4-access-matrix.spec.ts — armed-or-throw, same as
            //     ask-dev-acceptance.spec.ts above. It needs the Compose
            //     launcher's org provisioning and arming contract; running it
            //     against this suite's generic backend proves nothing and fails.
            testIgnore: [
                /onboarding-ui\.spec\.ts/,
                /ask-dev-acceptance\.spec\.ts/,
                /ask-dev-wave4-access-matrix\.spec\.ts/,
                /__tests__\//,
            ],
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
                PLAYWRIGHT_TEST: "true",
                BACKEND_URL: liveBackendUrl,
            },
        },
    ],
});
