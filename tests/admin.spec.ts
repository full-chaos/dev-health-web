import { expect, test } from "@playwright/test";

test("/org/admin redirects unauthenticated users to sign in", async ({ page }) => {
    await page.goto("/org/admin");

    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("/admin deep links redirect through /org/admin before sign in", async ({ page }) => {
    await page.goto("/admin/sync");

    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page).toHaveURL(/callbackUrl=%2Forg%2Fadmin%2Fsync/);
});
