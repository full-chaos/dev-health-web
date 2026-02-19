import { defineConfig } from "@playwright/test";

const liveBackendUrl =
  process.env.PLAYWRIGHT_LIVE_BACKEND_URL ??
  process.env.BACKEND_URL ??
  "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "./tests/live",
  reporter: [["html"], ["list"]],
  use: {
    baseURL: "http://127.0.0.1:3002",
    headless: true,
  },
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
