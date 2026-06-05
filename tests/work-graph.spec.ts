import { test, expect } from "@playwright/test";

test("work graph explorer renders on demo page", async ({ page }) => {
    await page.goto("/demo");
    const chart = page.getByTestId("chart-work-graph");

    await expect(chart.locator("canvas").first()).toBeVisible();
    await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
});
