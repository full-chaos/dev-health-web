/**
 * TEMPORARY config for capturing CHAOS-2795/2796 visual evidence on
 * non-default ports (3031/8031) so it doesn't collide with the default
 * suite's 3001/8001 servers, which may be occupied by parallel worktrees.
 * Delete alongside tests/screenshot-chaos-2795.spec.ts after PR is merged.
 */
import { defineConfig } from "@playwright/test";

// auth.setup.ts hardcodes this path internally (not configurable), so this
// constant must match it exactly.
const AUTH_FILE = "test-results/.auth/state.json";

export default defineConfig({
    testDir: "./tests",
    testMatch: [/screenshot-chaos-2795\.spec\.ts/, /auth\.setup\.ts/],
    outputDir: "test-results/playwright-2795",
    reporter: [["list"]],
    retries: 0,
    projects: [
        {
            name: "auth-setup",
            testMatch: /auth\.setup\.ts/,
        },
        {
            name: "authenticated",
            testMatch: /screenshot-chaos-2795\.spec\.ts/,
            dependencies: ["auth-setup"],
            use: {
                storageState: AUTH_FILE,
            },
        },
    ],
    use: {
        baseURL: "http://127.0.0.1:3031",
        headless: true,
        trace: "off",
        video: "off",
        screenshot: "off",
    },
    webServer: [
        {
            command: "npx tsx ./tests/mocks/http-server.ts",
            url: "http://127.0.0.1:8031/health",
            reuseExistingServer: false,
            timeout: 30_000,
            env: {
                MOCK_SERVER_PORT: "8031",
            },
        },
        {
            command: "npm run dev -- --hostname 127.0.0.1 --port 3031",
            url: "http://127.0.0.1:3031",
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                PLAYWRIGHT_TEST: "true",
                DEV_HEALTH_TEST_MODE: "true",
                NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
                BACKEND_URL: "http://127.0.0.1:8031",
            },
        },
    ],
});
