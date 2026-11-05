import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:8001";

/**
 * CHAOS-12707: at phone width the completion forecast figure's day axis printed its dates on top
 * of each other ("Nov 2", "Feb 10, 2027", "May 21, 2027", ...), because the axis runs to the
 * horizon bin. One figure draws on the capacity page and in the Ask Dev slot (CHAOS-12622), so both
 * are checked here at 390 px. The labels are read from the chart ECharts DREW (its display list,
 * measured by the browser), not from a screenshot.
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

type Drawn = {
    readonly lastDay: number;
    readonly labels: ReadonlyArray<{ text: string; left: number; right: number }>;
};

/** The day-axis labels the chart drew, and the last day its curve holds. */
async function drawnDayAxis(figure: Locator): Promise<Drawn | null> {
    await expect(figure.locator("[data-chart-ready='true']")).toBeVisible({ timeout: 30_000 });
    // Let a resize after the first draw settle.
    await figure.page().waitForTimeout(600);
    return figure
        .locator("[_echarts_instance_]")
        .first()
        .evaluate((node) => {
            type Element = {
                type?: string;
                style?: { text?: string };
                getBoundingRect: () => {
                    clone: () => {
                        applyTransform: (m: unknown) => void;
                        x: number;
                        width: number;
                    };
                };
                getComputedTransform: () => unknown;
            };
            type Instance = {
                getOption: () => { series: Array<{ data: Array<[number, number]> }> };
                getZr: () => { storage: { getDisplayList: () => Element[] } };
            };
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
            const data = chart.getOption().series[0]?.data ?? [];
            // A day label is a date: "Nov 2" or "Feb 10, 2027". Marker labels are rich text and
            // the chance axis prints percents, so neither matches.
            const DATE = /^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/u;
            const labels = chart
                .getZr()
                .storage.getDisplayList()
                .filter((element) => DATE.test(element.style?.text ?? ""))
                .map((element) => {
                    const box = element.getBoundingRect().clone();
                    box.applyTransform(element.getComputedTransform());
                    return {
                        text: element.style!.text!,
                        left: box.x,
                        right: box.x + box.width,
                    };
                })
                .sort((a, b) => a.left - b.left);
            return { lastDay: data.at(-1)?.[0] ?? Number.NaN, labels };
        });
}

/** The least free space between two day labels for them not to read as one. */
const MIN_GAP = 4;

/** At least two day labels, and each keeps `MIN_GAP` to the next. */
function expectNoOverlap(drawn: Drawn | null) {
    expect(drawn, "the chart instance was found").not.toBeNull();
    const { labels } = drawn!;
    // A measurement that did not happen must fail: an axis with no labels read is not "no overlap".
    expect(labels.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < labels.length; index += 1) {
        const [before, after] = [labels[index - 1]!, labels[index]!];
        expect(
            after.left,
            `"${before.text}" (ends at ${before.right.toFixed(1)}) crowds "${after.text}" (starts at ${after.left.toFixed(1)})`,
        ).toBeGreaterThanOrEqual(before.right + MIN_GAP);
    }
}

async function seedAnswer(page: Page) {
    await page.addInitScript(
        ([key, value]) => {
            window.sessionStorage.setItem(key, value);
        },
        ["ask-dev:test-mode-answer", JSON.stringify(answer)] as const,
    );
}

test.describe("the completion forecast's day axis at 390 px (CHAOS-12707)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "provisioned" } });
    });

    test.afterEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "unprovisioned" } });
    });

    test("in the Ask Dev panel, no two day labels overlap and the horizon bin stays", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page
            .getByRole("complementary", { name: "Ask Dev" })
            .or(page.getByRole("dialog", { name: "Ask Dev" }));
        const figure = panel.locator("figure", { hasText: "Completion forecast" });
        const drawn = await drawnDayAxis(figure);
        await figure.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(600);
        await page.screenshot({ path: testInfo.outputPath("forecast-axis-panel-390.png") });
        expectNoOverlap(drawn);
        // The horizon bin is the runs that did not finish: it stays on the chart.
        expect(drawn!.lastDay).toBe(365);
    });

    test("on the capacity page, no two day labels overlap and the horizon bin stays", async ({
        page,
        request,
    }, testInfo) => {
        await request.post(`${MOCK}/__test/entitlements`, {
            data: { scenario: "capacity-enabled" },
        });
        await page.goto("/plan/capacity");
        const figure = page.getByTestId("completion-range");
        const drawn = await drawnDayAxis(figure);
        await figure.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(600);
        await page.screenshot({ path: testInfo.outputPath("forecast-axis-page-390.png") });
        expectNoOverlap(drawn);
        expect(drawn!.lastDay).toBe(365);
    });
});
