import { test, expect } from "@playwright/test";

import { encodeAIFilterParam } from "../src/lib/filters/ai";

/**
 * CHAOS-1588: AI Review Load dashboard e2e.
 *
 * Verifies populated / missing-data UX states and surveillance guardrails
 * (reviewer concentration intentionally deferred per CHAOS-1585 anti-
 * surveillance posture).
 */

const populatedFilter = encodeAIFilterParam({
  startDate: "2026-04-20",
  endDate: "2026-05-19",
});

const missingDataFilter = encodeAIFilterParam({
  startDate: "2026-04-20",
  endDate: "2026-05-19",
  teamId: "team-missing",
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
    await expect(dashboard.getByText("Review amplification")).toBeVisible();
  });

  test("reviewer concentration is intentionally deferred without person-level ranking", async ({ page }) => {
    await page.goto(`/ai/review-load?f=${populatedFilter}`);

    // The spec explicitly defers reviewer concentration until aggregate-only
    // distribution ships. The page must render the missing-data card and
    // call out the no-ranking posture.
    const reviewerCard = page.getByTestId("ai-missing-data-panel").filter({
      hasText: "Reviewer concentration",
    });
    await expect(reviewerCard).toBeVisible();
    await expect(reviewerCard).toContainText(/person-level ranking/i);
  });

  test("push-iterations metric is honestly stubbed", async ({ page }) => {
    await page.goto(`/ai/review-load?f=${populatedFilter}`);

    const pushIterCard = page.getByTestId("ai-missing-data-panel").filter({
      hasText: "Push iterations after first review",
    });
    await expect(pushIterCard).toBeVisible();
    await expect(pushIterCard).toContainText(/Not yet instrumented/i);
  });

  test("drill-into-evidence button opens the placeholder dialog", async ({ page }) => {
    await page.goto(`/ai/review-load?f=${populatedFilter}`);

    const dashboard = page.getByTestId("ai-review-load-dashboard");
    await dashboard.getByRole("button", { name: /Drill into evidence/i }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/aiWorkflowDrilldown/);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("missing-data state surfaces the dedicated panel", async ({ page }) => {
    await page.goto(`/ai/review-load?f=${missingDataFilter}`);

    await expect(page.getByText("AI review load data is not available")).toBeVisible();
    await expect(page.getByText(/AI attribution plus review event rollups/i)).toBeVisible();
  });
});
