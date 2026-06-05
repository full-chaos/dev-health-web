import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "test-results/.auth/state.json";

setup("authenticate", async ({ page }) => {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Wait for redirect away from signin — confirms session was created
    await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 10000 });

    await page.context().storageState({ path: AUTH_FILE });
});
