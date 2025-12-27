import { test, expect } from "@playwright/test";

test("home loads and navigates to explore", async ({ page }) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Developer Health Control Room" })
  ).toBeVisible();

  const firstDelta = page.getByTestId("delta-tile").first();
  await firstDelta.click();
  await expect(page).toHaveURL(/\/explore\?metric=/);
});

test("opportunities page renders", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page.getByRole("heading", { name: "Focus Cards" })).toBeVisible();
});
