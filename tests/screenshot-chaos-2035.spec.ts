/**
 * CHAOS-2035 screenshot spec.
 *
 * Captures the Churn & Ownership (code) page showing the hotspot evidence
 * contract: a default hotspot summary, render-safe typed cell artifacts
 * (file / PR / commit / work-item — no raw paths or UUIDs), and customer-safe
 * ownership copy. Backed by the seeded hotspot heatmap + churn contributors in
 * tests/mocks/handlers.ts.
 *
 * Runs under the "authenticated" project (auth state from auth.setup.ts).
 * Delete this file after PR is merged.
 */
import { expect, test } from "@playwright/test";

test.describe("CHAOS-2035 screenshots", () => {
    test("churn & ownership hotspot evidence (authenticated)", async ({ page }) => {
        await page.goto("/code");
        await page.waitForSelector("main", { timeout: 10000 });
        await page
            .getByRole("heading", { name: "Churn and Ownership" })
            .waitFor({ timeout: 10000 });
        await page
            .getByText(/Leading hotspots:/)
            .first()
            .waitFor({ timeout: 10000 });
        const ownershipCard = page.getByTestId("ownership-patterns-card");
        await expect(ownershipCard).toContainText("Git blame");
        await expect(ownershipCard).not.toContainText("Manual");
        await expect(ownershipCard).toContainText("chrisgeo@users.noreply.github.com");
        await expect(ownershipCard).toContainText("3773 file-change samples");
        await expect(ownershipCard).not.toContainText("Connect a Git provider");
        await page.waitForTimeout(1000);
        await page.screenshot({
            path: "docs/screenshots/CHAOS-2035/churn-ownership-evidence.png",
            fullPage: true,
        });
    });
});
