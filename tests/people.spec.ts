import { test, expect, type Page, type Locator } from "@playwright/test";

const gotoLinkHref = async (page: Page, link: Locator) => {
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  if (!href) {
    throw new Error("Expected link to include an href");
  }
  await page.goto(href);
};

test("people search opens individual and metric evidence", async ({ page }) => {
  await page.goto("/people?q=alex");

  const personLink = page
    .locator('a[href*="/people/person-123"]')
    .filter({ hasText: "Alex Harper" });
  await expect(personLink).toBeVisible({ timeout: 15000 });
  await expect(personLink).toHaveAttribute("href", /\/people\/person-123\?f=/);
  await gotoLinkHref(page, personLink);
  await expect(page).toHaveURL(/\/people\/person-123(?:\?|$)/);

  const main = page.getByRole("main");
  await expect(main.getByText("Individual view")).toBeVisible({ timeout: 10000 });

  const cycleTimeLink = main.locator('a[href*="/people/person-123/metrics/cycle_time"]');
  await expect(cycleTimeLink.first()).toBeVisible({ timeout: 10000 });
  await gotoLinkHref(page, cycleTimeLink.first());
  await expect(page).toHaveURL(/\/people\/person-123\/metrics\/cycle_time(?:\?|$)/);

  const prsLink = main.getByRole("link", { name: "PRs" });
  await expect(prsLink).toBeVisible({ timeout: 10000 });
  await gotoLinkHref(page, prsLink);
  await expect(main.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(main.getByRole("table")).toBeVisible();
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
