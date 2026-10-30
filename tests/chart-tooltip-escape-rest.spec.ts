import { test, expect } from "@playwright/test";

const VIEWPORTS = [
    { name: "desktop", width: 1280, height: 900 },
    { name: "mobile", width: 390, height: 844 },
];

for (const id of ["escape-heatmap", "escape-sankey"]) {
    for (const vp of VIEWPORTS) {
        test(`${id} (${vp.name}): hostile name renders as literal text in the tooltip`, async ({
            page,
        }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto("/demo/chart-escape");
            const chart = page.getByTestId(id);
            await chart.scrollIntoViewIfNeeded();
            const canvas = chart.locator("canvas").first();
            await expect(canvas).toBeVisible();
            await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
            const box = (await canvas.boundingBox())!;
            const tip = page.locator("body > div").filter({ hasText: "onerror=alert(1)" }).last();
            // Sweep the plot until a tooltip that names a hostile item shows.
            search: for (let r = 1; r < 8; r++) {
                for (let c = 1; c < 16; c++) {
                    await page.mouse.move(
                        box.x + (box.width * c) / 16,
                        box.y + (box.height * r) / 8,
                    );
                    if (await tip.isVisible().catch(() => false)) break search;
                }
            }
            await expect(tip).toBeVisible();
            await expect(tip).toContainText("<img src=x onerror=alert(1)>");
            await expect(page.locator("body img[src='x']")).toHaveCount(0);
            await expect(page.locator("body a[href^='javascript:']")).toHaveCount(0);
            await page.screenshot({ path: `test-results/${id}-${vp.name}.png` });
        });
    }
}
