import { test, expect } from "@playwright/test";

test("home loads and navigates to explore", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Developer Health Control Room" })
  ).toBeVisible();

  await page.waitForFunction(() => {
    return new URL(window.location.href).searchParams.get("f");
  });
  const startFilter = new URL(page.url()).searchParams.get("f");

  const firstDelta = page.getByTestId("delta-tile").first();
  await firstDelta.click();
  await expect(page).toHaveURL(/\/explore\?metric=.*&f=/);
  const nextFilter = new URL(page.url()).searchParams.get("f");
  expect(nextFilter).toBe(startFilter);
  await expect(page.getByText("Endpoint")).toBeVisible();
  await expect(page.getByText("Payload")).toBeVisible();
});

test("opportunities page renders", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page.getByRole("heading", { name: "Focus Cards" })).toBeVisible();
});
