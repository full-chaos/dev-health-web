import { test, expect } from "@playwright/test";

test("sankey chart renders and shows tooltip", async ({ page }) => {
  await page.goto("/");
  const chart = page.getByTestId("chart-sankey");

  await expect(chart.locator("canvas").first()).toBeVisible();
  await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
});
