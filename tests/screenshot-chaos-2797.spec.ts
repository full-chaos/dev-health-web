/**
 * CHAOS-2797 screenshot spec.
 *
 * Captures the reorganized sync config form (Identity / Credential /
 * Repository & source scope / Datasets & sync targets / Initial depth /
 * Schedule / Advanced options) in both create (new) and edit modes, plus the
 * edit-mode immutable-field + destructive-change-warning affordances.
 *
 * Runs under the "authenticated" project (auth state from auth.setup.ts),
 * test-mode (mocked backend). Delete this file after PR is merged.
 */
import { test } from "@playwright/test";

test.describe("CHAOS-2797 screenshots", () => {
    test("new sync config form shows reorganized sections", async ({ page }) => {
        await page.goto("/org/admin/sync/new");
        await page.waitForSelector("#name", { timeout: 10000 });
        await page.getByText("Datasets & sync targets").waitFor({ timeout: 10000 });
        await page.screenshot({
            path: "output/chaos-2797/chaos-2797-new-config-form-after.png",
            fullPage: true,
        });
    });

    test("edit sync config form shows immutable fields and locked identity", async ({ page }) => {
        await page.goto("/org/admin/sync/sync-config-edit-repos/edit");
        await page.getByText("Editable Repos").first().waitFor({ timeout: 10000 });
        await page.getByText("🔒 locked").first().waitFor({ timeout: 10000 });
        await page.screenshot({
            path: "output/chaos-2797/chaos-2797-edit-config-form-after.png",
            fullPage: true,
        });
    });

    test("edit sync config form surfaces a destructive dataset-removal warning", async ({
        page,
    }) => {
        await page.goto("/org/admin/sync/sync-config-edit-repos/edit");
        await page.getByText("Editable Repos").first().waitFor({ timeout: 10000 });

        // "Editable Repos" is seeded with sync_targets: ["git"]; enable another
        // dataset then remove "Git Data" to trigger the destructive warning.
        const gitCheckbox = page.getByLabel("Git Data (Commits, Branches)");
        await gitCheckbox.uncheck();
        await page
            .getByRole("alert")
            .filter({ hasText: "Removing dataset" })
            .waitFor({ timeout: 10000 });

        await page.screenshot({
            path: "output/chaos-2797/chaos-2797-edit-destructive-warning-after.png",
            fullPage: true,
        });
    });
});
