import { test, expect } from "@playwright/test";

test("nested 2d pie renders", async ({ page }) => {
  await page.goto("/");
  const chart = page.getByTestId("chart-nested-pie-2d");
  await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
});
