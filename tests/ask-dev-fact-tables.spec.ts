import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11945: the claimed-fact tables in the real Ask Dev panel, from real ACR answers captured
// on the kiac stack (scrubbed, `tests/fixtures/ask-dev/captures/`). The panel's
// test-mode answer source reads them from session storage; nothing is fetched.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");
const KEY = "ask-dev:test-mode-answer";

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
// Three cited tables (time series and breakdown, a dual-table fact), window "Last 30 days".
const STATUS = capture("kiac_project_status_partial.event.json");
// Breakdown tables and no evidence window: "Window not stated".
const MERGED_PRS = capture("kiac_repo_merged_prs_degraded.event.json");

/** The render's date, in the browser's time zone: the same zone as this process. */
const day = (iso: string): string =>
    new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

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
        // One panel per cited table, titled "<kind> · <field>", each with its subject and row count.
        const workload = panel.getByRole("group", {
            name: "workload · backlog size",
            exact: true,
        });
        const readiness = panel.getByRole("group", {
            name: "readiness · estimated count",
            exact: true,
        });
        const flow = panel.getByRole("group", {
            name: "flow · items completed latest day",
            exact: true,
        });
        // Exact: "Facts in this answer" is the panel for the facts with no rows of their own.
        const tables = panel.getByRole("group", { name: "Facts", exact: true });
        await tables.first().scrollIntoViewIfNeeded();
        await expect(tables).toHaveCount(3);
        await expect(panel.getByTestId("scalar-facts-panel")).toBeVisible();
        await expect(tables.first()).toBeVisible();
        await expect(workload).toContainText("Synthetic Project Beta · 8 rows");
        await expect(readiness).toContainText("Synthetic Project Beta · 64 rows");
        await expect(flow).toContainText("Synthetic Project Beta · 1 row");
        // The window is stated for the answer, in its Coverage panel.
        const window_ = STATUS.effective_evidence_window as { start: string; end: string };
        await expect(
            panel.getByText(`Evidence window: ${day(window_.start)} – ${day(window_.end)}`, {
                exact: false,
            }),
        ).toBeVisible();
        // The dual table declares its own columns, "day" among them.
        const dual = workload.getByRole("group", { name: "Facts" }).getByRole("table");
        await expect(dual.getByRole("columnheader", { name: "day", exact: true })).toBeVisible();
        await expect(dual.getByRole("columnheader")).toHaveText([
            "backlog size",
            "day",
            "throughput mean",
            "throughput stddev",
        ]);
        // A cell the row does not carry is a dash, never a value.
        await expect(tables.getByRole("cell", { name: "—", exact: true }).first()).toHaveText("—");
        // The trend charts sit in the panels of the two time series; the one-row flow panel has none.
        await expect(panel.getByRole("figure")).toHaveCount(2);
        await expect(flow.getByRole("figure")).toHaveCount(0);

        await tables.first().evaluate((node) => node.scrollIntoView({ block: "start" }));
        await panel.screenshot({ path: testInfo.outputPath("fact-tables-desktop.png") });
        await page.screenshot({ path: testInfo.outputPath("fact-tables-desktop-page.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("says 'Evidence window: Not reported'; the tables are in the sheet", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, MERGED_PRS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();

        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const answer = sheet.getByRole("article", { name: "Answer" });
        const tables = answer.getByRole("group", { name: "Facts" });
        await tables.first().scrollIntoViewIfNeeded();
        await expect(answer.getByText("Evidence window: Not reported.")).toBeVisible();
        await expect(tables.first()).toBeVisible();

        await tables.first().evaluate((node) => node.scrollIntoView({ block: "start" }));
        await sheet.screenshot({ path: testInfo.outputPath("fact-tables-mobile.png") });
        await page.screenshot({ path: testInfo.outputPath("fact-tables-mobile-page.png") });
    });

    test("the sheet has no axe violations", async ({ page }) => {
        await seedAnswer(page, MERGED_PRS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        await expect(sheet.getByRole("group", { name: "Facts" }).first()).toBeVisible();
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
    });

    test("wide tables scroll inside their box, not the sheet", async ({ page }) => {
        await seedAnswer(page, MERGED_PRS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const answer = sheet.getByRole("article", { name: "Answer" });
        await expect(answer.getByRole("group", { name: "Facts" }).first()).toBeVisible();
        for (const box of [answer, sheet]) {
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        }
    });
});
