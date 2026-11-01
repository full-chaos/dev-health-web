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
        // CHAOS-12384: the render's own Coverage, Limitations and Evidence references regions.
        const coverage = panel.getByRole("region", { name: "Coverage", exact: true });
        await expect(coverage).toBeVisible();
        const limits = coverage.getByRole("list");
        await expect(limits.locator(":scope > li")).toHaveCount(5);
        await expect(
            limits.getByText("Only part of the flow facts could be included"),
        ).toBeVisible();
        await expect(panel.getByRole("region", { name: "Limitations", exact: true })).toBeVisible();
        const evidence = panel.getByRole("region", { name: "Evidence references", exact: true });
        await expect(evidence).toBeVisible();
        // Plain text: no link, button or tab stop inside the list of references.
        await expect(
            evidence.getByRole("list").locator("a, button, [role=link], [tabindex]"),
        ).toHaveCount(0);
        expect(await evidence.getByRole("list").textContent()).not.toMatch(
            /acr:v1|[0-9a-f]{8}-[0-9a-f]{4}-/u,
        );
        await page.waitForLoadState("networkidle");
        await coverage.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("coverage-desktop.png") });
        await evidence.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("coverage-desktop-evidence.png") });
        expect(requests).toEqual([]);
    });

    // GAP: the render's "Facts" table wrapper scrolls but cannot take focus (axe
    // scrollable-region-focusable on `div.fact-table-wrap[role=group][aria-label=Facts]`).
    test.fixme("a degraded answer with fact tables passes axe", async ({ page }) => {
        await seedAnswer(page, OPEN_WORK);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        await expect(
            page
                .getByRole("complementary", { name: "Ask Dev" })
                .getByRole("region", { name: "Coverage", exact: true }),
        ).toBeVisible();
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
    });

    // GAP: the render writes no one-sentence "Missing data: ..." line (CHAOS-12245); the reader gets
    // the Coverage list and the Completeness panel's raw badges instead.
    test.fixme("a degraded answer says its missing data in one sentence", async ({ page }) => {
        await seedAnswer(page, OPEN_WORK);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(
            panel.getByText(
                "Missing data: health read in part (1 of 1); ranking not available; status read in part (2 of 5).",
                { exact: true },
            ),
        ).toBeVisible();
    });

    // GAP: the render does not say that opening evidence from the answer is not available yet.
    test.fixme("evidence says that opening it is not available yet", async ({ page }) => {
        await seedAnswer(page, OPEN_WORK);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(
            panel
                .getByRole("region", { name: "Evidence references", exact: true })
                .getByText("Opening evidence from here is not available yet."),
        ).toBeVisible();
    });

    test("a 'complete' status whose completeness was not derived says nothing about it", async ({
        page,
    }) => {
        await seedAnswer(page, CI_COMPLETE);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        // CHAOS-12157: never "Full answer" here; CHAOS-12245: nothing about completeness state.
        await expect(panel.getByText("Full answer", { exact: true })).toHaveCount(0);
        await expect(panel.getByRole("region", { name: "Coverage", exact: true })).toBeVisible();
        // The render shows the terminal status ("complete") alone; a not-derived state adds no badge.
        await expect(panel.getByTestId("completeness-chip-row")).toHaveText("complete");
        await expect(panel.getByTestId("completeness-chip-row").locator("> *")).toHaveCount(1);
    });

    // GAP: the render draws no plain "Answer" status pill for the answer.
    test.fixme("a 'complete' status whose completeness was not derived shows a plain 'Answer' pill", async ({
        page,
    }) => {
        await seedAnswer(page, CI_COMPLETE);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(panel.getByTestId("ask-dev-answer-status")).toHaveText("Answer");
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
        const coverage = sheet.getByRole("region", { name: "Coverage", exact: true });
        await expect(
            sheet.getByText("No facts stand behind this answer.", { exact: true }),
        ).toBeVisible();
        await page.waitForLoadState("networkidle");
        await coverage.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("coverage-mobile.png") });
        await sheet
            .getByRole("region", { name: "Evidence references", exact: true })
            .scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("coverage-mobile-evidence.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        for (const box of [coverage, sheet]) {
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        }
    });
});
