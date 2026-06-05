/**
 * CHAOS-1742 screenshot spec.
 *
 * Captures full-page screenshots of:
 *  - /bottleneck (authenticated)
 *  - /marketing/vp-engineering (public)
 *  - /marketing/engineering-manager (public)
 *
 * Runs under the "authenticated" project (auth state from auth.setup.ts).
 * Delete this file after PR is merged.
 */
import { test } from "@playwright/test";
import path from "path";

const SCREENSHOTS = path.resolve(__dirname, "../docs/screenshots");

test.describe("CHAOS-1742 screenshots", () => {
    test("bottleneck page (authenticated)", async ({ page }) => {
        await page.goto("/bottleneck");
        // Wait for page content — renders empty state if no backend data
        await page.waitForSelector("main", { timeout: 10000 });
        await page.waitForTimeout(2000);
        await page.screenshot({
            path: path.join(SCREENSHOTS, "CHAOS-1742/bottleneck.png"),
            fullPage: true,
        });
    });

    test("vp-engineering marketing page", async ({ page }) => {
        await page.goto("/marketing/vp-engineering");
        await page.waitForSelector("h1", { timeout: 10000 });
        await page.screenshot({
            path: path.join(SCREENSHOTS, "CHAOS-1647/vp-engineering.png"),
            fullPage: true,
        });
    });

    test("engineering-manager marketing page", async ({ page }) => {
        await page.goto("/marketing/engineering-manager");
        await page.waitForSelector("h1", { timeout: 10000 });
        await page.screenshot({
            path: path.join(SCREENSHOTS, "CHAOS-1647/engineering-manager.png"),
            fullPage: true,
        });
    });
});
