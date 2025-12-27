import { test, expect } from "@playwright/test";

test("app shell renders chart sections", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Chart prototypes powered by ECharts"
  );
  await expect(page.getByTestId("chart-sparkline")).toBeVisible();
  await expect(page.getByTestId("chart-vertical-bar")).toBeVisible();
  await expect(page.getByTestId("chart-horizontal-bar")).toBeVisible();
  await expect(page.getByTestId("chart-donut")).toBeVisible();
  await expect(page.getByTestId("chart-nested-pie-2d")).toBeVisible();
  await expect(page.getByTestId("chart-nested-pie-3d")).toBeVisible();
  await expect(page.getByTestId("chart-sankey")).toBeVisible();
});
