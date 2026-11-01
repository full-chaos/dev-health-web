import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

import {
    hostileLine,
    HOSTILE,
    k1,
    multiSeries,
    READINESS,
    withShapes,
    WORKLOAD,
} from "./fixtures/ask-dev/seriesFixtures";

// CHAOS-11942: the Ask Dev trend charts in the real panel, drawn as SVG by the ask-dev render,
// from the scrubbed K1 capture (`kiac_project_status_partial`: two `dated_fact_trend` lines with
// uneven dates). The panel's test-mode answer source reads the answer from session storage.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const KEY = "ask-dev:test-mode-answer";
const DRAWN_TIMEOUT_MS = 5000;

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

// Each trend sits in the panel of the fact it explains, titled "<kind> · <field>".
const PANEL_OF: Record<string, string> = {
    [WORKLOAD]: "workload · backlog size",
    [READINESS]: "readiness · estimated count",
};
const slotOf = (root: Locator, claimId: string) =>
    root.getByRole("region", { name: PANEL_OF[claimId]!, exact: true });
const figureOf = (root: Locator, claimId: string) => slotOf(root, claimId).getByRole("figure");

/**
 * The structural checks that stand in for the removed screenshot baselines: the trend is drawn as an
 * SVG line chart with a text alternative, a mark and a date label for each position, and the same
 * numbers as a table.
 */
async function expectTrendDrawn(figure: Locator, positions: number): Promise<Locator> {
    await expect(figure).toHaveCount(1);
    const svg = figure.getByRole("img").first();
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAccessibleName(/ over day$/u);
    await expect(svg.locator("polyline")).not.toHaveCount(0);
    await expect(svg.locator("circle")).toHaveCount(positions);
    await expect(svg.locator("text.fact-chart__axis-label").first()).toBeVisible();
    const box = await svg.boundingBox();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(100);
    await expect(figure.getByRole("table").locator("tbody tr")).toHaveCount(positions);
    return svg;
}

async function expectBothTrendsDrawn(root: Locator): Promise<void> {
    await expectTrendDrawn(figureOf(root, WORKLOAD), 8);
    await expectTrendDrawn(figureOf(root, READINESS), 64);
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
        test(`draws each K1 trend in its own fact panel with its values table (${theme})`, async ({
            page,
        }, testInfo) => {
            await seed(page, k1(), theme);
            const panel = await openPanel(page);
            await expectBothTrendsDrawn(panel);

            const figure = figureOf(panel, WORKLOAD);
            await expect(figure.getByRole("img").first()).toHaveAccessibleName(
                "Backlog size over time — Synthetic Project Beta: Backlog size over day",
            );
            // The window is stated once for the answer, in its Coverage panel.
            await expect(panel.getByText(/^Evidence window: /u)).toBeVisible();
            // The values table is always there for a reader of the chart, in the order of the dates.
            const table = figure.getByRole("table", { name: /Backlog size over time/u });
            await expect(table.locator("tbody tr").first().getByRole("rowheader")).toHaveText(
                "2026-07-27",
            );
            await expect(table.locator("tbody tr").first().getByRole("cell")).toHaveText("6");
            // Uneven dates are placed by time, not by index: gaps of 7, 8 and 13 days draw wider each time.
            const xs = await figure
                .getByRole("img")
                .first()
                .locator("circle")
                .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("cx"))));
            expect(xs[3]! - xs[2]!).toBeGreaterThan(xs[2]! - xs[1]!);
            expect(xs[4]! - xs[3]!).toBeGreaterThan(xs[3]! - xs[2]!);
            await expect(panel.getByText(/charts? (was|were) withheld/u)).toHaveCount(0);

            await figure.scrollIntoViewIfNeeded();
            await panel.screenshot({
                path: testInfo.outputPath(`series-charts-desktop-${theme}.png`),
            });
            expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        });
    }

    test("reduced motion: nothing animates, and the trends are drawn well before the timeout", async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await seed(page, k1());
        const started = Date.now();
        const panel = await openPanel(page);
        await expectBothTrendsDrawn(panel);
        expect(Date.now() - started).toBeLessThan(DRAWN_TIMEOUT_MS);
        for (const svg of await panel.getByRole("figure").locator("svg[role=img]").all()) {
            if ((await svg.locator("polyline").count()) === 0) continue;
            const names = await svg
                .locator("polyline, circle")
                .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationName));
            expect(new Set(names)).toEqual(new Set(["none"]));
        }
    });

    test("multi-series: a gap at a union instant is a dash in the value table, never 0", async ({
        page,
    }, testInfo) => {
        const answer = k1();
        await seed(page, withShapes(answer, [multiSeries(answer), answer.render_shapes![1]!]));
        const panel = await openPanel(page);
        const figure = figureOf(panel, WORKLOAD);
        const svg = figure.getByRole("img").first();
        await expect(svg).toBeVisible();
        // Two series: both in the legend, 8 + 7 marks, and the line of the second breaks at the gap.
        const legend = figure.getByTestId("render-shape-legend");
        await expect(legend).toContainText("Backlog size");
        await expect(legend).toContainText("Throughput mean");
        await expect(svg.locator("circle")).toHaveCount(15);
        await expect(svg.locator("polyline")).toHaveCount(3);
        const gap = figure.getByRole("table").getByRole("cell", { name: "—", exact: true });
        await expect(gap).toHaveCount(1);
        await expect(gap).toHaveText("—");
        await figure.scrollIntoViewIfNeeded();
        await figure.screenshot({ path: testInfo.outputPath("series-charts-multi-gap.png") });
    });

    test("hostile served strings stay text: no element is created when every chart is hovered and focused", async ({
        page,
    }) => {
        const answer = k1();
        await seed(page, withShapes(answer, [hostileLine(answer), answer.render_shapes![1]!]));
        const panel = await openPanel(page);
        const figure = figureOf(panel, WORKLOAD);
        await expect(figure.getByRole("img").first()).toBeVisible();
        const count = () => page.evaluate(() => document.querySelectorAll("img, script").length);
        const before = await count();
        for (const chart of await panel.getByRole("figure").locator("svg[role=img]").all()) {
            await chart.scrollIntoViewIfNeeded();
            await chart.hover();
            for (const mark of (await chart.locator("[tabindex='0']").all()).slice(0, 6)) {
                await mark.focus();
                await mark.press("Enter");
            }
        }
        expect(await count()).toBe(before);
        await expect(figure.getByRole("table", { name: HOSTILE[0] })).toBeVisible();
        await expect(figure.getByRole("columnheader", { name: HOSTILE[1] })).toBeVisible();
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("draws both trends in the sheet", async ({ page }, testInfo) => {
        await seed(page, k1());
        const sheet = await openPanel(page, true);
        await expectBothTrendsDrawn(sheet);
        const figure = figureOf(sheet, WORKLOAD);
        await figure.scrollIntoViewIfNeeded();
        await sheet.screenshot({ path: testInfo.outputPath("series-charts-mobile.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
    });

    // GAP: a wide table (the 64-row readiness table) is not held in its own scroll box in the sheet; the
    // answer and the conversation scroll sideways instead.
    test.fixme("no sideways scroll in the sheet", async ({ page }) => {
        await seed(page, k1());
        const sheet = await openPanel(page, true);
        await expectBothTrendsDrawn(sheet);
        const answer = sheet.getByRole("article", { name: "Answer" });
        for (const box of [answer, sheet])
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});

// The Linux-only screenshot baselines showed the old ECharts render and cannot be made again; these
// run on every platform and keep what they protected: the trend drawn as a line with a mark and a
// label for each position and a text alternative, in each theme and at each width.
test.describe("trend structure in each theme and width (replaces the visual baselines)", () => {
    for (const [name, viewport, theme] of [
        ["desktop-dark", { width: 1280, height: 900 }, "dark"],
        ["desktop-light", { width: 1280, height: 900 }, "light"],
        ["mobile-dark", { width: 375, height: 812 }, "dark"],
    ] as const) {
        test(`trend figure ${name}`, async ({ page }) => {
            await page.setViewportSize(viewport);
            await page.emulateMedia({ reducedMotion: "reduce" });
            await seed(page, k1(), theme);
            const root = await openPanel(page, viewport.width < 768);
            await expectBothTrendsDrawn(root);
            const figure = figureOf(root, WORKLOAD);
            await figure.scrollIntoViewIfNeeded();
            const svg = figure.getByRole("img").first();
            // Marks and line take a resolved colour in this theme, and the figure fits its container.
            const colours = await svg.evaluate((node) => ({
                stroke: getComputedStyle(node.querySelector("polyline")!).stroke,
                fill: getComputedStyle(node.querySelector("circle")!).fill,
            }));
            expect(colours.stroke).toMatch(/^(rgb|color|oklch|lab|hsl)/u);
            expect(colours.fill).toMatch(/^(rgb|color|oklch|lab|hsl)/u);
            const rootBox = (await root.boundingBox())!;
            const box = (await figure.boundingBox())!;
            expect(box.x + box.width).toBeLessThanOrEqual(rootBox.x + rootBox.width + 1);
        });
    }
});
