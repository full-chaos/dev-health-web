import { test, expect } from "@playwright/test";

test("flame diagram renders and shows tooltip", async ({ page }) => {
  await page.goto("/demo");
  const chart = page.getByTestId("chart-flame");

  await expect(chart.locator("canvas").first()).toBeVisible();
  await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
});

test("flame page loads with mode selector", async ({ page }) => {
  await page.goto("/flame?mode=cycle_breakdown");

  // Check page title is visible
  await expect(page.getByRole("heading", { name: "Flame Diagram" })).toBeVisible();

  // Check mode selector buttons are visible
  await expect(page.getByRole("link", { name: /cycle-time breakdown/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /throughput breakdown/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /code hotspots/i })).toBeVisible();
});

test("flame page loads throughput mode", async ({ page }) => {
  await page.goto("/flame?mode=throughput");
  await expect(page.getByText(/throughput breakdown/i).first()).toBeVisible();
  await expect(page.getByText(/shows work delivered decomposition/i)).toBeVisible();
});

test("flame page mode selector switches modes", async ({ page }) => {
  await page.goto("/flame?mode=cycle_breakdown");

  // Click code hotspots mode
  await page.getByRole("link", { name: /code hotspots/i }).click();

  // Should update URL
  await expect(page).toHaveURL(/mode=code_hotspots/);
});
