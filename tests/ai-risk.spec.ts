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

    test("file-overlap panels render real data when overlap rows exist (CHAOS-2185)", async ({
        page,
    }) => {
        await page.goto(`/ai/risk?f=${populatedFilter}`);

        // Post ops-#823 the backend emits real overlap rows (and no
        // hotspot/complexity missing-states) for populated scopes.
        const hotspot = page.getByTestId("ai-hotspot-overlap");
        await expect(hotspot).toBeVisible();
        await expect(hotspot).toContainText("59%");
        await expect(hotspot).toContainText("26 of 44 AI-attributed PRs");
        await expect(hotspot).toContainText("top-decile-risk files");

        // Complexity overlap is a computed REAL ZERO in the fixture — it must
        // render as 0%, never as a missing/unavailable panel.
        const complexity = page.getByTestId("ai-complexity-overlap");
        await expect(complexity).toBeVisible();
        await expect(complexity).toContainText("0%");
        await expect(complexity).toContainText("0 of 44 AI-attributed PRs");
    });

    test("file-overlap views stay honestly stubbed when rows are absent", async ({ page }) => {
        const emptyFilter = encodeFilter({
            ...defaultMetricFilter,
            scope: { level: "team", ids: ["team-empty"] },
            time: { range_days: 30, compare_days: 30 },
        });
        await page.goto(`/ai/risk?f=${emptyFilter}`);

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
        await expect(
            page.getByText(/ai-declaration-required|human-review-required/),
        ).not.toHaveCount(0);

        // Guardrail: no author or login labels in the rendered governance section.
        await expect(page.locator("text=/by @/i")).toHaveCount(0);
    });

    test("missing-data state surfaces the dedicated panel", async ({ page }) => {
        await page.goto(`/ai/risk?f=${missingDataFilter}`);

        await expect(page.getByText("AI risk data is not available")).toBeVisible();
        await expect(page.getByText(/AI attribution joined to rework, revert/i)).toBeVisible();
    });
});
