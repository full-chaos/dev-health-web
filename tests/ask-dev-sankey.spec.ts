import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:8001";

/**
 * A verified team repository flow: ask-dev's fixture, built through acr's real vocabulary labels,
 * `Validate` and encoder (CHAOS-12579). No acr producer emits the rule yet (CHAOS-12582).
 */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/repository-flow-sankey.json",
        ),
        "utf8",
    ),
) as Record<string, unknown>;

const TITLE = "Effort by repository and theme";

type Flow = { series: { label: string; points: { label: string }[] }[]; kind: string };
const flow = (answer.render_shapes as Flow[]).find((shape) => shape.kind === "sankey")!;
/** Every node's served word: the themes and the repositories of the fixture's sankey. */
const THEMES = flow.series.map((series) => series.label);
const REPOSITORIES = [
    ...new Set(flow.series.flatMap((series) => series.points.map((p) => p.label))),
];

async function seed(page: Page) {
    await page.addInitScript(
        ([key, value]) => {
            window.sessionStorage.setItem(key, value);
        },
        ["ask-dev:test-mode-answer", JSON.stringify(answer)] as const,
    );
}

async function expectSankey(scope: Locator, narrow: boolean) {
    const figure = scope.locator("figure", { hasText: TITLE });
    await expect(figure.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(figure.getByTestId("rich-shape-not-shown")).toHaveCount(0);
    // The value table stays the chart's accessible form, out of sight.
    await expect(figure.locator(".sr-only table")).toHaveCount(1);
    // At narrow width the chart hides a label that would overlap a larger node's (CHAOS-12872);
    // the value table still names every node, so no word is lost to the reader.
    for (const word of [...THEMES, ...REPOSITORIES]) {
        await expect(figure.locator(".sr-only table")).toContainText(word);
    }
    if (narrow) {
        const width = await figure
            .locator("canvas")
            .first()
            .evaluate((c) => c.clientWidth);
        expect(width, "the chart is drawn at panel or phone width").toBeLessThanOrEqual(330);
    }
    return figure;
}

test.describe("a served team repository flow draws as web's sankey (CHAOS-12581)", () => {
    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "provisioned" } });
    });

    for (const [name, width, height] of [
        ["desktop", 1280, 900],
        ["mobile", 390, 844],
    ] as const) {
        test(`the panel and /dev draw web's sankey (${name})`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height });
            await seed(page);
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            // A side panel on desktop; at phone width the panel opens as a dialog.
            const panel = page
                .getByRole("complementary", { name: "Ask Dev" })
                .or(page.getByRole("dialog", { name: "Ask Dev" }));
            await expect(panel.getByRole("article", { name: "Answer" })).toBeVisible();
            const inPanel = await expectSankey(panel, name === "mobile");
            await inPanel.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`sankey-panel-${name}.png`) });

            await page.getByRole("button", { name: "Open full page" }).click();
            await expect(page).toHaveURL(/\/dev/u);
            const article = page.getByRole("article", { name: "Answer" });
            await expect(article).toBeVisible();
            const onPage = await expectSankey(article, name === "mobile");
            await onPage.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`sankey-dev-${name}.png`) });
        });
    }
});
