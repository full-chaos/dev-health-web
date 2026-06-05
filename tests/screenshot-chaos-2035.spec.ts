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
import { test } from "@playwright/test";
import path from "path";

const SCREENSHOTS = path.resolve(__dirname, "../docs/screenshots");

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
        await page.waitForTimeout(1000);
        await page.screenshot({
            path: path.join(SCREENSHOTS, "CHAOS-2035/churn-ownership-evidence.png"),
            fullPage: true,
        });
    });
});
