import { test, expect } from "@playwright/test";

import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { encodeFilter } from "../src/lib/filters/encode";

/**
 * CHAOS-1588: AI Review Load dashboard e2e.
 *
 * Verifies populated / missing-data UX states and surveillance guardrails
 * (reviewer concentration is aggregate-only: no names or rankings).
 */

const populatedFilter = encodeFilter({
  ...defaultMetricFilter,
  time: { range_days: 30, compare_days: 30 },
});

const missingDataFilter = encodeFilter({
  ...defaultMetricFilter,
  scope: { level: "team", ids: ["team-missing"] },
  time: { range_days: 30, compare_days: 30 },
});

test.describe("AI Review Load dashboard", () => {
  test("populated state renders review metric cards", async ({ page }) => {
    await page.goto(`/ai/review-load?f=${populatedFilter}`);

    const dashboard = page.getByTestId("ai-review-load-dashboard");
    await expect(dashboard).toBeVisible();

    await expect(dashboard.getByText("Pickup latency")).toBeVisible();
    await expect(dashboard.getByText("Review comments per PR")).toBeVisible();
    await expect(dashboard.getByText("Change request rate")).toBeVisible();
    await expect(dashboard.getByText("Approval friction")).toBeVisible();
    // Disambiguate from "Review amplification trend" heading + daily-trend paragraph.
    await expect(
      dashboard.getByRole("heading", { name: "Review amplification", exact: true }),
    ).toBeVisible();
  });

  test("reviewer concentration renders only aggregate distribution values", async ({ page }) => {
    await page.goto(`/ai/review-load?f=${populatedFilter}`);

    const reviewerCard = page.getByTestId("ai-reviewer-concentration");
    await expect(reviewerCard).toBeVisible();
    await expect(reviewerCard).toContainText(/Aggregate-only/i);
    await expect(reviewerCard).toContainText(/No reviewer names, ranks, or person-level counts/i);
  });

  test("push-iterations metric renders post-first-review signal", async ({ page }) => {
    await page.goto(`/ai/review-load?f=${populatedFilter}`);

    await expect(page.getByText("Push iterations after first review")).toBeVisible();
    await expect(page.getByText(/Average pushes after the first review/i)).toBeVisible();
  });

  test("drill-into-evidence button opens the PR selector modal (CHAOS-1739)", async ({ page }) => {
    await page.goto(`/ai/review-load?f=${populatedFilter}`);

    const dashboard = page.getByTestId("ai-review-load-dashboard");
    await dashboard
      .getByRole("button", { name: /Drill into evidence/i })
      .first()
      .click();

    const dialog = page.getByTestId("ai-drilldown-modal");
    await expect(dialog).toBeVisible();

    // The modal is the real selector now: search input + PR table + evidence
    // prompt. The old placeholder copy that leaked resolver names is gone.
    await expect(dialog.getByRole("heading", { name: "Evidence by pull request" })).toBeVisible();
    await expect(dialog).not.toContainText(/aiWorkflowDrilldown/);
    await expect(dialog).not.toContainText(/fabricat/i);
    await expect(dialog.getByTestId("ai-drilldown-search")).toBeVisible();
    await expect(dialog.getByTestId("ai-drilldown-table")).toBeVisible();
    await expect(dialog.getByTestId("ai-drilldown-evidence-prompt")).toBeVisible();

    await dialog.getByRole("button", { name: /close/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("missing-data state surfaces the dedicated panel", async ({ page }) => {
    await page.goto(`/ai/review-load?f=${missingDataFilter}`);

    await expect(page.getByText("AI review load data is not available")).toBeVisible();
    await expect(page.getByText(/AI attribution plus review event rollups/i)).toBeVisible();
  });
});
