import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * CHAOS-12841 (E8 AC-6): committed visual-regression baselines of the Ask Dev rich views on /dev,
 * as a reader sees them: web's host charts in ask-dev's slot (treemap, sunburst, sankey, quadrant,
 * completion forecast) and ask-dev's own SVG charts (a trend line, category bars, a fact's chart).
 *
 * Run only through playwright.visual.config.ts, in the mirrored Playwright image (see there). Each
 * answer is ask-dev's served-shape fixture at the pinned ask-dev commit, built through acr's real
 * encoder, so a pin bump that changes a drawing shows here as a pixel diff.
 */
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_VISUAL_MOCK_PORT ?? "8007"}`;
const KEY = "ask-dev:test-mode-answer";
const FIXTURES = "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes";

const fixture = (name: string): unknown =>
    JSON.parse(readFileSync(join(process.cwd(), FIXTURES, `${name}.json`), "utf8"));

type View = {
    /** The baseline's name. */
    readonly name: string;
    /** Where the drawing sits in the answer. */
    readonly locate: (answer: Locator) => Locator;
    /** What proves it is drawn, not loading. */
    readonly drawn: (view: Locator) => Locator;
};

/** Web's chart in ask-dev's slot: the answer's one figure that draws on a canvas. */
const hostChart = (name: string): View => ({
    name,
    locate: (answer) =>
        answer.locator("figure.render-shape", { has: answer.page().locator("canvas") }).first(),
    drawn: (view) => view.locator("canvas").first(),
});

/** ask-dev's own SVG chart: the answer's first figure whose SVG draws this mark. */
const svgChart = (name: string, mark: string): View => ({
    name,
    locate: (answer) =>
        answer
            .locator("figure.render-shape", {
                has: answer.page().locator(`svg[role='img'] ${mark}`),
            })
            .first(),
    drawn: (view) => view.locator(`svg[role='img'] ${mark}`).first(),
});

const SCENARIOS: readonly { readonly fixture: string; readonly views: readonly View[] }[] = [
    { fixture: "investment-treemap", views: [hostChart("treemap")] },
    { fixture: "investment-sunburst", views: [hostChart("sunburst")] },
    { fixture: "repository-flow-sankey", views: [hostChart("sankey")] },
    { fixture: "landscape-quadrant", views: [hostChart("quadrant")] },
    { fixture: "forecast-curve", views: [hostChart("forecast-curve")] },
    {
        fixture: "cadence-missing-day",
        views: [
            svgChart("trend-line", "polyline"),
            {
                name: "fact-chart",
                locate: (answer) => answer.locator("div.fact-chart").first(),
                drawn: (view) => view.locator("svg[role='img']").first(),
            },
        ],
    },
    {
        fixture: "category-order",
        views: [svgChart("category-bars", "g.fact-chart__mark-group path")],
    },
];

const WIDTHS = [
    ["desktop", 1280, 900],
    ["mobile", 390, 844],
] as const;
const THEMES = ["light", "dark"] as const;

async function seed(page: Page, answer: unknown, theme: "light" | "dark"): Promise<void> {
    await page.addInitScript(
        ([key, value, mode]) => {
            window.sessionStorage.setItem(key, value);
            window.localStorage.setItem("theme", mode);
        },
        [KEY, JSON.stringify(answer), theme] as const,
    );
}

/** The answer on /dev, reached the way a reader does: the panel, then "Open full page". */
async function answerOnDev(page: Page): Promise<Locator> {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const panel = page
        .getByRole("complementary", { name: "Ask Dev" })
        .or(page.getByRole("dialog", { name: "Ask Dev" }));
    await expect(panel.getByRole("article", { name: "Answer" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Open full page" }).click();
    await expect(page).toHaveURL(/\/dev/u);
    const answer = page.getByRole("article", { name: "Answer" });
    await expect(answer).toBeVisible({ timeout: 30_000 });
    return answer;
}

test.describe("Ask Dev rich views match their committed baselines (CHAOS-12841)", () => {
    test.beforeEach(async ({ request }) => {
        const response = await request.post(`${MOCK}/__test/entitlements`, {
            data: { scenario: "provisioned" },
        });
        expect(response.ok()).toBe(true);
    });

    for (const scenario of SCENARIOS) {
        for (const [widthName, width, height] of WIDTHS) {
            for (const theme of THEMES) {
                test(`${scenario.fixture} ${widthName} ${theme}`, async ({ page }) => {
                    await page.setViewportSize({ width, height });
                    await page.emulateMedia({
                        reducedMotion: "reduce",
                        colorScheme: theme,
                    });
                    await seed(page, fixture(scenario.fixture), theme);
                    const answer = await answerOnDev(page);
                    for (const view of scenario.views) {
                        const target = view.locate(answer);
                        await expect(view.drawn(target)).toBeVisible({ timeout: 30_000 });
                        // A host chart must be drawn, never the "not shown here" fallback.
                        await expect(target.getByTestId("rich-shape-not-shown")).toHaveCount(0);
                        await target.scrollIntoViewIfNeeded();
                        await expect(target).toHaveScreenshot(
                            `${view.name}-${widthName}-${theme}.png`,
                        );
                    }
                });
            }
        }
    }
});
