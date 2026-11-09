import { defineConfig } from "@playwright/test";
import { e2eAuthEnv } from "./ci/next-dev-env";

/**
 * CHAOS-12841 (E8 AC-6): visual-regression baselines of the Ask Dev rich views, in their own config.
 *
 * The baselines are pixels, so they hold only on the machine image that made them: the mirrored
 * Playwright image pinned in ci/ci-images.json (`playwright`), with its own fonts and Chromium. CI
 * runs this config in that container (the `visual` job in tests.yml), and baselines are made in the
 * same image. The default e2e suite runs on the bare runner and ignores this spec.
 */
const isCI = process.env.CI === "true" || process.env.CI === "1";
const resultsDirectory = process.env.PLAYWRIGHT_RESULTS_DIR ?? "test-results/playwright/visual";
const htmlReportDirectory =
    process.env.PLAYWRIGHT_HTML_REPORT ?? "test-results/playwright-html/visual";
const mockServerPort = Number(process.env.PLAYWRIGHT_VISUAL_MOCK_PORT ?? "8007");
const webServerPort = Number(process.env.PLAYWRIGHT_VISUAL_WEB_PORT ?? "3007");
const baseURL = `http://127.0.0.1:${webServerPort}`;
const mockServerURL = `http://127.0.0.1:${mockServerPort}`;
const authFile = "test-results/.auth/state.json";

export default defineConfig({
    testDir: "./tests",
    outputDir: resultsDirectory,
    // One linux baseline per view: the image is the platform, so the name carries no OS suffix.
    snapshotPathTemplate: "{testDir}/__visual__/{arg}{ext}",
    workers: 1,
    // A pixel diff is not flaky: a retry must not turn one into a pass.
    retries: 0,
    forbidOnly: isCI,
    expect: {
        // No tolerance (lead ruling on CHAOS-12841): the baseline and the run share one image.
        // `threshold: 0` too: the default per-pixel colour distance (0.2) let a planted theme colour
        // change (#a64807 -> #885a00 on the sunburst) pass with zero "different" pixels.
        toHaveScreenshot: {
            maxDiffPixels: 0,
            threshold: 0,
            animations: "disabled",
            caret: "hide",
        },
    },
    reporter: [
        ["list"],
        ["html", { outputFolder: htmlReportDirectory, open: "never" }],
        ["junit", { outputFile: `${resultsDirectory}/junit.xml` }],
    ],
    projects: [
        { name: "visual-auth-setup", testMatch: /auth\.setup\.ts/ },
        {
            name: "visual",
            testMatch: /ask-dev-visual\.spec\.ts/,
            dependencies: ["visual-auth-setup"],
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
            timeout: 180_000,
            env: {
                ...e2eAuthEnv(mockServerURL),
                NEXT_DIST_DIR: ".next/visual",
                PLAYWRIGHT_TEST: "true",
                DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_GUIDED_ONBOARDING: "false",
                BACKEND_URL: mockServerURL,
            },
        },
    ],
});
