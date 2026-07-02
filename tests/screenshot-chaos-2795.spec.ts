/**
 * CHAOS-2795 / CHAOS-2796 screenshot spec.
 *
 * Captures the backfill wizard (range step with a validation error, preview
 * step with the expensive-range warning, gap-driven prefill) opened in place
 * on the config detail page, plus the edit page rendering WITHOUT the legacy
 * backfill block (CHAOS-2795 relocation).
 *
 * Runs under the "authenticated" project (auth state from auth.setup.ts),
 * test-mode (mocked backend). Delete this file after PR is merged.
 */
import { test, expect } from "@playwright/test";

const DETAIL_URL = "/org/admin/sync/sample-sync-config";
const EDIT_URL = "/org/admin/sync/sync-config-edit-repos/edit";
const NAV_TIMEOUT = 30000;

test.describe("CHAOS-2795/2796 screenshots", () => {
    test("wizard step 1 shows a validation error for an invalid range", async ({ page }) => {
        await page.goto(DETAIL_URL);
        await page
            .getByRole("button", { name: "Backfill", exact: true })
            .first()
            .waitFor({ timeout: NAV_TIMEOUT });
        await page.getByRole("button", { name: "Backfill", exact: true }).first().click();

        await page.getByRole("dialog").waitFor({ timeout: NAV_TIMEOUT });
        await page.getByLabel("From", { exact: true }).fill("2026-06-10");
        await page.getByLabel("To", { exact: true }).fill("2026-06-01");
        await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
            "Start date must be before end date.",
        );

        await page.screenshot({
            path: "output/chaos-2795/chaos-2795-wizard-step1-validation-error-after.png",
            fullPage: true,
        });
    });

    test("wizard step 2 preview shows the expensive-range warning and requires confirmation", async ({
        page,
    }) => {
        await page.goto(DETAIL_URL);
        await page
            .getByRole("button", { name: "Backfill", exact: true })
            .first()
            .waitFor({ timeout: NAV_TIMEOUT });
        await page.getByRole("button", { name: "Backfill", exact: true }).first().click();
        await page.getByRole("dialog").waitFor({ timeout: NAV_TIMEOUT });

        await page.getByLabel("From", { exact: true }).fill("2026-01-01");
        await page.getByLabel("To", { exact: true }).fill("2026-12-01");
        await page.getByRole("button", { name: "Continue" }).click();

        await expect(page.getByText("Estimated chunks")).toBeVisible();
        await expect(page.getByRole("dialog").getByRole("alert")).toContainText("more than 180");
        await expect(page.getByRole("button", { name: "Run backfill" })).toBeDisabled();

        await page.screenshot({
            path: "output/chaos-2795/chaos-2796-wizard-step2-expensive-warning-after.png",
            fullPage: true,
        });
    });

    test("gap-driven entry pre-fills the wizard range from the timeline", async ({ page }) => {
        await page.goto(DETAIL_URL);
        const gapButton = page.getByRole("button", { name: "Backfill this gap" }).first();
        await gapButton.waitFor({ timeout: NAV_TIMEOUT });
        await gapButton.scrollIntoViewIfNeeded();
        await gapButton.click();

        await page.getByRole("dialog").waitFor({ timeout: NAV_TIMEOUT });
        const fromValue = await page.getByLabel("From", { exact: true }).inputValue();
        expect(fromValue).not.toBe("");

        await page.screenshot({
            path: "output/chaos-2795/chaos-2796-wizard-gap-prefill-after.png",
            fullPage: true,
        });
    });

    test("edit page no longer renders the backfill block", async ({ page }) => {
        await page.goto(EDIT_URL);
        await page
            .getByText("Update sync configuration settings.")
            .waitFor({ timeout: NAV_TIMEOUT });

        await expect(page.getByText("Run Historical Backfill")).toHaveCount(0);
        await expect(page.locator("#backfill")).toHaveCount(0);

        await page.screenshot({
            path: "output/chaos-2795/chaos-2795-edit-page-no-backfill-after.png",
            fullPage: true,
        });
    });
});
