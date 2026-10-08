import { expect, test } from "@playwright/test";

const FORM_PAGES = ["/org/admin/users/new", "/org/admin/teams/new", "/org/admin/users"];

for (const width of [1280, 1600]) {
    for (const path of FORM_PAGES) {
        test(`${path} tab row spans the page content width at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(path);

            const tabs = page.getByTestId("admin-tabs");
            await expect(tabs).toBeVisible();
            const tabBox = await tabs.boundingBox();
            const mainBox = await page.getByRole("main").boundingBox();
            expect(tabBox).not.toBeNull();
            expect(mainBox).not.toBeNull();
            // The row is as wide as the page header, not the form card (max-w-2xl = 672 px).
            expect(tabBox!.width).toBeGreaterThan(900);

            const tablist = tabs.getByRole("tablist");
            const overflow = await tablist.evaluate((el) => el.scrollWidth - el.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
        });
    }
}

test("active tab stays in view at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/org/admin/users/new");
    const tabs = page.getByTestId("admin-tabs");
    const active = tabs.getByRole("tab", { selected: true });
    await expect(active).toBeVisible();
    await expect
        .poll(async () => {
            const list = await tabs.getByRole("tablist").boundingBox();
            const tab = await active.boundingBox();
            if (!list || !tab) return false;
            return tab.x >= list.x - 1 && tab.x + tab.width <= list.x + list.width + 1;
        })
        .toBe(true);
});
