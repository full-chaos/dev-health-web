/**
 * CHAOS-2798 behavioral coverage for the sync observability UX slice
 * (coverage-first config detail, coverage & gaps timeline, gap-driven backfill
 * wizard, job history) that landed across CHAOS-2791/2792/2793/2795/2796.
 *
 * Runs under the "authenticated" project (auth state from auth.setup.ts),
 * test-mode (DEV_HEALTH_TEST_MODE renders deterministic sample data from
 * src/data/syncCoverageSample.ts regardless of the configId in the URL — see
 * [configId]/page.tsx). No live backend involved.
 *
 * Complements — does NOT duplicate — tests/admin-sync.spec.ts, which already
 * covers the coverage-first job history columns and the create/edit config
 * lifecycle.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

const DETAIL_URL = "/org/admin/sync/sample-sync-config";
const CONFIG_TITLE = "fullchaos/platform-api (sample)";

/** Asserts `first` appears before `second` in DOM order (independent of visual layout). */
async function expectPrecedes(page: Page, first: Locator, second: Locator) {
    const firstHandle = await first.elementHandle();
    const secondHandle = await second.elementHandle();
    expect(firstHandle, "expected first locator to resolve to an element").toBeTruthy();
    expect(secondHandle, "expected second locator to resolve to an element").toBeTruthy();

    const firstPrecedesSecond = await page.evaluate(
        ([a, b]) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
        [firstHandle!, secondHandle!],
    );
    expect(firstPrecedesSecond).toBe(true);
}

function timelineRegion(page: Page): Locator {
    return page.locator("div.rounded-xl", {
        has: page.getByRole("heading", { name: "Coverage & gaps" }),
    });
}

function summaryCard(page: Page): Locator {
    return page.locator("div.rounded-xl", {
        has: page.getByText("Last successful run", { exact: true }),
    });
}

function datasetTable(timeline: Locator, datasetKey: string): Locator {
    return timeline.getByRole("table", { name: `Coverage windows for dataset ${datasetKey}` });
}

test.describe("Journey 1 — coverage-first config detail", () => {
    test("renders the coverage health header before job history, with health badge, last successful run, covered-through, and gap count", async ({
        page,
    }) => {
        await page.goto(DETAIL_URL);
        await expect(page.getByRole("heading", { name: CONFIG_TITLE })).toBeVisible();

        // Default coverage_scenario is "gaps" (DEFAULT_SYNC_COVERAGE_SCENARIO).
        const card = summaryCard(page);
        const healthBadge = card.getByText("Gaps detected");
        await expect(healthBadge).toBeVisible();
        await expect(card.getByText("Last successful run", { exact: true })).toBeVisible();
        await expect(card.getByText("Covered through", { exact: true })).toBeVisible();
        await expect(card.getByText("Gaps", { exact: true })).toBeVisible();
        await expect(card.getByText("2", { exact: true })).toBeVisible();

        const jobHistoryHeading = page.getByRole("heading", { name: "Job History" });
        await expect(jobHistoryHeading).toBeVisible();

        // Coverage-first ordering (CHAOS-2791): the health header renders BEFORE job history.
        await expectPrecedes(page, healthBadge, jobHistoryHeading);
    });

    test("shows gap rows in the coverage & gaps timeline for the default gaps scenario", async ({
        page,
    }) => {
        await page.goto(DETAIL_URL);

        const timeline = timelineRegion(page);
        await expect(timeline).toBeVisible();

        // Sample "gaps" scenario has exactly two gap windows, both on the "git"
        // dataset (see SAMPLE_COVERAGE_GAPS in syncCoverageSample.ts).
        const gapActions = timeline.getByRole("button", { name: "Backfill this gap" });
        await expect(gapActions).toHaveCount(2);

        // All three sample datasets render a block by default.
        await expect(timeline.locator("div.space-y-3.rounded-lg")).toHaveCount(3);
    });

    test("dataset filter narrows the visible timeline rows to the selected dataset", async ({
        page,
    }) => {
        await page.goto(DETAIL_URL);
        const timeline = timelineRegion(page);

        await expect(timeline.locator("div.space-y-3.rounded-lg")).toHaveCount(3);

        await timeline.getByLabel("Dataset").selectOption({ label: "prs" });
        await expect(timeline.locator("div.space-y-3.rounded-lg")).toHaveCount(1);
        await expect(datasetTable(timeline, "prs")).toBeVisible();

        await timeline.getByLabel("Dataset").selectOption({ label: "All datasets" });
        await expect(timeline.locator("div.space-y-3.rounded-lg")).toHaveCount(3);
    });

    test("source filter drops datasets with no rows for the selected source", async ({ page }) => {
        await page.goto(DETAIL_URL);
        const timeline = timelineRegion(page);

        // The "git" dataset's rows are all scoped to fullchaos/platform-api, so
        // filtering to the billing-service source hides it entirely (its
        // filtered row count becomes 0 — see SyncCoverageTimeline's
        // `activeSourceId && rows.length === 0` early-return).
        await timeline.getByLabel("Source").selectOption({ label: "fullchaos/billing-service" });

        const remainingBlocks = timeline.locator("div.space-y-3.rounded-lg");
        await expect(remainingBlocks).toHaveCount(2);
        await expect(datasetTable(timeline, "prs")).toBeVisible();
        await expect(datasetTable(timeline, "cicd")).toBeVisible();

        await timeline.getByLabel("Source").selectOption({ label: "All sources" });
        await expect(timeline.locator("div.space-y-3.rounded-lg")).toHaveCount(3);
    });

    test("insufficient_data scenario shows the legacy notice and never renders literal 'unknown'", async ({
        page,
    }) => {
        await page.goto(`${DETAIL_URL}?coverage_scenario=insufficient_data`);

        await expect(page.getByText("Insufficient data")).toBeVisible();
        await expect(page.getByTestId("coverage-legacy-notice")).toContainText(
            "no planner-tracked sync runs yet",
        );
        await expect(page.getByText("No planner-tracked coverage yet")).toBeVisible();

        await expect(page.getByText(/unknown/i)).toHaveCount(0);
    });

    test("truncated coverage labels the server-owned window and exposes only canonical backfills", async ({
        page,
    }) => {
        await page.goto(`${DETAIL_URL}?coverage_scenario=truncated`);

        await expect(page.getByTestId("coverage-window")).toContainText(
            "Coverage shown: Jun 20, 2026 – Jul 2, 2026",
        );
        await expect(page.getByTestId("coverage-truncation-notice")).toContainText(
            "limited to this coverage window",
        );
        const timeline = timelineRegion(page);
        await expect(timeline.getByTestId("coverage-backfill-windows")).toBeVisible();
        await expect(timeline.getByRole("button", { name: "Backfill this gap" })).toHaveCount(0);
        await expect(
            timeline.getByRole("button", { name: "Backfill Jun 24, 2026 to Jun 26, 2026" }),
        ).toBeVisible();
    });
});

test.describe("Journey 2 — gap-driven backfill flow", () => {
    test("canonical backfill entry prefills the exact server-owned window", async ({ page }) => {
        await page.goto(`${DETAIL_URL}?coverage_scenario=truncated`);
        await page.getByRole("button", { name: "Backfill Jun 24, 2026 to Jun 26, 2026" }).click();

        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-06-24");
        await expect(page.getByLabel("To", { exact: true })).toHaveValue("2026-06-26");
    });

    test("opens the wizard prefilled from a gap, validates the range, previews an estimate, gates an expensive submit, and completes in test mode", async ({
        page,
    }) => {
        await page.goto(DETAIL_URL);
        const timeline = timelineRegion(page);

        // Gap-driven entry: the first "Backfill this gap" button belongs to the
        // git dataset's first gap window (2026-06-24 → 2026-06-26).
        const firstGapAction = timeline.getByRole("button", { name: "Backfill this gap" }).first();
        await expect(firstGapAction).toBeEnabled();
        await firstGapAction.scrollIntoViewIfNeeded();
        await firstGapAction.click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-06-24");
        await expect(page.getByLabel("To", { exact: true })).toHaveValue("2026-06-26");

        // Invalid range: "To" before "From" blocks Continue with an inline error.
        await page.getByLabel("To", { exact: true }).fill("2026-06-20");
        await expect(dialog.getByRole("alert")).toHaveText("Start date must be before end date.");
        await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled();

        // Restore a valid range — the error clears and Continue is enabled.
        await page.getByLabel("To", { exact: true }).fill("2026-06-26");
        await expect(dialog.getByRole("alert")).toHaveCount(0);
        await dialog.getByRole("button", { name: "Continue" }).click();

        // Preview step shows an estimate.
        await expect(dialog.getByText("Estimated chunks")).toBeVisible();
        await expect(dialog.getByText(/\(estimate\)/)).toBeVisible();
        await expect(dialog.getByRole("alert")).toHaveCount(0);

        // Go back and set a >180 day range — the expensive-range warning gates submit.
        await dialog.getByRole("button", { name: /^Back$/ }).click();
        await page.getByLabel("From", { exact: true }).fill("2026-01-01");
        await page.getByLabel("To", { exact: true }).fill("2026-12-01");
        await dialog.getByRole("button", { name: "Continue" }).click();

        await expect(dialog.getByRole("alert")).toContainText("more than 180");
        const submitButton = dialog.getByRole("button", { name: "Run backfill" });
        await expect(submitButton).toBeDisabled();

        await dialog
            .getByRole("checkbox", { name: /understand this is a large backfill/i })
            .check();
        await expect(submitButton).toBeEnabled();

        // Test mode supports a full (no-live-backend) submit path — exercise it.
        await submitButton.click();
        await expect(dialog.getByText(/Backfill started/)).toBeVisible();
        await expect(dialog.getByRole("link", { name: "View run" })).toHaveAttribute(
            "href",
            "/org/admin/sync/sample-sync-config/runs/sample-run-gaps",
        );

        await dialog.getByRole("button", { name: "Done" }).click();
        await expect(dialog).toHaveCount(0);
    });
});

test.describe("Journey 3 — job history", () => {
    function jobTable(page: Page): Locator {
        return page.getByRole("table").filter({ hasText: "Trigger" });
    }

    test("exposes requested/covered range columns and complete/partial/failed badges from sample jobs", async ({
        page,
    }) => {
        await page.goto(DETAIL_URL);
        const table = jobTable(page);

        await expect(table.getByRole("columnheader", { name: "Requested range" })).toBeVisible();
        await expect(table.getByRole("columnheader", { name: "Covered range" })).toBeVisible();

        const rows = table.locator("tbody tr");

        // Row 0 — sample-job-1: 4/4 units completed, 0 failed → "Complete".
        const completeRow = rows.nth(0);
        await expect(
            completeRow.getByRole("cell", { name: "Complete", exact: true }),
        ).toBeVisible();
        await expect(
            completeRow.getByRole("cell", { name: "Jul 2, 2026 → Jul 2, 2026", exact: true }),
        ).toHaveCount(2);

        // Row 2 — sample-job-3: terminal failed run, 0 completed units → "Failed".
        const failedRow = rows.nth(2);
        await expect(failedRow.getByRole("cell", { name: "Failed", exact: true })).toBeVisible();
        await expect(
            failedRow.getByRole("cell", { name: "Jun 20, 2026 → Jul 2, 2026", exact: true }),
        ).toBeVisible();
        await expect(failedRow.getByRole("cell", { name: "—", exact: true })).toHaveCount(1);

        // Rows 4/5 — legacy jobs with no sync_run block: em-dash ranges, plain
        // status badge (never a fabricated complete/partial/gap/failed label).
        const legacySuccessRow = rows.nth(4);
        await expect(
            legacySuccessRow.getByRole("cell", { name: "Success", exact: true }),
        ).toBeVisible();
        await expect(legacySuccessRow.getByRole("cell", { name: "—", exact: true })).toHaveCount(4);

        const legacyFailedRow = rows.nth(5);
        await expect(
            legacyFailedRow.getByRole("cell", { name: "Failed", exact: true }),
        ).toBeVisible();
        await expect(legacyFailedRow.getByRole("cell", { name: "—", exact: true })).toHaveCount(5);
    });

    test("pagination controls reflect the full sample set fitting on a single page", async ({
        page,
    }) => {
        await page.goto(DETAIL_URL);
        const table = jobTable(page);

        // All 6 sample jobs fit within PAGE_SIZE (10), so both controls stay
        // disabled — there is nothing before or after the current page.
        await expect(table.locator("tbody tr")).toHaveCount(6);
        await expect(page.getByText("Showing 1-6", { exact: false })).toBeVisible();
        const historyCard = table.locator("xpath=ancestor::div[contains(@class,'rounded-xl')]");
        await expect(historyCard.getByRole("button", { name: /^Previous$/ })).toBeDisabled();
        await expect(historyCard.getByRole("button", { name: /^Next$/ })).toBeDisabled();
    });
});
