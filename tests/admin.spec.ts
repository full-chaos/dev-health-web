import { expect, test } from "@playwright/test";

test("/admin redirects unauthenticated users to sign in", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
