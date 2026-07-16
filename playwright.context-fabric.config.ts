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
            command: "pnpm exec tsx ./tests/mocks/http-server.ts",
            url: "http://127.0.0.1:8012/health",
            reuseExistingServer: false,
            timeout: 30_000,
            env: { MOCK_SERVER_PORT: "8012" },
        },
        {
            command:
                "rm -rf test-results/context-fabric-keys && mkdir -p test-results/context-fabric-keys && openssl genpkey -algorithm ED25519 -out test-results/context-fabric-keys/web-assertion.key && chmod 600 test-results/context-fabric-keys/web-assertion.key && openssl req -x509 -newkey rsa:2048 -nodes -keyout test-results/context-fabric-keys/tls.key -out test-results/context-fabric-keys/tls.crt -subj /CN=127.0.0.1 -days 1 && pnpm exec tsx ./tests/mocks/acr-server.ts",
            url: "https://127.0.0.1:8013/health",
            ignoreHTTPSErrors: true,
            reuseExistingServer: false,
            timeout: 30_000,
            env: {
                ACR_MOCK_CERT_FILE: "test-results/context-fabric-keys/tls.crt",
                ACR_MOCK_KEY_FILE: "test-results/context-fabric-keys/tls.key",
                ACR_MOCK_PORT: "8013",
            },
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
                AUTH_URL: "http://127.0.0.1:3012",
                ACR_API_ORIGIN: "https://127.0.0.1:8013",
                ACR_WEB_ASSERTION_AUDIENCE: "dev-health-acr",
                ACR_WEB_ASSERTION_ISSUER: "dev-health-web",
                ACR_WEB_ASSERTION_KEY_FILE: "../context-fabric-keys/web-assertion.key",
                ACR_WEB_ASSERTION_KID: "context-fabric-e2e",
                NODE_ENV: "production",
                NODE_TLS_REJECT_UNAUTHORIZED: "0",
            },
        },
    ],
});
