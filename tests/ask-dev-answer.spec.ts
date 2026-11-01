import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11930: the direct answer, drivers and findings in the real Ask Dev panel, from a real ACR
// answer captured on the kiac stack (`tests/fixtures/ask-dev/captures/`). The
// panel's test-mode answer source reads it from session storage; nothing is fetched.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");
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
        // CHAOS-12384: the render's own answer (ask-dev package): an article "Answer" holding the
        // judgment, then the Drivers region. It carries no status pill and no AI label (see the
        // fixme tests below).
        const answer = panel.getByRole("article", { name: "Answer" });
        await expect(answer).toBeVisible();
        const judgment = answer.getByRole("region", { name: "Answer", exact: true });
        await expect(
            judgment.getByText(String(PARTIAL.direct_judgment).trim(), { exact: true }),
        ).toBeVisible();
        const drivers = answer.getByRole("region", { name: "Drivers", exact: true });
        await expect(drivers.getByRole("list").last().locator(":scope > li")).toHaveCount(
            (PARTIAL.drivers as unknown[]).length,
        );
        await page.screenshot({ path: testInfo.outputPath("answer-desktop.png") });
        await panel.screenshot({ path: testInfo.outputPath("answer-desktop-panel.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);

        // The details stay folded until asked for.
        const more = judgment.locator("details").filter({ hasText: "More detail" });
        await expect(more).not.toHaveAttribute("open");
        await more.locator("summary").click();
        await expect(more).toHaveAttribute("open");
        expect(requests).toEqual([]);
    });

    // GAP: the render draws no status pill ("Partial answer") for an answer; only the Completeness
    // panel's raw "partial" badge. Web pinned the pill by the answer's own status.
    test.fixme("shows the answer's status pill", async ({ page }) => {
        await seedAnswer(page, PARTIAL);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(panel.getByText("Partial answer", { exact: true })).toBeVisible();
    });

    // GAP: the render draws no "AI-written" label for model-written analysis.
    test.fixme("labels model-written analysis as AI-written", async ({ page }) => {
        await seedAnswer(page, PARTIAL);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(panel.getByText("AI-written", { exact: true })).toBeVisible();
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
        const answer = sheet.getByRole("article", { name: "Answer" });
        await expect(answer).toBeVisible();
        // The status pill is a GAP: see the fixme test in the desktop block.
        await expect(
            answer
                .getByRole("region", { name: "Readiness gaps", exact: true })
                .getByRole("list")
                .first()
                .locator(":scope > li"),
        ).toHaveCount(1);
        await page.screenshot({ path: testInfo.outputPath("answer-mobile.png") });
        await sheet.screenshot({ path: testInfo.outputPath("answer-mobile-sheet.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        // The sheet itself does not scroll sideways. (The answer does: see the fixme test below.)
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });

    // GAP: at 390px the render's answer article is wider than the sheet (scrollWidth 805 > 334): the
    // "strip" (chip row) inside it does not wrap or clip, so the conversation scrolls sideways.
    test.fixme("the answer fits the sheet at phone width", async ({ page }) => {
        await seedAnswer(page, READINESS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const answer = sheet.getByRole("article", { name: "Answer" });
        await expect(answer).toBeVisible();
        expect(await answer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});

test("shows the empty state when no answer is supplied", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const panel = page.getByRole("complementary", { name: "Ask Dev" });
    await expect(panel.getByText("Your conversation will appear here.")).toBeVisible();
    await expect(panel.getByRole("article", { name: "Answer" })).toHaveCount(0);
});
