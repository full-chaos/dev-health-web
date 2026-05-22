import { expect, test } from "@playwright/test";

test("/deployments/[deployment_id] renders deployment flame", async ({ page }) => {
  await page.goto("/deployments/deploy-123");

  await expect(page.getByRole("heading", { name: "Flame Diagram" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Explore" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "deploy-123" })).toBeVisible();
  await expect(page.getByText("staging")).toBeVisible();
  await expect(page.locator("[data-chart-ready='true']").first()).toBeVisible();
});

test("/deployments/[deployment_id] shows fallback when flame is unavailable", async ({ page }) => {
  await page.goto("/deployments/missing-flame");

  await expect(page.getByRole("heading", { name: "Flame Diagram" })).toBeVisible();
  await expect(page.getByText("Flame data unavailable for this deployment.")).toBeVisible();
});
