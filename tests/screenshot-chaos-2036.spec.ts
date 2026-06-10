/**
 * CHAOS-2036 screenshot spec.
 *
 * Captures the Opportunities rendering the Evidence panel
 * contract: Evidence (real artifacts only) separated from a Recommended
 * next step slot, and the disabled Evidence affordance for a card with no
 * linked artifacts. Backed by the seeded "Reduce Review Latency" worked
 * example in tests/mocks/handlers.ts.
 *
 * Runs under the "authenticated" project (auth state from auth.setup.ts).
 * Delete this file after PR is merged.
 */
import { test } from "@playwright/test";

test.describe("CHAOS-2036 screenshots", () => {
    test("opportunities evidence panel contract (authenticated)", async ({ page }) => {
        await page.goto("/opportunities");
        await page.waitForSelector("main", { timeout: 10000 });
        await page.getByText("Reduce Review Latency").waitFor({ timeout: 10000 });
        await page.waitForTimeout(1000);
        await page.screenshot({
            path: "docs/screenshots/CHAOS-2036/opportunities.png",
            fullPage: true,
        });
    });
});
