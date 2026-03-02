import { test as setup, expect } from "@playwright/test";

const ONBOARDING_AUTH_FILE = "test-results/.auth/onboarding-state.json";

setup("authenticate as onboarding user", async ({ page }) => {
  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill("newuser@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();

  // newuser gets needs_onboarding: true, should redirect to /auth/onboard
  await expect(page).toHaveURL(/\/auth\/onboard/, { timeout: 10000 });

  await page.context().storageState({ path: ONBOARDING_AUTH_FILE });
});
