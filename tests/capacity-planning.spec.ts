import { expect, test } from "@playwright/test";

// The sample-data banner, manual backlog input, and team text input were
// removed in CHAOS-1783. CHAOS-1784 added multi-team aggregation. In the
// E2E suite the backend is not reachable, so the forecast fetch returns
// null and the page renders the EmptyForecastState card.

test.describe("Delivery Forecast page", () => {
  test("renders the delivery forecast page header", async ({ page }) => {
    await page.goto("/plan/delivery-forecast");

    await expect(page.getByRole("heading", { name: /Delivery Forecast/i })).toBeVisible();
    await expect(
      page.getByText(/Backlog and scope are derived from the filter bar/i),
    ).toBeVisible();
  });

  test("shows the empty-state card when the backend is unreachable", async ({ page }) => {
    await page.goto("/plan/delivery-forecast");

    // CHAOS-1783: sample data is gone. Without a reachable forecast the
    // page renders an honest empty state instead of placeholder numbers.
    await expect(page.getByRole("heading", { name: /No forecast available/i })).toBeVisible();
    await expect(page.getByText(/Scope:/i)).toBeVisible();
    await expect(page.getByText(/Showing sample data/i)).not.toBeVisible();
  });

  test("does not expose a manual backlog or team input", async ({ page }) => {
    await page.goto("/plan/delivery-forecast");

    // Both inputs were deleted in CHAOS-1783 — backlog is derived from
    // the filter scope server-side.
    await expect(page.locator('input[name="team"]')).toHaveCount(0);
    await expect(page.locator('input[name="backlog"]')).toHaveCount(0);
  });

  test("scope label reflects All teams when no team is selected", async ({ page }) => {
    await page.goto("/plan/delivery-forecast");

    await expect(page.getByText(/Scope:\s*All teams/i)).toBeVisible();
  });

  test("exposes Delivery Forecast (active) and Monte Carlo sibling tabs", async ({ page }) => {
    await page.goto("/plan/delivery-forecast");

    const tabs = page.getByRole("navigation", { name: "Plan forecast views" });
    await expect(tabs.getByRole("link", { name: /^Delivery Forecast$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // CHAOS-2079 / J4: the Monte Carlo tab must point at the REAL forecast route
    // (/plan/capacity), not self-link back to the summary.
    const monteCarlo = tabs.getByRole("link", { name: /^Monte Carlo$/i });
    await expect(monteCarlo).toHaveAttribute("href", /\/plan\/capacity/);
    await expect(monteCarlo).not.toHaveAttribute("aria-current", "page");
  });

  test("Monte Carlo view at /plan/capacity renders the real forecast surface", async ({ page }) => {
    await page.goto("/plan/capacity");

    await expect(page.getByRole("heading", { name: /Monte Carlo Forecast/i })).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Plan forecast views" });
    await expect(tabs.getByRole("link", { name: /^Monte Carlo$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(tabs.getByRole("link", { name: /^Delivery Forecast$/i })).toHaveAttribute(
      "href",
      /\/plan\/delivery-forecast/,
    );
  });

  test("renders the unified global context bar above the forecast (CHAOS-2081)", async ({
    page,
  }) => {
    await page.goto("/plan/delivery-forecast");

    const contextBar = page.getByTestId("global-context-bar");
    await expect(contextBar).toBeVisible();
    await expect(contextBar).toHaveAttribute("aria-label", "Global context");
  });
});
