import { test, expect } from "@playwright/test";

test("nested 3d pie renders", async ({ page }) => {
  await page.goto("/");
  const chart = page.getByTestId("chart-nested-pie-3d");
  await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
});
