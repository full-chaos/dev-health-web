import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:8001";

/** A real treemap: ask-dev's fixture from acr's real selector, with the flag on. */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/investment-treemap.json",
        ),
        "utf8",
    ),
) as Record<string, unknown>;

const TITLE = "Effort share by theme";

async function axeViolations(page: Page, selector: string): Promise<string[]> {
    await page.evaluate(readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
    return page.evaluate(async (target) => {
        const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
        const node = document.querySelector(target);
        if (!node) return ["target not found"];
        const result = await axe.run(node);
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
    }, selector);
}

async function seed(page: Page) {
    await page.addInitScript(
        ([key, value]) => {
            window.sessionStorage.setItem(key, value);
        },
        ["ask-dev:test-mode-answer", JSON.stringify(answer)] as const,
    );
}

async function expectTreemap(scope: Locator) {
    const figure = scope.locator("figure", { hasText: TITLE });
    await expect(figure.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(figure.getByTestId("rich-shape-not-shown")).toHaveCount(0);
    // The value table stays the chart's accessible form, out of sight.
    await expect(figure.getByRole("table")).toHaveCount(1);
    await expect(figure.locator(".sr-only table")).toHaveCount(1);
    await expect(figure.locator(".sr-only table")).toContainText("Risk / Security");
    // The treemap replaces the fallback chart for that fact.
    await expect(scope.locator(".fact-chart__svg")).toHaveCount(0);
    return figure;
}

test.describe("a served treemap draws in web (CHAOS-12496)", () => {
    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "provisioned" } });
    });

    test("the panel and /dev draw web's chart, with the value table as its accessible form", async ({
        page,
    }, testInfo) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await seed(page);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(panel.getByRole("article", { name: "Answer" })).toBeVisible();
        const inPanel = await expectTreemap(panel);
        await inPanel.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(900);
        await page.screenshot({ path: testInfo.outputPath("treemap-panel.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);

        await page.getByRole("button", { name: "Open full page" }).click();
        await expect(page).toHaveURL(/\/dev/u);
        const article = page.getByRole("article", { name: "Answer" });
        await expect(article).toBeVisible();
        const onPage = await expectTreemap(article);
        await onPage.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(900);
        await page.screenshot({ path: testInfo.outputPath("treemap-dev.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-page]")).toEqual([]);
    });
});
