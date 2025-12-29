import { test, expect } from "@playwright/test";

const samplePerson = {
  person_id: "person-123",
  display_name: "Alex Harper",
  identities: [{ provider: "github", handle: "aharper" }],
  active: true,
};

test("people search opens individual and metric evidence", async ({ page }) => {
  await page.route("**/api/v1/people**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([samplePerson]),
    });
  });

  await page.goto("/people");
  await page.getByPlaceholder("Name or handle").fill("alex");
  await expect(page.getByText("Alex Harper")).toBeVisible();
  await page.getByText("Alex Harper").click();
  await expect(page).toHaveURL(/\/people\/person-123/);

  await expect(page.getByText("Individual view")).toBeVisible();

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
