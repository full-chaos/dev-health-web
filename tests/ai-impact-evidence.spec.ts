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

// team-paginated: 30 mock rows unfiltered (2 pages at PAGE_SIZE 25), standard
// 3-row set once a workType filter is applied — see tests/mocks/aiSample.ts.
const paginatedFilter = encodeFilter({
    ...defaultMetricFilter,
    scope: { level: "team", ids: ["team-paginated"] },
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

    test("selecting a PR opens its Work Graph evidence in the shared evidence drawer", async ({
        page,
    }) => {
        await page.goto(`/ai/impact/evidence?f=${populatedFilter}`);

        const list = page.getByTestId("ai-impact-evidence-list");
        const drawer = page.getByRole("dialog", { name: "Evidence & Context" });
        // No inline panel and no drawer until a row is selected.
        await expect(list.getByTestId("ai-work-graph-evidence")).toHaveCount(0);
        await expect(drawer).toHaveCount(0);

        await list.getByTestId("ai-impact-evidence-row").first().click();
        await expect(drawer.getByTestId("evidence-subject")).toContainText(
            "Work Graph evidence · PR #",
        );
        await expect(drawer.getByTestId("ai-drilldown-evidence")).toBeVisible();
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

    test("filter change resets pagination to page 1 instead of a stale sparse page", async ({
        page,
    }) => {
        await page.goto(`/ai/impact/evidence?f=${paginatedFilter}`);

        const list = page.getByTestId("ai-impact-evidence-list");
        await expect(list.getByTestId("ai-impact-evidence-row")).toHaveCount(25);

        // Paginate to page 2 (rows 26–30 of the wide-window result set).
        await list.getByRole("button", { name: "Next" }).click();
        await expect(list.getByTestId("ai-impact-evidence-row")).toHaveCount(5);

        // Narrow the scope through the Work filter, which is in the Filters
        // drawer of the scope bar — a CLIENT-side navigation (router.replace), so
        // the list component instance survives with its local pagination state.
        // The filtered set has only 3 rows; a stale offset of 25 would render the
        // sparse-page failure state. The list must reset to page 1 and show the
        // rows instead.
        await page
            .getByTestId("scope-bar")
            .getByRole("button", { name: /^Filters/ })
            .click();
        const filters = page.getByRole("dialog", { name: "Filters" });
        await filters.getByRole("button", { name: /^Work/ }).click();
        await filters.getByRole("radio", { name: "feature" }).check();
        // Escape closes the open menu, then the drawer.
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(filters).toBeHidden();

        await expect(list.getByTestId("ai-impact-evidence-row")).toHaveCount(3);
        await expect(list.getByTestId("ai-impact-evidence-sparse-page")).toHaveCount(0);
    });
});
