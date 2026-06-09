import { test, expect } from "@playwright/test";

import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { encodeFilter } from "../src/lib/filters/encode";

/**
 * CHAOS-2196: AI Impact PR-evidence drilldown route.
 *
 * The MSW handler keys UX mode off `scope.teamId` (team-missing → unavailable,
 * team-empty → connected-but-zero, default → populated).
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

const emptyFilter = encodeFilter({
    ...defaultMetricFilter,
    scope: { level: "team", ids: ["team-empty"] },
    time: { range_days: 30, compare_days: 30 },
});

test.describe("AI Impact PR evidence", () => {
    test("populated state lists attributed PRs with provenance badges", async ({ page }) => {
        await page.goto(`/ai/impact/evidence?f=${populatedFilter}`);

        await expect(page.getByRole("heading", { name: "PR Evidence", exact: true })).toBeVisible();
        const list = page.getByTestId("ai-impact-evidence-list");
        await expect(list).toBeVisible();

        const rows = list.getByTestId("ai-impact-evidence-row");
        await expect(rows).toHaveCount(3);
        await expect(list.getByTestId("ai-attribution-badge").first()).toBeVisible();
        await expect(list.getByTestId("ai-impact-evidence-count")).toHaveText(
            /3 AI-attributed PRs/,
        );
    });

    test("selecting a PR loads Work Graph evidence", async ({ page }) => {
        await page.goto(`/ai/impact/evidence?f=${populatedFilter}`);

        const list = page.getByTestId("ai-impact-evidence-list");
        await expect(list.getByTestId("ai-drilldown-evidence-prompt")).toBeVisible();

        await list.getByTestId("ai-impact-evidence-row").first().click();
        await expect(list.getByTestId("ai-drilldown-evidence")).toBeVisible();
    });

    test("has a single return path back to Impact", async ({ page }) => {
        await page.goto(`/ai/impact/evidence?f=${populatedFilter}`);

        const back = page.getByRole("link", { name: "Back to Impact" });
        await expect(back).toBeVisible();
        await expect(back).toHaveAttribute("href", /\/ai\/impact\?/);
    });

    test("missing-data state shows honest unavailable messaging", async ({ page }) => {
        await page.goto(`/ai/impact/evidence?f=${missingDataFilter}`);

        await expect(page.getByText("AI attribution data has not populated yet")).toBeVisible();
    });

    test("connected-but-zero state stays distinct from unavailable", async ({ page }) => {
        await page.goto(`/ai/impact/evidence?f=${emptyFilter}`);

        await expect(page.getByText("No AI-attributed PRs in this range")).toBeVisible();
    });
});
