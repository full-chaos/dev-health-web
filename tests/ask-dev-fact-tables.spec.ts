import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11945: the claimed-fact tables in the real Ask Dev panel, from real ACR answers captured
// on the kiac stack (scrubbed, `src/components/ask-dev/answer/__tests__/captures/`). The panel's
// test-mode answer source reads them from session storage; nothing is fetched.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const KEY = "ask-dev:test-mode-answer";

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
// Three cited tables (time series and breakdown, a dual-table fact), window "Last 30 days".
const STATUS = capture("kiac_project_status_partial.event.json");
// Breakdown tables and no evidence window: "Window not stated".
const MERGED_PRS = capture("kiac_repo_merged_prs_degraded.event.json");

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seedAnswer(page: Page, answer: Record<string, unknown>): Promise<void> {
    await page.addInitScript(([key, value]) => window.sessionStorage.setItem(key, value), [
        KEY,
        JSON.stringify(answer),
    ] as const);
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

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("shows each cited table with its window, declared columns and dashes for missing cells", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, STATUS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();

        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const tables = panel.getByTestId("ask-dev-answer-fact-tables");
        await tables.scrollIntoViewIfNeeded();
        await expect(tables).toBeVisible();
        await expect(tables.getByTestId("ask-dev-fact-tables-window")).toHaveText(
            "Window: Last 30 days",
        );
        await expect(tables.getByTestId("ask-dev-fact-table")).toHaveCount(3);
        const workload = tables
            .getByTestId("ask-dev-fact-table")
            .filter({ has: page.locator('th[title="day"]') })
            .first();
        await expect(workload.locator("th").first()).toHaveAttribute("title", "day");
        await expect(tables.getByLabel("not in this row").first()).toHaveText("—");
        await expect(tables.getByTestId("ask-dev-fact-trend-slot")).toHaveCount(3);

        // A long table scrolls inside its own box: no table is taller than the box.
        for (const box of await tables.getByTestId("ask-dev-fact-table-scroll").all()) {
            expect(await box.evaluate((node) => node.clientHeight <= 288)).toBe(true);
        }
        await tables.evaluate((node) => node.scrollIntoView({ block: "start" }));
        await panel.screenshot({ path: testInfo.outputPath("fact-tables-desktop.png") });
        await page.screenshot({ path: testInfo.outputPath("fact-tables-desktop-page.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("says 'Window not stated', and wide tables scroll inside their box, not the sheet", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, MERGED_PRS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();

        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const answer = sheet.getByTestId("ask-dev-answer");
        const tables = answer.getByTestId("ask-dev-answer-fact-tables");
        await tables.scrollIntoViewIfNeeded();
        await expect(tables.getByTestId("ask-dev-fact-tables-window")).toHaveText(
            "Window: Window not stated",
        );
        await expect(tables.getByTestId("ask-dev-fact-table").first()).toBeVisible();

        await tables.evaluate((node) => node.scrollIntoView({ block: "start" }));
        await sheet.screenshot({ path: testInfo.outputPath("fact-tables-mobile.png") });
        await page.screenshot({ path: testInfo.outputPath("fact-tables-mobile-page.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        for (const box of [answer, sheet]) {
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        }
    });
});
