import { expect, test } from "@playwright/test";

test("billing settings renders subscription section", async ({ page }) => {
  await page.goto("/admin/settings");

  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByText("Current Plan")).toBeVisible();
  await expect(page.getByText("Subscription History")).toBeVisible();
});
