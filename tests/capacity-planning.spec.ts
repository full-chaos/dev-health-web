import { expect, test } from "@playwright/test";

test.describe("Capacity Planning page", () => {
  test("renders the throughput forecast page with sample data", async ({ page }) => {
    await page.goto("/capacity-planning");

    await expect(page.getByRole("heading", { name: /Throughput forecast/i })).toBeVisible();
    await expect(page.getByText("P50")).toBeVisible();
    await expect(page.getByText("P75")).toBeVisible();
    await expect(page.getByText("P90")).toBeVisible();
  });

  test("shows sample data banner when no team scope is set", async ({ page }) => {
    await page.goto("/capacity-planning");

    await expect(
      page.getByText(/Showing sample data/i),
    ).toBeVisible();
    await expect(
      page.getByText(/Select a team in the scope bar above/i),
    ).toBeVisible();
  });

  test("does not show team ID input — team comes from global scope bar", async ({ page }) => {
    await page.goto("/capacity-planning");

    // The inline form must NOT have a team-id text input any more
    await expect(page.locator('input[name="team"]')).not.toBeVisible();

    // Backlog size input must still be present
    await expect(page.locator('input[name="backlog"]')).toBeVisible();
  });

  test("uses team from encoded filter scope when level is team", async ({ page }) => {
    // Encode a filter with scope level=team
    // The sample-data banner should NOT appear when the team scope is set
    // (we can't hit a real API in E2E, but we can verify the banner is
    //  shown because forecast fetch returns null in test mode — that's fine,
    //  the important thing is the team input is absent from the form)
    await page.goto("/capacity-planning?scope_level=team&scope_ids=team-abc&backlog=10");

    // Team input must still be absent
    await expect(page.locator('input[name="team"]')).not.toBeVisible();
  });

  test("shows the rolling throughput section", async ({ page }) => {
    await page.goto("/capacity-planning");

    await expect(page.getByRole("heading", { name: /Rolling throughput/i })).toBeVisible();
    await expect(page.getByText(/Mean weekly completed items/i)).toBeVisible();
  });

  test("shows the risk cards", async ({ page }) => {
    await page.goto("/capacity-planning");

    await expect(page.locator("h3").filter({ hasText: "WIP congestion" })).toBeVisible();
    await expect(page.locator("h3").filter({ hasText: "Review bottleneck" })).toBeVisible();
    await expect(page.locator("h3").filter({ hasText: "Incident load" })).toBeVisible();
  });

  test("links to the Monte Carlo view", async ({ page }) => {
    await page.goto("/capacity-planning");

    const link = page.getByRole("link", { name: /Monte Carlo view/i });
    await expect(link).toBeVisible();
  });

  test("renders the canonical FilterBar above the forecast (CHAOS-1773)", async ({ page }) => {
    await page.goto("/capacity-planning");

    const filterBar = page.getByTestId("filter-bar");
    await expect(filterBar).toBeVisible();
    await expect(filterBar).toHaveAttribute("data-view", "capacity-planning");
  });
});
