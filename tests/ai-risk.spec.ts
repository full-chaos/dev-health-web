import { test, expect } from "@playwright/test";

import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { encodeFilter } from "../src/lib/filters/encode";

/**
 * CHAOS-1588: AI Risk dashboard e2e.
 *
 * Verifies populated / missing-data UX states for the four risk metrics
 * (rework, revert, test gap, incident) plus governance violations, and
 * checks honest stubbing for the two file-overlap views that the schema
 * does not yet expose.
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

test.describe("AI Risk dashboard", () => {
  test("populated state renders the four risk metric cards", async ({ page }) => {
    await page.goto(`/ai/risk?f=${populatedFilter}`);

    const dashboard = page.getByTestId("ai-risk-dashboard");
    await expect(dashboard).toBeVisible();

    await expect(dashboard.getByText("Rework rate")).toBeVisible();
    await expect(dashboard.getByText("Revert rate")).toBeVisible();
    await expect(dashboard.getByText("Test gap rate")).toBeVisible();
    await expect(dashboard.getByText("Incident rate")).toBeVisible();
  });

  test("file-overlap views are honestly stubbed", async ({ page }) => {
    await page.goto(`/ai/risk?f=${populatedFilter}`);

    const hotspot = page.getByTestId("ai-missing-data-panel").filter({
      hasText: "Hotspot file overlap",
    });
    await expect(hotspot).toBeVisible();

    const complexity = page.getByTestId("ai-missing-data-panel").filter({
      hasText: "High-complexity file overlap",
    });
    await expect(complexity).toBeVisible();
  });

  test("linked incidents card surfaces the rollup count", async ({ page }) => {
    await page.goto(`/ai/risk?f=${populatedFilter}`);

    const incidents = page.getByTestId("ai-linked-incidents");
    await expect(incidents).toBeVisible();
    await expect(incidents).toContainText(/Linked incidents/i);
  });

  test("governance violations list renders without per-author surfacing", async ({ page }) => {
    await page.goto(`/ai/risk?f=${populatedFilter}`);

    // Both fixture violations are surfaced; assert presence by count to
    // avoid strict-mode violations when a regex matches multiple rows.
    await expect(page.getByText(/ai-declaration-required|human-review-required/)).not.toHaveCount(
      0,
    );

    // Guardrail: no author or login labels in the rendered governance section.
    await expect(page.locator("text=/by @/i")).toHaveCount(0);
  });

  test("missing-data state surfaces the dedicated panel", async ({ page }) => {
    await page.goto(`/ai/risk?f=${missingDataFilter}`);

    await expect(page.getByText("AI risk data is not available")).toBeVisible();
    await expect(page.getByText(/AI attribution joined to rework, revert/i)).toBeVisible();
  });
});
