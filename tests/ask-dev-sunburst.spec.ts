import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:8001";

/**
 * A verified investment sunburst: ask-dev's fixture, built through acr's real vocabulary labels,
 * `Validate` and encoder at the contract commit (CHAOS-12812). No acr producer emits the rule yet
 * (CHAOS-12554).
 */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/investment-sunburst.json",
        ),
        "utf8",
    ),
) as Record<string, unknown>;

const TITLE = "Effort share by theme and subcategory";

async function seed(page: Page) {
    await page.addInitScript(
        ([key, value]) => {
            window.sessionStorage.setItem(key, value);
        },
        ["ask-dev:test-mode-answer", JSON.stringify(answer)] as const,
    );
}

async function expectSunburst(scope: Locator) {
    const figure = scope.locator("figure", { hasText: TITLE });
    await expect(figure.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(figure.getByTestId("rich-shape-not-shown")).toHaveCount(0);
    // The value table stays the chart's accessible form, out of sight.
    await expect(figure.locator(".sr-only table")).toHaveCount(1);
    await expect(figure.locator(".sr-only table")).toContainText("Bugfix");
    return figure;
}

test.describe("a served investment sunburst draws as web's sunburst (CHAOS-12813)", () => {
    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "provisioned" } });
    });

    for (const [name, width, height] of [
        ["desktop", 1280, 900],
        ["mobile", 390, 844],
    ] as const) {
        test(`the panel and /dev draw web's sunburst (${name})`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height });
            // No animation, so a screenshot shows the drawn chart, not a frame of it.
            await page.emulateMedia({ reducedMotion: "reduce" });
            await seed(page);
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            // A side panel on desktop; at phone width the panel opens as a dialog.
            const panel = page
                .getByRole("complementary", { name: "Ask Dev" })
                .or(page.getByRole("dialog", { name: "Ask Dev" }));
            await expect(panel.getByRole("article", { name: "Answer" })).toBeVisible();
            const inPanel = await expectSunburst(panel);
            await inPanel.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`sunburst-panel-${name}.png`) });

            await page.getByRole("button", { name: "Open full page" }).click();
            await expect(page).toHaveURL(/\/dev/u);
            const article = page.getByRole("article", { name: "Answer" });
            await expect(article).toBeVisible();
            const onPage = await expectSunburst(article);
            await onPage.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`sunburst-dev-${name}.png`) });
        });
    }
});
