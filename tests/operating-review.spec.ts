import { test, expect } from "@playwright/test";
import { encodeFilterParam } from "../src/lib/filters/encode";
import { defaultMetricFilter } from "../src/lib/filters/defaults";

const multiTeamFilter = encodeFilterParam({
  ...defaultMetricFilter,
  scope: { level: "team", ids: ["team-platform", "team-growth"] },
});

test.describe("Operating Review", () => {
  test("renders page header and the All Teams aggregate when no team is pinned", async ({
    page,
  }) => {
    await page.goto("/operating-review");

    // Standard page chrome shared with /investment, /quality.
    await expect(page.getByRole("heading", { name: "Engineering Operating Review" })).toBeVisible();

    // CHAOS-1755: no team in the URL means we request the cross-team
    // aggregate from the backend. The "All Teams" badge is the explicit
    // signal that the rendered payload is org-wide, not single-team.
    await expect(page.getByText(/Showing the cross-team aggregate/)).toBeVisible();

    await expect(page.getByRole("heading", { name: "Recommendations" })).toBeVisible();
  });

  test("renders branded AI Workflow Intelligence section with safe follow-up links", async ({
    page,
  }) => {
    await page.goto("/operating-review?week=2026-05-18");

    const aiSection = page.locator("#ai_workflow_intelligence");
    await expect(
      aiSection.getByRole("heading", { name: "AI Workflow Intelligence" }),
    ).toBeVisible();
    await expect(aiSection).toContainText(/operating patterns, not individual performance/i);
    await expect(aiSection).toContainText("AI-assisted PR ratio");
    await expect(aiSection).toContainText("Review amplification");
    await expect(aiSection).toContainText("AI test gap rate");
    await expect(aiSection.getByRole("link", { name: "Impact" })).toHaveAttribute("href", "/ai");
    await expect(aiSection.getByRole("link", { name: "Review Load" })).toHaveAttribute(
      "href",
      "/ai/review-load",
    );
    await expect(aiSection.getByRole("link", { name: "Risk" })).toHaveAttribute("href", "/ai/risk");
    await expect(aiSection.getByRole("link", { name: "Automations" })).toHaveAttribute(
      "href",
      "/ai/automations",
    );
  });

  test("pinned team in URL switches off the All Teams aggregate", async ({ page }) => {
    // When ?team=X is present the page renders that single team and the
    // All Teams badge is NOT shown — the user is explicitly in control.
    await page.goto("/operating-review?team=team-platform&week=2026-05-18");

    await expect(page.getByRole("heading", { name: "Engineering Operating Review" })).toBeVisible();
    await expect(page.getByText(/Showing the cross-team aggregate/)).toHaveCount(0);
  });

  test("multi-team filter renders one bounded selected-team aggregate", async ({ page }) => {
    await page.goto(`/operating-review?f=${multiTeamFilter}&week=2026-05-18`);

    await expect(page.getByRole("heading", { name: "Engineering Operating Review" })).toBeVisible();
    await expect(page.getByText(/Showing operating review data for/)).toContainText(
      "2 selected teams",
    );
    await expect(page.getByRole("heading", { name: "team-platform" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "team-growth" })).toHaveCount(0);
    await expect(
      page
        .getByRole("heading", { name: "Recommendations" })
        .or(page.getByRole("heading", { name: "No operating review data yet" })),
    ).toBeVisible();
    await expect(page.getByText(/Showing the cross-team aggregate/)).toHaveCount(0);
  });
});
