import { test, expect } from "@playwright/test";

test("sankey chart renders and shows tooltip", async ({ page }) => {
  await page.goto("/demo");
  const chart = page.getByTestId("chart-sankey");

  await expect(chart.locator("canvas").first()).toBeVisible();
  await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
});

test("sankey investigation opens from quadrant panel", async ({ page }) => {
  await page.goto("/demo");
  const quadrantPanel = page.getByTestId("quadrant-investigation");

  await quadrantPanel.getByRole("button", { name: "Core" }).click();
  const sankeyButton = quadrantPanel.getByRole("button", {
    name: "View investment flow",
  });
  await expect(sankeyButton).toBeVisible();
  await sankeyButton.click();

  const sankeyPanel = page.getByTestId("sankey-investigation-panel");
  await expect(sankeyPanel.locator("canvas").first()).toBeVisible();
  await expect(sankeyPanel.locator("[data-chart-ready='true']")).toBeVisible();
});
