import { test, expect, type Page } from "@playwright/test";

import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { encodeFilter } from "../src/lib/filters/encode";

/**
 * CHAOS-2197: Test Gaps + Evidence live as tabs inside Governance Risk
 * (/ai/risk?view=…) instead of standalone preview routes. Covers tab
 * navigation, filter-scope survival, and the retired-route redirects.
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

const riskTabStrip = (page: Page) =>
    page.getByRole("navigation", { name: "Governance Risk views" });

test.describe("Governance Risk tabs", () => {
    test("renders the three-tab strip with Overview active by default", async ({ page }) => {
        await page.goto(`/ai/risk?f=${populatedFilter}`);

        const strip = riskTabStrip(page);
        await expect(strip).toBeVisible();
        await expect(strip.getByRole("link", { name: "Overview" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        await expect(strip.getByRole("link", { name: "Test Gaps" })).toBeVisible();
        await expect(strip.getByRole("link", { name: "Evidence" })).toBeVisible();
        await expect(page.getByTestId("ai-risk-dashboard")).toBeVisible();
    });

    test("Test Gaps tab renders the focused test-gap panel", async ({ page }) => {
        await page.goto(`/ai/risk?f=${populatedFilter}`);

        await riskTabStrip(page).getByRole("link", { name: "Test Gaps" }).click();
        await expect(page).toHaveURL(/view=test-gaps/);
        await expect(riskTabStrip(page).getByRole("link", { name: "Test Gaps" })).toHaveAttribute(
            "aria-current",
            "page",
        );

        const panel = page.getByTestId("ai-test-gaps-panel");
        await expect(panel).toBeVisible();
        await expect(panel.getByText("Test gap rate", { exact: true })).toBeVisible();
        await expect(panel.getByText("Baseline test gap rate")).toBeVisible();
        await expect(page.getByTestId("ai-risk-dashboard")).toHaveCount(0);
    });

    test("Evidence tab renders the PR-evidence explorer", async ({ page }) => {
        await page.goto(`/ai/risk?f=${populatedFilter}`);

        await riskTabStrip(page).getByRole("link", { name: "Evidence" }).click();
        await expect(page).toHaveURL(/view=evidence/);

        const panel = page.getByTestId("ai-evidence-panel");
        await expect(panel).toBeVisible();
        await expect(panel.getByTestId("ai-drilldown-search")).toBeVisible();
    });

    test("filter scope survives tab switches", async ({ page }) => {
        await page.goto(`/ai/risk?f=${populatedFilter}`);

        await riskTabStrip(page).getByRole("link", { name: "Test Gaps" }).click();
        await expect(page).toHaveURL(/view=test-gaps/);
        await expect(page).toHaveURL(/[?&]f=/);

        await riskTabStrip(page).getByRole("link", { name: "Overview" }).click();
        await expect(page).toHaveURL(/[?&]f=/);
    });

    test("the retired standalone routes redirect into the tabs", async ({ page }) => {
        await page.goto(`/ai/test-gaps?f=${populatedFilter}`);
        await expect(page).toHaveURL(/\/ai\/risk\?.*view=test-gaps/);
        await expect(page).toHaveURL(/[?&]f=/);
        await expect(page.getByTestId("ai-test-gaps-panel")).toBeVisible();

        await page.goto(`/ai/evidence?f=${populatedFilter}`);
        await expect(page).toHaveURL(/\/ai\/risk\?.*view=evidence/);
        await expect(page.getByTestId("ai-evidence-panel")).toBeVisible();
    });

    test("Evidence tab shows the explicit missing-data panel when the scope has no attribution data", async ({
        page,
    }) => {
        await page.goto(`/ai/risk?view=evidence&f=${missingDataFilter}`);

        const panel = page.getByTestId("ai-evidence-panel");
        await expect(panel).toBeVisible();
        await expect(panel.getByTestId("ai-evidence-unavailable")).toBeVisible();
        await expect(panel.getByTestId("ai-missing-data-panel")).toBeVisible();
        // Unavailable ≠ empty: neither the honest-zero copy nor the search render.
        await expect(panel.getByTestId("ai-drilldown-empty")).toHaveCount(0);
        await expect(panel.getByTestId("ai-drilldown-search")).toHaveCount(0);
    });

    test("an unknown view param falls back to Overview", async ({ page }) => {
        await page.goto(`/ai/risk?view=nonsense&f=${populatedFilter}`);

        await expect(page.getByTestId("ai-risk-dashboard")).toBeVisible();
        await expect(riskTabStrip(page).getByRole("link", { name: "Overview" })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });
});
