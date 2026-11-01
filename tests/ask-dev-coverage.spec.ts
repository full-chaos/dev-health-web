import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11932: how complete an answer is (coverage, completeness, limitations and evidence
// references) in the real Ask Dev panel, from real ACR answers captured on the kiac stack
// (`tests/fixtures/ask-dev/captures/`). The panel's test-mode source reads them
// from session storage; nothing is fetched.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");
const KEY = "ask-dev:test-mode-answer";

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
const OPEN_WORK = capture("kiac_team_open_work_degraded.event.json");
const CI_COMPLETE = capture("kiac_repo_ci_rate_complete.event.json");
const INCIDENTS = capture("kiac_repo_incidents_degraded.event.json");

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

    test("a degraded answer shows its limits beside it; evidence is plain text", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, OPEN_WORK);
        const requests: string[] = [];
        page.on("request", (r) => {
            // A data call only: a JS chunk is code, and the bundler may name one after the
            // evidence components (`/_next/static/chunks/src_components_evidence_*.js`; CHAOS-11929).
            if (new URL(r.url()).pathname.startsWith("/_next/")) return;
            if (/\/api\/ask-dev|agent-context|context-fabric|evidence/u.test(r.url()))
                requests.push(r.url());
        });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const coverage = panel.getByTestId("ask-dev-coverage");
        // CHAOS-12245: one plain sentence of missing data, never the completeness state.
        await expect(coverage.getByTestId("ask-dev-coverage-state")).toHaveText(
            "Missing data: health read in part (1 of 1); ranking not available; status read in part (2 of 5).",
        );
        await expect(coverage.getByTestId("ask-dev-coverage-details").locator("li")).toHaveCount(6);
        const evidence = coverage.getByTestId("ask-dev-coverage-evidence");
        await expect(evidence).toContainText("Opening evidence from here is not available yet.");
        await expect(coverage.locator("a, button, [role=link], [tabindex]")).toHaveCount(0);
        expect(await evidence.textContent()).not.toMatch(/acr:v1|[0-9a-f]{8}-[0-9a-f]{4}-/u);
        await page.waitForLoadState("networkidle");
        await coverage.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("coverage-desktop.png") });
        await evidence.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("coverage-desktop-evidence.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        expect(requests).toEqual([]);
    });

    test("a 'complete' status whose completeness was not derived says nothing about it", async ({
        page,
    }) => {
        await seedAnswer(page, CI_COMPLETE);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        // CHAOS-12157: the pill never says "Full answer" here. CHAOS-12245: a plain "Answer",
        // and nothing about completeness.
        await expect(panel.getByTestId("ask-dev-answer-status")).toHaveText("Answer");
        await expect(panel.getByTestId("ask-dev-coverage")).toBeVisible();
        await expect(panel.getByTestId("ask-dev-coverage-state")).toHaveCount(0);
        await expect(panel.getByTestId("ask-dev-answer-completeness")).toHaveCount(0);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("zero facts read as zero, in the sheet, with no sideways scroll", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, INCIDENTS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const coverage = sheet.getByTestId("ask-dev-coverage");
        await expect(coverage.getByTestId("ask-dev-coverage-counts")).toHaveText(
            "No facts stand behind this answer.",
        );
        await page.waitForLoadState("networkidle");
        await coverage.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("coverage-mobile.png") });
        await coverage.getByTestId("ask-dev-coverage-evidence").scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("coverage-mobile-evidence.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        for (const box of [coverage, sheet]) {
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        }
    });
});
