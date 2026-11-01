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

// CHAOS-11942: the Ask Dev trend charts in the real panel, drawn by real ECharts in a browser,
// from the scrubbed K1 capture (`kiac_project_status_partial`: two `dated_fact_trend` lines with
// uneven dates). The panel's test-mode answer source reads the answer from session storage.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const KEY = "ask-dev:test-mode-answer";
const CHART_READY_TIMEOUT_MS = 5000;

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

/** Console lines of the chart fallbacks: a timeout or an accounting violation must never appear. */
function watchFallbacks(page: Page): string[] {
    const lines: string[] = [];
    page.on("console", (message) => {
        const text = message.text();
        if (
            /ask_dev_chart_ready_timeout|ask_dev_render_accounting_violated|ask_dev_render_withheld/u.test(
                text,
            )
        )
            lines.push(text);
    });
    return lines;
}

async function openPanel(page: Page, mobile = false): Promise<Locator> {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    return mobile
        ? page.getByRole("dialog", { name: "Ask Dev" })
        : page.getByRole("complementary", { name: "Ask Dev" });
}

const slotOf = (root: Locator, claimId: string) =>
    root.locator(`[data-testid="ask-dev-fact-trend-slot"][data-claim-ids~="${claimId}"]`);

async function expectBothTrendsDrawn(root: Locator): Promise<void> {
    for (const claimId of [WORKLOAD, READINESS]) {
        const figure = slotOf(root, claimId).getByTestId("ask-dev-render-figure");
        await expect(figure).toHaveAttribute("data-state", "drawn");
        await expect(figure.getByTestId("ask-dev-echart")).toHaveAttribute(
            "data-chart-ready",
            "true",
        );
        await expect(figure.locator("canvas")).toHaveCount(1);
    }
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
        test(`draws each K1 trend in its own table group by the real finished event (${theme})`, async ({
            page,
        }, testInfo) => {
            const fallbacks = watchFallbacks(page);
            await seed(page, k1(), theme);
            const panel = await openPanel(page);
            await expectBothTrendsDrawn(panel);

            const figure = slotOf(panel, WORKLOAD).getByTestId("ask-dev-render-figure");
            await expect(figure).toHaveAccessibleDescription(
                "Line chart of Backlog size over day: 8 positions, 1 series. Window: Last 30 days.",
            );
            const toggle = figure.getByRole("button", { name: "Show values" });
            await toggle.click();
            await expect(figure.getByRole("button", { name: "Hide values" })).toHaveAttribute(
                "aria-expanded",
                "true",
            );
            await expect(
                figure.getByRole("table", { name: /Backlog size over time/u }),
            ).toBeVisible();

            await figure.scrollIntoViewIfNeeded();
            await panel.screenshot({
                path: testInfo.outputPath(`series-charts-desktop-${theme}.png`),
            });
            expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
            expect(fallbacks).toEqual([]);
        });
    }

    test("reduced motion: animation off, and drawn by finished well before the timeout", async ({
        page,
    }) => {
        const fallbacks = watchFallbacks(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await seed(page, k1());
        const started = Date.now();
        const panel = await openPanel(page);
        await expectBothTrendsDrawn(panel);
        // DRAWN is set only by `finished`; a timeout would have WITHHELD the chart instead.
        expect(Date.now() - started).toBeLessThan(CHART_READY_TIMEOUT_MS);
        for (const chart of await panel.getByTestId("ask-dev-echart").all())
            await expect(chart).toHaveAttribute("data-animation", "off");
        expect(fallbacks).toEqual([]);
    });

    test("multi-series: a gap at a union instant is a dash in the value table, never 0", async ({
        page,
    }, testInfo) => {
        const answer = k1();
        await seed(page, withShapes(answer, [multiSeries(answer), answer.render_shapes![1]!]));
        const panel = await openPanel(page);
        await expectBothTrendsDrawn(panel);
        const figure = slotOf(panel, WORKLOAD).getByTestId("ask-dev-render-figure");
        await figure.getByRole("button", { name: "Show values" }).click();
        const gap = figure.getByRole("cell", { name: "no point" });
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
        await expectBothTrendsDrawn(panel);
        const count = () => page.evaluate(() => document.querySelectorAll("img, script").length);
        const before = await count();
        for (const chart of await panel.getByTestId("ask-dev-echart").all()) {
            await chart.scrollIntoViewIfNeeded();
            await chart.hover();
        }
        for (const button of await panel.getByTestId("ask-dev-shape-values-toggle").all()) {
            await button.focus();
            await button.press("Enter");
        }
        expect(await count()).toBe(before);
        const figure = slotOf(panel, WORKLOAD).getByTestId("ask-dev-render-figure");
        await expect(figure.getByRole("table", { name: HOSTILE[0] })).toBeVisible();
        await expect(figure.getByRole("columnheader", { name: HOSTILE[1] })).toBeVisible();
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("draws both trends in the sheet with no sideways scroll", async ({ page }, testInfo) => {
        const fallbacks = watchFallbacks(page);
        await seed(page, k1());
        const sheet = await openPanel(page, true);
        await expectBothTrendsDrawn(sheet);
        const figure = slotOf(sheet, WORKLOAD).getByTestId("ask-dev-render-figure");
        await figure.scrollIntoViewIfNeeded();
        await sheet.screenshot({ path: testInfo.outputPath("series-charts-mobile.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        const answer = sheet.getByTestId("ask-dev-answer");
        for (const box of [answer, sheet])
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(fallbacks).toEqual([]);
    });
});

// E8 §12.2: screenshot baselines, Linux only (hosted CI); the Mac never writes or compares them.
test.describe("visual baselines (Linux)", () => {
    test.skip(process.platform !== "linux", "E8 §12: VR baselines are Linux-only");

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
            const figure = slotOf(root, WORKLOAD).getByTestId("ask-dev-render-figure");
            await figure.scrollIntoViewIfNeeded();
            await expect(figure).toHaveScreenshot(`trend-${name}.png`, {
                maxDiffPixelRatio: 0.01,
                animations: "disabled",
            });
        });
    }
});
