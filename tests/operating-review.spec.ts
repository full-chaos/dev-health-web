import { test, expect } from "@playwright/test";

test.describe("Operating Review", () => {
  test("renders page header and the All Teams aggregate when no team is pinned", async ({
    page,
  }) => {
    await page.goto("/operating-review");

    // Standard page chrome shared with /investment, /quality.
    await expect(
      page.getByRole("heading", { name: "Engineering Operating Review" })
    ).toBeVisible();

    // CHAOS-1755: no team in the URL means we request the cross-team
    // aggregate from the backend. The "All Teams" badge is the explicit
    // signal that the rendered payload is org-wide, not single-team.
    await expect(page.getByText(/Showing the cross-team aggregate/)).toBeVisible();

    // The body lands on either the agenda (when the backend returns data)
    // or the empty-state (when the mock returns nothing). Both are valid
    // terminal states for the aggregate path.
    const agenda = page.getByRole("heading", { name: "Recommendations" });
    const emptyState = page.getByRole("heading", {
      name: "No operating review data yet",
    });
    await expect(agenda.or(emptyState)).toBeVisible();
  });

  test("pinned team in URL switches off the All Teams aggregate", async ({
    page,
  }) => {
    // When ?team=X is present the page renders that single team and the
    // All Teams badge is NOT shown — the user is explicitly in control.
    await page.goto("/operating-review?team=team-platform&week=2026-05-18");

    await expect(
      page.getByRole("heading", { name: "Engineering Operating Review" })
    ).toBeVisible();
    await expect(page.getByText(/Showing the cross-team aggregate/)).toHaveCount(0);
  });
});
