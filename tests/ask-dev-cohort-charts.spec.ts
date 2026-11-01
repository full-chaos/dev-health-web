import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

import { kiacRanking, seedRanking } from "./fixtures/ask-dev/cohortFixtures";

// CHAOS-11943: the cohort charts (attention bars, driver stack) in the ranking panel of the real
// Ask Dev panel, drawn as SVG by the ask-dev render, from scrubbed captures (kiac repository ranking; public seed
// corpus). The panel's test-mode answer source reads the answer from session storage.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const KEY = "ask-dev:test-mode-answer";

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seed(page: Page, answer: unknown, theme?: "light" | "dark"): Promise<void> {
    await page.addInitScript(
        ([key, value, mode]) => {
            window.sessionStorage.setItem(key, value);
            if (mode) window.localStorage.setItem("theme", mode);
        },
        [KEY, JSON.stringify(answer), theme ?? ""] as const,
    );
}

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

async function openPanel(page: Page, mobile = false): Promise<Locator> {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    return mobile
        ? page.getByRole("dialog", { name: "Ask Dev" })
        : page.getByRole("complementary", { name: "Ask Dev" });
}

const ATTENTION = "Attention score by repository";
const STACK = "Score contribution by driver, per repository";

/**
 * The structural checks that stand in for the removed screenshot baselines: both charts are drawn as
 * SVG with a text alternative, every series and label is shown, and the SVG has a real box.
 */
async function expectBothChartsDrawn(root: Locator): Promise<{ bars: Locator; stack: Locator }> {
    const ranking = root.getByRole("group", { name: /^Ranked repositor(y|ie)s$/u });
    await expect(ranking.getByRole("figure")).toHaveCount(2);
    const bars = ranking.getByRole("figure", { name: ATTENTION, exact: true });
    const stack = ranking.getByRole("figure", { name: STACK, exact: true });

    // Attention bars: one mark and one printed value per repository, the repository named on the axis.
    const barsSvg = bars.getByRole("img", { name: `${ATTENTION}: attention score by repository` });
    await expect(barsSvg).toBeVisible();
    await expect(barsSvg.getByRole("img", { name: /, Attention score: \d/u })).toHaveCount(4);
    await expect(barsSvg.locator("text.fact-chart__value-label")).toHaveCount(4);
    await expect(barsSvg.locator("path")).toHaveCount(4);
    for (const name of ["full-chaos/ask-dev", "full-chaos/dev-he…"])
        await expect(
            barsSvg.locator("text.fact-chart__axis-label", { hasText: name }).first(),
        ).toBeVisible();

    // Driver stack: two series in the legend, a segment for each (repository, driver), and no total.
    const stackSvg = stack.getByRole("img", { name: `${STACK}: points contributed by repository` });
    await expect(stackSvg).toBeVisible();
    const legend = stack.getByTestId("render-shape-legend");
    await expect(legend).toContainText("Health.compounding risk");
    await expect(legend).toContainText("Investment mix");
    await expect(stackSvg.getByRole("img", { name: /points contributed$/u })).toHaveCount(8);
    await expect(stackSvg.locator("path")).toHaveCount(8);
    await expect(stackSvg.locator("text.fact-chart__value-label")).toHaveCount(0);

    // Every chart has a real size and a drawn mark with a resolved colour in the current theme.
    for (const svg of [barsSvg, stackSvg]) {
        const box = await svg.boundingBox();
        expect(box!.width).toBeGreaterThan(200);
        expect(box!.height).toBeGreaterThan(100);
        const fill = await svg
            .locator("path")
            .first()
            .evaluate((node) => getComputedStyle(node).fill);
        expect(fill).toMatch(/^(rgb|color|oklch|lab|hsl)/u);
    }

    // The same numbers are reachable as a table: one row per repository.
    await expect(bars.getByRole("table", { name: ATTENTION }).locator("tbody tr")).toHaveCount(4);
    await expect(stack.getByRole("table", { name: STACK }).locator("tbody tr")).toHaveCount(4);
    return { bars, stack };
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    for (const theme of ["dark", "light"] as const) {
        test(`draws the attention bars and the driver stack above the ranking table (${theme})`, async ({
            page,
        }, testInfo) => {
            await seed(page, kiacRanking(), theme);
            const panel = await openPanel(page);
            const { bars, stack } = await expectBothChartsDrawn(panel);
            // No total is shown for the stack: its table lists each driver's points and nothing else.
            await expect(
                stack.getByRole("table", { name: STACK }).getByRole("columnheader"),
            ).toHaveText(["repository", "Health.compounding risk", "Investment mix"]);
            await expect(panel.getByText(/charts? (was|were) withheld/u)).toHaveCount(0);
            // Both charts come before the ranking table they explain.
            const table = panel.getByRole("group", { name: "Ranking" });
            const stackBox = await stack.boundingBox();
            const tableBox = await table.boundingBox();
            expect(stackBox!.y).toBeLessThan(tableBox!.y);
            expect((await bars.boundingBox())!.y).toBeLessThan(stackBox!.y);
            await bars.scrollIntoViewIfNeeded();
            await panel.screenshot({
                path: testInfo.outputPath(`cohort-charts-desktop-${theme}.png`),
            });
            expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        });
    }

    test("seed (F13): the coverage caption names the ranked teams with no score", async ({
        page,
    }, testInfo) => {
        await seed(page, seedRanking());
        const panel = await openPanel(page);
        const ranking = panel.getByRole("group", { name: "Ranked teams" });
        await expect(ranking.getByRole("figure")).toHaveCount(2);
        const captions = ranking.getByTestId("cohort-chart-caption");
        await expect(captions).not.toHaveCount(0);
        for (const caption of await captions.all())
            await expect(caption).toHaveText("2 ranked members have no score.");
        await ranking.scrollIntoViewIfNeeded();
        await panel.screenshot({ path: testInfo.outputPath("cohort-charts-seed.png") });
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("draws both cohort charts in the sheet", async ({ page }, testInfo) => {
        await seed(page, kiacRanking());
        const sheet = await openPanel(page, true);
        const { bars } = await expectBothChartsDrawn(sheet);
        await bars.scrollIntoViewIfNeeded();
        await sheet.screenshot({ path: testInfo.outputPath("cohort-charts-mobile.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
    });

    test("no sideways scroll in the sheet", async ({ page }) => {
        await seed(page, kiacRanking());
        const sheet = await openPanel(page, true);
        await expectBothChartsDrawn(sheet);
        const answer = sheet.getByRole("article", { name: "Answer" });
        for (const box of [answer, sheet])
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});

// The Linux-only screenshot baselines showed the old ECharts render and cannot be made again; these
// run on every platform and keep what they protected: both charts drawn with their series, labels and
// text alternative, in each theme and at each width.
test.describe("chart structure in each theme and width (replaces the visual baselines)", () => {
    for (const [name, viewport, theme] of [
        ["desktop-dark", { width: 1280, height: 900 }, "dark"],
        ["desktop-light", { width: 1280, height: 900 }, "light"],
        ["mobile-dark", { width: 375, height: 812 }, "dark"],
    ] as const) {
        test(`cohort charts ${name}`, async ({ page }) => {
            await page.setViewportSize(viewport);
            await page.emulateMedia({ reducedMotion: "reduce" });
            await seed(page, kiacRanking(), theme);
            const root = await openPanel(page, viewport.width < 768);
            const { bars, stack } = await expectBothChartsDrawn(root);
            await bars.scrollIntoViewIfNeeded();
            // A chart never overflows its figure: the SVG stays inside the width of the panel or sheet.
            const rootBox = (await root.boundingBox())!;
            for (const figure of [bars, stack]) {
                const box = (await figure.boundingBox())!;
                expect(box.x + box.width).toBeLessThanOrEqual(rootBox.x + rootBox.width + 1);
            }
        });
    }
});
