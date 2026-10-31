import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-12157: the quick answer never says "Full answer" unless the answer's completeness is
// complete, and a status ACR corrected is shown as served, with the correction in words. Real kiac
// answers to one question, with ACR's completeness authority off and on
// (`src/components/ask-dev/answer/__tests__/captures/`); nothing is fetched.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const KEY = "ask-dev:test-mode-answer";

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
const KNOB_OFF = capture("kiac_repo_owner_complete.event.json");
const CORRECTED = capture("kiac_repo_owner_status_corrected.event.json");

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seedTurns(page: Page, turns: Record<string, unknown>[]): Promise<void> {
    await page.addInitScript(([key, value]) => window.sessionStorage.setItem(key, value), [
        KEY,
        JSON.stringify(turns),
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

    test("neither the knob-off nor the corrected answer says 'Full answer'", async ({
        page,
    }, testInfo) => {
        await seedTurns(page, [KNOB_OFF, CORRECTED]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const statuses = panel.getByTestId("ask-dev-answer-status");
        await expect(statuses).toHaveCount(2);
        await expect(statuses.nth(0)).toHaveText("Answer, not fully covered");
        await expect(statuses.nth(1)).toHaveText("Partial answer");
        await expect(panel.getByText("Full answer", { exact: true })).toHaveCount(0);
        await expect(panel.getByTestId("ask-dev-answer-correction")).toHaveText(
            // CHAOS-12245: each status by the pill's own label (the answer's completeness is partial).
            "The service lowered this answer from Answer, not fully covered to Partial answer: health was read only in part.",
        );
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: testInfo.outputPath("quick-status-desktop.png") });
        await panel.getByTestId("ask-dev-answer-correction").scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("quick-status-desktop-corrected.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the corrected answer says so in the sheet", async ({ page }, testInfo) => {
        await seedTurns(page, [CORRECTED]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        await expect(sheet.getByTestId("ask-dev-answer-status")).toHaveText("Partial answer");
        await expect(sheet.getByTestId("ask-dev-answer-correction")).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: testInfo.outputPath("quick-status-mobile.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});
