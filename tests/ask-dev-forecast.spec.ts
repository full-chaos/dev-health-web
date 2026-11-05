import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:8001";

/**
 * A verified completion forecast: ask-dev's fixture, a served answer through acr's real field writer,
 * claim attach, summary, selector and encoder (acr 098de0ca, CHAOS-12695).
 */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/forecast-curve.json",
        ),
        "utf8",
    ),
) as Record<string, unknown>;

const TITLE = "Completion forecast";

async function seed(page: Page, served: Record<string, unknown> = answer) {
    await page.addInitScript(
        ([key, value]) => {
            window.sessionStorage.setItem(key, value);
        },
        ["ask-dev:test-mode-answer", JSON.stringify(served)] as const,
    );
}

/** The same served answer with the team's scope count, as acr serves it from #2019 (CHAOS-12726). */
function withScopeCount(scopeCount: number, atLeast?: boolean): Record<string, unknown> {
    const copy = structuredClone(answer) as {
        claimed_facts: Array<{ completion_forecast?: Record<string, unknown> }>;
    };
    const summary = copy.claimed_facts.find(
        (fact) => fact.completion_forecast,
    )!.completion_forecast!;
    summary.scope_count = scopeCount;
    if (atLeast !== undefined) summary.scope_count_at_least = atLeast;
    return copy;
}

async function expectForecast(scope: Locator) {
    const figure = scope.locator("figure", { hasText: TITLE });
    // The capacity page's own figure draws on canvas; ask-dev's "not shown" line is absent.
    await expect(figure.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(figure.getByTestId("rich-shape-not-shown")).toHaveCount(0);
    // The value table stays the chart's accessible form, out of sight: the horizon bin is its last row.
    await expect(figure.locator(".sr-only table")).toHaveCount(1);
    await expect(figure.locator(".sr-only table")).toContainText("365");
    // CHAOS-12714: the stored item target is named as the capacity page names it.
    await expect(figure).toContainText("in which all 40 items were done by that day");
    return figure;
}

test.describe("a served completion forecast draws as the capacity page's figure (CHAOS-12696)", () => {
    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "provisioned" } });
    });

    for (const [name, width, height] of [
        ["desktop", 1280, 900],
        ["mobile", 390, 844],
    ] as const) {
        test(`the panel and /dev draw the capacity page's forecast figure (${name})`, async ({
            page,
        }, testInfo) => {
            await page.setViewportSize({ width, height });
            await seed(page);
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            const panel = page
                .getByRole("complementary", { name: "Ask Dev" })
                .or(page.getByRole("dialog", { name: "Ask Dev" }));
            await expect(panel.getByRole("article", { name: "Answer" })).toBeVisible();
            const inPanel = await expectForecast(panel);
            await inPanel.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`forecast-panel-${name}.png`) });

            await page.getByRole("button", { name: "Open full page" }).click();
            await expect(page).toHaveURL(/\/dev/u);
            const article = page.getByRole("article", { name: "Answer" });
            await expect(article).toBeVisible();
            const onPage = await expectForecast(article);
            await onPage.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`forecast-dev-${name}.png`) });
        });
    }
});

test.describe("a forecast names its work scope and the team's scope count (CHAOS-12726)", () => {
    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "provisioned" } });
    });

    for (const [name, served, text] of [
        ["a team with 14 scopes", withScopeCount(14), "The team has 14 work scopes."],
        ["a read cut short", withScopeCount(14, true), "The team has at least 14 work scopes."],
    ] as const) {
        test(`the note beside the figure: ${name}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width: 1280, height: 900 });
            await seed(page, served);
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            await page.getByRole("button", { name: "Open full page" }).click();
            const article = page.getByRole("article", { name: "Answer" });
            const figure = await expectForecast(article);
            const note = article.getByTestId("forecast-scope-note");
            await expect(note).toContainText("Work scope linear:CHAOS.");
            await expect(note).toContainText(text);
            await figure.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(900);
            await page.screenshot({
                path: testInfo.outputPath(`forecast-scope-note-${name.replaceAll(" ", "-")}.png`),
            });
        });
    }

    test("a forecast with no served count draws no note", async ({ page }) => {
        await seed(page);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        await page.getByRole("button", { name: "Open full page" }).click();
        const article = page.getByRole("article", { name: "Answer" });
        await expectForecast(article);
        await expect(article.getByTestId("forecast-scope-note")).toHaveCount(0);
    });
});
