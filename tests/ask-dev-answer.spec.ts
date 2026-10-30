import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11930: the direct answer, drivers and findings in the real Ask Dev panel, from a real ACR
// answer captured on the kiac stack (`src/components/ask-dev/answer/__tests__/captures/`). The
// panel's test-mode answer source reads it from session storage; nothing is fetched.
const MOCK = "http://127.0.0.1:8001";
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const KEY = "ask-dev:test-mode-answer";

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
const PARTIAL = capture("kiac_project_status_partial.event.json");
const READINESS = capture("kiac_project_readiness_partial.event.json");

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

    test("shows the judgment first, then drivers and findings, with no request", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, PARTIAL);
        const requests: string[] = [];
        page.on("request", (r) => {
            if (/\/api\/ask-dev|agent-context|context-fabric/u.test(r.url()))
                requests.push(r.url());
        });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();

        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const answer = panel.getByTestId("ask-dev-answer");
        await expect(answer).toBeVisible();
        await expect(answer.getByTestId("ask-dev-answer-lead")).toHaveText(
            String(PARTIAL.direct_judgment).trim(),
        );
        await expect(answer.getByTestId("ask-dev-answer-status")).toHaveText("Partial answer");
        await expect(answer.getByTestId("ask-dev-answer-ai-label")).toHaveText("AI-written");
        await expect(answer.getByTestId("ask-dev-answer-driver")).toHaveCount(
            (PARTIAL.drivers as unknown[]).length,
        );
        await page.screenshot({ path: testInfo.outputPath("answer-desktop.png") });
        await panel.screenshot({ path: testInfo.outputPath("answer-desktop-panel.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);

        // The details stay folded until asked for.
        const more = answer.getByTestId("ask-dev-answer-more");
        await expect(more).not.toHaveAttribute("open");
        await more.locator("summary").click();
        await expect(more).toHaveAttribute("open");
        expect(requests).toEqual([]);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("shows the same answer in the sheet, readiness gap under Readiness gaps", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, READINESS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();

        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const answer = sheet.getByTestId("ask-dev-answer");
        await expect(answer).toBeVisible();
        await expect(answer.getByTestId("ask-dev-answer-status")).toHaveText("Partial answer");
        await expect(
            answer
                .getByTestId("ask-dev-answer-readiness-gaps")
                .getByTestId("ask-dev-answer-finding"),
        ).toHaveCount(1);
        await page.screenshot({ path: testInfo.outputPath("answer-mobile.png") });
        await sheet.screenshot({ path: testInfo.outputPath("answer-mobile-sheet.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        // The answer fits the sheet at phone width: nothing in it scrolls sideways.
        for (const box of [answer, sheet]) {
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        }
    });
});

test("shows the empty state when no answer is supplied", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const panel = page.getByRole("complementary", { name: "Ask Dev" });
    await expect(panel.getByText("Your conversation will appear here.")).toBeVisible();
    await expect(panel.getByTestId("ask-dev-answer")).toHaveCount(0);
});
