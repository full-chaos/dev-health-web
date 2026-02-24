import { expect, test } from "@playwright/test";

test("refund dialog validates partial refund amount before submit", async ({ page }) => {
  await page.goto("/billing-refunds-test");

  await page.getByRole("button", { name: "Issue Refund" }).click();
  await page.getByRole("checkbox", { name: "Partial refund" }).check();

  const amount = page.getByLabel("Amount (USD)");
  await amount.fill("99.99");

  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Amount cannot exceed the refundable balance.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Refund" })).toHaveCount(0);
});
