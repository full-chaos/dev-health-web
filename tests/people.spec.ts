import { test, expect } from "@playwright/test";

test("people search opens individual and metric evidence", async ({ page }) => {
  // Navigate directly with query param to avoid the FilterBar → router.replace
  // → server re-render → debounce chain which is unreliable in slow CI.
  await page.goto("/people?q=alex");

  await expect(page.getByText("Alex Harper")).toBeVisible({ timeout: 15000 });
  await page.getByText("Alex Harper").click();
  await expect(page).toHaveURL(/\/people\/person-123/);

  await expect(page.getByText("Individual view")).toBeVisible({ timeout: 10000 });

  await page.getByRole("link", { name: "Cycle Time" }).first().click();
  await expect(page).toHaveURL(/\/people\/person-123\/metrics\/cycle_time/);

  await page.getByRole("link", { name: "PRs" }).click();
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
});

test("individual pages avoid comparative language", async ({ page }) => {
  const forbidden = /rank|percentile|top performer|bottom performer|score/i;

  await page.goto("/people");
  expect(await page.content()).not.toMatch(forbidden);

  await page.goto("/people/person-guardrail");
  expect(await page.content()).not.toMatch(forbidden);

  await page.goto("/people/person-guardrail/metrics/cycle_time");
  expect(await page.content()).not.toMatch(forbidden);
});
