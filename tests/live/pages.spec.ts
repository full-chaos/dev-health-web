import { expect, test } from "@playwright/test";

test("home page shows marketing landing page for unauthenticated users", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: /where is your engineering effort/i }),
  ).toBeVisible();
});

test("dashboard redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/signin/);
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("work page redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/work");
  await expect(page).toHaveURL(/\/auth\/signin/);
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
});
