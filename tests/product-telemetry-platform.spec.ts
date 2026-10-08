import { expect, test } from "@playwright/test";

const shotDir = process.env.TELEMETRY_SHOT_DIR;
const theme = process.env.TELEMETRY_SHOT_THEME ?? "dark";

test("platform product telemetry plots the window, names orgs and keeps the shell sticky", async ({
    page,
}) => {
    await page.addInitScript((value) => {
        try {
            window.localStorage.setItem("theme", value);
        } catch {
            /* storage unavailable */
        }
    }, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/superadmin/product-telemetry?startDate=2026-09-08&endDate=2026-10-08");

    await expect(page.getByRole("heading", { name: "Product telemetry" })).toBeVisible();

    // Item 2: an org without a served name reads Unresolved, never a hash.
    await expect(page.getByText("Unresolved")).toBeVisible();
    await expect(page.getByText("hash-unnamed")).toHaveCount(0);

    // Item 5: the tile names the day it counts.
    await expect(
        page.getByText("Distinct anonymous users on 2026-10-02, the latest day with events"),
    ).toBeVisible();

    // Item 4: an empty kind names its event.
    await expect(page.getByText("No feature_viewed events recorded in this window.")).toBeVisible();

    // Item 1: the axis spans the window, not the two served days.
    const chart = page.locator("section", { hasText: "Distinct anonymous users per day" });
    await expect(chart.locator("canvas, svg").first()).toBeVisible();
    await expect(chart.getByText("2026-09-08").first()).toBeVisible();

    // Item 3: scrolled inside a real viewport the sticky top bar and sidebar stay at the viewport top.
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(300);
    const topBar = page.getByTestId("shell-top-bar");
    const sidebar = page.getByTestId("shell-sidebar");
    expect((await topBar.boundingBox())?.y).toBe(0);
    expect((await sidebar.boundingBox())?.y).toBe(0);

    if (shotDir) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${shotDir}/telemetry-${theme}-viewport.png` });
        await page.screenshot({
            path: `${shotDir}/telemetry-${theme}-fullpage.png`,
            fullPage: true,
        });
    }
});
