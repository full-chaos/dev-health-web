/**
 * CHAOS-2036 screenshot spec.
 *
 * Captures the Opportunities Focus Cards rendering the Evidence panel
 * contract: Evidence (real artifacts only) separated from a Recommended
 * next step slot, and the disabled Evidence affordance for a card with no
 * linked artifacts. Backed by the seeded "Reduce Review Latency" worked
 * example in tests/mocks/handlers.ts.
 *
 * Runs under the "authenticated" project (auth state from auth.setup.ts).
 * Delete this file after PR is merged.
 */
import { test } from "@playwright/test";
import path from "path";

const SCREENSHOTS = path.resolve(__dirname, "../docs/screenshots");

test.describe("CHAOS-2036 screenshots", () => {
  test("opportunities focus cards (authenticated)", async ({ page }) => {
    await page.goto("/opportunities");
    await page.waitForSelector("main", { timeout: 10000 });
    await page.getByText("Reduce Review Latency").waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "CHAOS-2036/opportunities-focus-cards.png"),
      fullPage: true,
    });
  });
});
