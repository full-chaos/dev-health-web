import { expect, test } from "@playwright/test";

test("billing audit page renders or redirects to sign in", async ({ page }) => {
  await page.goto("/admin/billing/audit");

  if (page.url().includes("/auth/signin")) {
    await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
    return;
  }

  await expect(page.getByRole("heading", { name: "Billing Audit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Reconciliation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
});
