import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:8001";

/**
 * CHAOS-12820: in the shared `SunburstChart`, two small themes side by side printed their inner-ring
 * labels over each other ("Risk / Security" over "Maintenance / Tech Debt"). The served sunburst of
 * ask-dev's fixture (acr's real `Validate` and encoder, CHAOS-12812) has exactly that case: Risk /
 * Security 0.05 beside Maintenance / Tech Debt 0.1. The labels are read from the chart ECharts DREW
 * (its display list, measured by the browser), and two labels overlap when their rotated boxes do.
 */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/investment-sunburst.json",
        ),
        "utf8",
    ),
) as { render_shapes: Array<{ series: Array<{ key: string; points: Array<{ label: string }> }> }> };
const THEME_WORDS = answer.render_shapes[0]!.series[0]!.points.map((point) => point.label);
const TITLE = "Effort share by theme and subcategory";

type Corner = { readonly x: number; readonly y: number };
type Box = { readonly text: string; readonly corners: readonly Corner[] };

/** The drawn labels whose text is one of `words` (or a cut of one), as rotated boxes in pixels. */
async function drawnLabels(figure: Locator, words: readonly string[]): Promise<Box[] | null> {
    await expect(figure.locator("[data-chart-ready='true']")).toBeVisible({ timeout: 30_000 });
    await figure.page().waitForTimeout(600);
    return figure
        .locator("[_echarts_instance_]")
        .first()
        .evaluate((node, themeWords) => {
            type Rect = { x: number; y: number; width: number; height: number };
            type Element = {
                style?: { text?: string };
                invisible?: boolean;
                ignore?: boolean;
                getBoundingRect: () => Rect;
                getComputedTransform: () => number[] | null;
            };
            type Instance = { getZr: () => { storage: { getDisplayList: () => Element[] } } };
            type Fiber = {
                return: Fiber | null;
                stateNode?: { getEchartsInstance?: () => Instance } | null;
            };
            const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
            let fiber = key ? ((node as unknown as Record<string, Fiber>)[key] ?? null) : null;
            while (fiber && typeof fiber.stateNode?.getEchartsInstance !== "function") {
                fiber = fiber.return;
            }
            const chart = fiber?.stateNode?.getEchartsInstance?.();
            if (!chart) return null;
            // A drawn label is a theme word, or a cut of one that ends in an ellipsis ("…" or the
            // "..." ECharts draws when it truncates).
            const cutOf = (text: string) =>
                text.endsWith("...")
                    ? text.slice(0, -3)
                    : text.endsWith("…")
                      ? text.slice(0, -1)
                      : null;
            const isThemeLabel = (text: string) =>
                themeWords.some((word) => {
                    const cut = cutOf(text);
                    // A cut keeps at least 2 characters of its word: a bare ellipsis is no label.
                    const kept = cut?.trimEnd() ?? "";
                    return text === word || (kept.length >= 2 && word.startsWith(kept));
                });
            return chart
                .getZr()
                .storage.getDisplayList()
                .filter((element) => !element.invisible && !element.ignore)
                .filter((element) => isThemeLabel(element.style?.text ?? ""))
                .map((element) => {
                    const r = element.getBoundingRect();
                    const m = element.getComputedTransform() ?? [1, 0, 0, 1, 0, 0];
                    const at = (x: number, y: number) => ({
                        x: m[0]! * x + m[2]! * y + m[4]!,
                        y: m[1]! * x + m[3]! * y + m[5]!,
                    });
                    return {
                        text: element.style!.text!,
                        corners: [
                            at(r.x, r.y),
                            at(r.x + r.width, r.y),
                            at(r.x + r.width, r.y + r.height),
                            at(r.x, r.y + r.height),
                        ],
                    };
                });
        }, words);
}

/** True when two convex boxes share area (separating-axis test; touching edges do not count). */
function overlap(a: readonly Corner[], b: readonly Corner[]): boolean {
    for (const box of [a, b]) {
        for (let i = 0; i < box.length; i += 1) {
            const p = box[i]!;
            const q = box[(i + 1) % box.length]!;
            const axis = { x: q.y - p.y, y: p.x - q.x };
            const project = (corners: readonly Corner[]) =>
                corners.map((corner) => corner.x * axis.x + corner.y * axis.y);
            const [pa, pb] = [project(a), project(b)];
            if (
                Math.max(...pa) <= Math.min(...pb) + 0.5 ||
                Math.max(...pb) <= Math.min(...pa) + 0.5
            ) {
                return false;
            }
        }
    }
    return true;
}

function expectNoOverlap(labels: Box[] | null) {
    expect(labels, "the chart instance was found").not.toBeNull();
    // A measurement that did not happen must fail: at least the three large themes are labelled.
    expect(labels!.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < labels!.length; i += 1) {
        for (let j = i + 1; j < labels!.length; j += 1) {
            expect(
                overlap(labels![i]!.corners, labels![j]!.corners),
                `"${labels![i]!.text}" overlaps "${labels![j]!.text}"`,
            ).toBe(false);
        }
    }
}

async function seed(page: Page) {
    await page.addInitScript(
        ([key, value]) => {
            window.sessionStorage.setItem(key, value);
        },
        ["ask-dev:test-mode-answer", JSON.stringify(answer)] as const,
    );
}

test.describe("the sunburst's inner-ring labels never overlap (CHAOS-12820)", () => {
    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "provisioned" } });
    });

    for (const [name, width, height] of [
        ["desktop", 1280, 900],
        ["mobile", 390, 844],
    ] as const) {
        test(`in the Ask Dev panel and on /dev (${name})`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height });
            await page.emulateMedia({ reducedMotion: "reduce" });
            await seed(page);
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            const panel = page
                .getByRole("complementary", { name: "Ask Dev" })
                .or(page.getByRole("dialog", { name: "Ask Dev" }));
            const inPanel = panel.locator("figure", { hasText: TITLE });
            const panelLabels = await drawnLabels(inPanel, THEME_WORDS);
            await inPanel.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(400);
            await page.screenshot({ path: testInfo.outputPath(`ring-labels-panel-${name}.png`) });
            expectNoOverlap(panelLabels);

            await page.getByRole("button", { name: "Open full page" }).click();
            await expect(page).toHaveURL(/\/dev/u);
            const onPage = page.getByRole("article", { name: "Answer" }).locator("figure", {
                hasText: TITLE,
            });
            const pageLabels = await drawnLabels(onPage, THEME_WORDS);
            await onPage.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(400);
            await page.screenshot({ path: testInfo.outputPath(`ring-labels-dev-${name}.png`) });
            expectNoOverlap(pageLabels);
        });
    }

    for (const [name, width, height] of [
        ["desktop", 1280, 900],
        ["mobile", 390, 844],
    ] as const) {
        test(`on the investment page, which keeps its own fit (${name})`, async ({
            page,
            request,
        }, testInfo) => {
            // The investment page's own sunburst (InvestmentMixSunburst) reads the same ring-label
            // rule: it must not regress.
            await request.post(`${MOCK}/__test/entitlements`, {
                data: { scenario: "provisioned-investment" },
            });
            await page.setViewportSize({ width, height });
            await page.emulateMedia({ reducedMotion: "reduce" });
            await page.goto("/investment");
            await page.getByRole("radio", { name: "Sunburst" }).click();
            const chart = page.getByTestId("mix-sunburst-state");
            // The mock's five themes, as the page names them.
            const words = ["Feature Delivery", "Maintenance", "Operational", "Quality", "Risk"];
            const labels = await drawnLabels(chart, words);
            await chart.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(400);
            await page.screenshot({
                path: testInfo.outputPath(`ring-labels-investment-${name}.png`),
            });
            expectNoOverlap(labels);
        });
    }
});
