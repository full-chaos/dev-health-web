import { expect, test } from "@playwright/test";

test("home page redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/signin/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your account" })
  ).toBeVisible();
});

test("work page redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/work");
  await expect(page).toHaveURL(/\/auth\/signin/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your account" })
  ).toBeVisible();
});
