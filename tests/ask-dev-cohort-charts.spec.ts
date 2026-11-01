import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

import { kiacRanking, seedRanking } from "./fixtures/ask-dev/cohortFixtures";

// CHAOS-11943: the cohort charts (attention bars, driver stack) in the ranking panel of the real
// Ask Dev panel, drawn by real ECharts, from scrubbed captures (kiac repository ranking; public seed
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

async function expectBothChartsDrawn(root: Locator): Promise<Locator> {
    const slot = root.getByTestId("ask-dev-ranking-chart-slot");
    const figures = slot.getByTestId("ask-dev-render-figure");
    await expect(figures).toHaveCount(2);
    for (const figure of await figures.all()) {
        await expect(figure).toHaveAttribute("data-state", "drawn");
        await expect(figure.getByTestId("ask-dev-echart")).toHaveAttribute(
            "data-chart-ready",
            "true",
        );
        await expect(figure.locator("canvas")).toHaveCount(1);
    }
    return slot;
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
            const fallbacks = watchFallbacks(page);
            await seed(page, kiacRanking(), theme);
            const panel = await openPanel(page);
            const slot = await expectBothChartsDrawn(panel);
            const stack = slot.getByTestId("ask-dev-render-figure").nth(1);
            await expect(stack).toHaveAccessibleDescription(/No total is shown\.$/u);
            await stack.getByRole("button", { name: "Show values" }).click();
            await expect(stack.getByRole("table")).toBeVisible();
            await slot.scrollIntoViewIfNeeded();
            await panel.screenshot({
                path: testInfo.outputPath(`cohort-charts-desktop-${theme}.png`),
            });
            expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
            expect(fallbacks).toEqual([]);
        });
    }

    test("seed (F13): the coverage caption names the ranked teams with no score", async ({
        page,
    }, testInfo) => {
        await seed(page, seedRanking());
        const panel = await openPanel(page);
        const slot = await expectBothChartsDrawn(panel);
        for (const figure of await slot.getByTestId("ask-dev-render-figure").all())
            await expect(figure).toHaveAccessibleDescription(/2 ranked teams have no score\./u);
        await slot.scrollIntoViewIfNeeded();
        await panel.screenshot({ path: testInfo.outputPath("cohort-charts-seed.png") });
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("draws both cohort charts in the sheet with no sideways scroll", async ({
        page,
    }, testInfo) => {
        const fallbacks = watchFallbacks(page);
        await seed(page, kiacRanking());
        const sheet = await openPanel(page, true);
        const slot = await expectBothChartsDrawn(sheet);
        await slot.scrollIntoViewIfNeeded();
        await sheet.screenshot({ path: testInfo.outputPath("cohort-charts-mobile.png") });
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
        test(`cohort charts ${name}`, async ({ page }) => {
            await page.setViewportSize(viewport);
            await page.emulateMedia({ reducedMotion: "reduce" });
            await seed(page, kiacRanking(), theme);
            const root = await openPanel(page, viewport.width < 768);
            const slot = await expectBothChartsDrawn(root);
            await slot.scrollIntoViewIfNeeded();
            await expect(slot).toHaveScreenshot(`cohort-${name}.png`, {
                maxDiffPixelRatio: 0.01,
                animations: "disabled",
            });
        });
    }
});
