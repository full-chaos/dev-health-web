import { expect, test } from "@playwright/test";

test("home page loads with live backend", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Developer Health Ops Cockpit" })
  ).toBeVisible();
});

test("work page loads with live backend", async ({ page }) => {
  await page.goto("/work");
  await expect(
    page.getByRole("heading", { name: "Work Investment and Flow" })
  ).toBeVisible();
});
