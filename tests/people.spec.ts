import { test, expect } from "@playwright/test";

test("people search opens individual and metric evidence", async ({ page }) => {
  await page.goto("/people?q=alex");

  const personLink = page
    .locator('a[href*="/people/person-123"]')
    .filter({ hasText: "Alex Harper" });
  await expect(personLink).toBeVisible({ timeout: 15000 });
  await expect(personLink).toHaveAttribute("href", /\/people\/person-123\?f=/);
  await personLink.click();
  await expect(page).toHaveURL(/\/people\/person-123(?:\?|$)/);

  await expect(page.getByText("Individual view")).toBeVisible({ timeout: 10000 });

  const cycleTimeLink = page.locator(
    'a[href*="/people/person-123/metrics/cycle_time"]'
  );
  await expect(cycleTimeLink.first()).toBeVisible({ timeout: 10000 });
  await cycleTimeLink.first().click();
  await expect(page).toHaveURL(/\/people\/person-123\/metrics\/cycle_time(?:\?|$)/);

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
