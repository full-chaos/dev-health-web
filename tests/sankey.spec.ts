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
  const flowLink = quadrantPanel.getByRole("link", {
    name: /view flow/i,
  });
  await expect(flowLink).toBeVisible();
  await expect(flowLink).toHaveAttribute("href", /tab=flow/);
  await flowLink.click();

  await expect(page).toHaveURL(/tab=flow/);
  await expect(page.getByTestId("flow-chart-container").locator("canvas").first()).toBeVisible();
});
