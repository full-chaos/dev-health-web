import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  reporter: [['html'], ['list']],
  use: {
    baseURL: "http://127.0.0.1:3001",
    headless: true,
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
        BACKEND_URL: "http://127.0.0.1:8001",
      },
    },
  ],
});
