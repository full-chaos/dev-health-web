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
      testIgnore: /onboarding-ui\.spec\.ts/,
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
