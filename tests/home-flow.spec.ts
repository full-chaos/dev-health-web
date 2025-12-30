import { test, expect } from "@playwright/test";

test("home loads and navigates to explore", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Developer Health Ops Cockpit" })
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
  await expect(page.getByText("Context")).toBeVisible();
  await expect(page.getByText("Active filters")).toBeVisible();
});

test("system status renders only returned sources", async ({ page }) => {
  await page.route("**/api/v1/home*", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }

    const payload = {
      freshness: {
        last_ingested_at: "2024-01-01T00:00:00Z",
        sources: [
          {
            key: "github",
            label: "GitHub",
            last_seen_at: "2024-01-01T00:00:00Z",
            status: "ok",
          },
        ],
        coverage: {
          repos_covered_pct: 88,
          prs_linked_to_issues_pct: 72,
          issues_with_cycle_states_pct: 64,
        },
      },
      deltas: [],
      summary: [],
      tiles: {},
      constraint: {
        title: "Constraint",
        claim: "Review congestion.",
        evidence: [],
        experiments: [],
      },
      events: [],
    };

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Developer Health Ops Cockpit" })
  ).toBeVisible();

  const sources = page.getByTestId("system-status-sources");
  await expect(sources.getByText("GitHub", { exact: true })).toBeVisible();
  await expect(sources.getByText("GitLab", { exact: true })).toHaveCount(0);
  await expect(sources.getByText("Jira", { exact: true })).toHaveCount(0);
  await expect(sources.getByText("CI", { exact: true })).toHaveCount(0);
});

test("opportunities page renders", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page.getByRole("heading", { name: "Focus Cards" })).toBeVisible();
});
