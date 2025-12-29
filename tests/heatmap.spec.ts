import { test, expect } from "@playwright/test";

test("heatmap renders and shows tooltip", async ({ page }) => {
  await page.goto("/demo");
  const chart = page.getByTestId("chart-heatmap");

  await expect(chart.locator("canvas").first()).toBeVisible();
  await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
});
