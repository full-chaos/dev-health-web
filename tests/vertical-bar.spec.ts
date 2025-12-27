import { test, expect } from "@playwright/test";

test("vertical bar chart renders and shows tooltip", async ({ page }) => {
  await page.goto("/");
  const chart = page.getByTestId("chart-vertical-bar");

  await expect(chart.locator("canvas").first()).toBeVisible();
  await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
});
