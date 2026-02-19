import { expect, test } from "@playwright/test";

test("/admin redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=(%2Fadmin|\/admin)/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
});
