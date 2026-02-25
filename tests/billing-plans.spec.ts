import { expect, test } from "@playwright/test";

test("pricing page renders plans from billing API", async ({ page }) => {
  await page.goto("/pricing");

  await expect(page.getByRole("heading", { name: /simple, transparent pricing/i })).toBeVisible();
  // Team tier card is visible with dynamic price from mock API ($49 = 4900 cents)
  const tierCards = page.locator('section').filter({ has: page.locator('.grid.sm\\:grid-cols-3') });
  await expect(tierCards.getByText('Team').first()).toBeVisible();
  await expect(page.getByText('$49', { exact: false })).toBeVisible();
});

test("superadmin billing plan management supports CRUD and sync", async ({ page }) => {
  await page.goto("/superadmin/billing/plans");

  await expect(page.getByRole("heading", { name: "Billing Plans" })).toBeVisible();

  await page.getByPlaceholder("Plan name").fill("Growth");
  await page.getByPlaceholder("Plan key").fill("growth");
  await page.getByPlaceholder("Tier").fill("team");
  await page.getByPlaceholder("Display order").fill("4");
  await page.getByPlaceholder("Description").fill("Growth plan for scaling teams");
  await page.locator("textarea[placeholder*='interval']").fill(
    '[{"interval":"monthly","amount":6900,"currency":"usd"}]'
  );
  await page.getByRole("button", { name: "Create plan" }).click();

  await expect(page.getByRole("heading", { name: "Growth" })).toBeVisible();

  const growthCard = page.locator("article", { has: page.getByRole("heading", { name: "Growth" }) });
  await growthCard.getByRole("button", { name: "Edit" }).click();
  await page.getByPlaceholder("Plan name").fill("Growth Plus");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { name: "Growth Plus" })).toBeVisible();

  const updatedCard = page.locator("article", { has: page.getByRole("heading", { name: "Growth Plus" }) });
  await updatedCard.getByRole("button", { name: "Sync Stripe" }).click();
  await expect(updatedCard.getByText("Stripe product:", { exact: false })).toContainText("prod_");

  await updatedCard.getByRole("button", { name: "Archive" }).click();
  await expect(updatedCard.getByText("Status: inactive")).toBeVisible();
});
