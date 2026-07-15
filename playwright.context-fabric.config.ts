import { defineConfig } from "@playwright/test";

const AUTH_FILE = "test-results/.auth/state.json";

export default defineConfig({
    testDir: "./tests",
    testMatch: /acr-context-fabric\.production\.spec\.ts/,
    fullyParallel: false,
    workers: 1,
    reporter: [["list"]],
    use: {
        baseURL: "http://127.0.0.1:3012",
        headless: true,
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "auth-setup",
            testMatch: /auth\.setup\.ts/,
        },
        {
            name: "authenticated",
            dependencies: ["auth-setup"],
            use: { storageState: AUTH_FILE },
        },
    ],
    webServer: [
        {
            command: "npx tsx ./tests/mocks/http-server.ts",
            url: "http://127.0.0.1:8012/health",
            reuseExistingServer: false,
            timeout: 30_000,
            env: { MOCK_SERVER_PORT: "8012" },
        },
        {
            command:
                "rm -rf test-results/context-fabric-runtime && mkdir -p test-results/context-fabric-runtime/.next && cp -R .next/standalone/. test-results/context-fabric-runtime && cp -R .next/static test-results/context-fabric-runtime/.next/static && cp -R public scripts test-results/context-fabric-runtime && cd test-results/context-fabric-runtime && node scripts/write-runtime-config.mjs && HOSTNAME=127.0.0.1 PORT=3012 node server.js",
            url: "http://127.0.0.1:3012",
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                BACKEND_URL: "http://127.0.0.1:8012",
                AUTH_SECRET: "context-fabric-production-playwright",
                NODE_ENV: "production",
            },
        },
    ],
});
