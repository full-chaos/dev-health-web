import { expect, test } from "@playwright/test";

// The sample-data banner, manual backlog input, and team text input were
// removed in CHAOS-1783. CHAOS-1784 added multi-team aggregation. In the
// E2E suite the backend is not reachable, so the forecast fetch returns
// null and the page renders the EmptyForecastState card.

test.describe("Capacity Planning page", () => {
  test("renders the throughput forecast page header", async ({ page }) => {
    await page.goto("/capacity-planning");

    await expect(page.getByRole("heading", { name: /Throughput forecast/i })).toBeVisible();
    await expect(
      page.getByText(/Backlog and scope are derived from the filter bar/i),
    ).toBeVisible();
  });

  test("shows the empty-state card when the backend is unreachable", async ({ page }) => {
    await page.goto("/capacity-planning");

    // CHAOS-1783: sample data is gone. Without a reachable forecast the
    // page renders an honest empty state instead of placeholder numbers.
    await expect(page.getByRole("heading", { name: /No forecast available/i })).toBeVisible();
    await expect(page.getByText(/Scope:/i)).toBeVisible();
    await expect(page.getByText(/Showing sample data/i)).not.toBeVisible();
  });

  test("does not expose a manual backlog or team input", async ({ page }) => {
    await page.goto("/capacity-planning");

    // Both inputs were deleted in CHAOS-1783 — backlog is derived from
    // the filter scope server-side.
    await expect(page.locator('input[name="team"]')).toHaveCount(0);
    await expect(page.locator('input[name="backlog"]')).toHaveCount(0);
  });

  test("scope label reflects All teams when no team is selected", async ({ page }) => {
    await page.goto("/capacity-planning");

    await expect(page.getByText(/Scope:\s*All teams/i)).toBeVisible();
  });

  test("links to the Monte Carlo view", async ({ page }) => {
    await page.goto("/capacity-planning");

    const link = page.getByRole("link", { name: /Monte Carlo view/i });
    await expect(link).toBeVisible();
  });

  test("renders the unified global context bar above the forecast (CHAOS-2081)", async ({
    page,
  }) => {
    await page.goto("/capacity-planning");

    // CHAOS-2081 unified global scope/date/repo into a single GlobalContextBar.
    // Capacity Planning carries no page-local filters, so the per-page FilterBar
    // legitimately disappears and the global context bar is the canonical chrome.
    const contextBar = page.getByTestId("global-context-bar");
    await expect(contextBar).toBeVisible();
    await expect(contextBar).toHaveAttribute("aria-label", "Global context");
  });
});
