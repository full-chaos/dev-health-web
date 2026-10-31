import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11944: the cohort ranking in the real Ask Dev panel, from real, scrubbed ACR answers: the
// public ask-dev seed (a discovered team cohort, 3 ranked, 1 scored), a kiac answer ranking 4
// repositories, and a kiac answer whose cohort is 25 pull requests (G1: Ranking not shown). The
// panel's test-mode source reads them from session storage; nothing is fetched.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const ORACLE = join(process.cwd(), "src/lib/ask-dev/render/__oracle__/captures");
const ANSWERS = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const KEY = "ask-dev:test-mode-answer";

const resultOf = (path: string) => {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return (parsed.result ?? parsed) as Record<string, unknown>;
};
const TEAMS = resultOf(join(ORACLE, "seed-cv-discovered-team-series-rep1-t2-a1.result.json"));
const REPOS = resultOf(join(ORACLE, "kiac_repo_attention_ranking.event.json"));
const PRS = resultOf(join(ANSWERS, "kiac_repo_merged_prs_degraded.event.json"));

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

    test("a team cohort ranks before the drivers; a score never stands alone", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, TEAMS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const ranking = panel.getByRole("group", { name: "Ranked teams", exact: true });
        await expect(ranking.getByTestId("ask-dev-ranking-row")).toHaveCount(3);
        await expect(ranking.getByTestId("ask-dev-ranking-window")).toHaveText(
            "Window: Last 90 days",
        );
        await expect(ranking.getByTestId("ask-dev-ranking-outcome").first()).toHaveText(
            "Provisional",
        );
        await expect(
            ranking.locator("[data-testid=ask-dev-ranking-score][data-state=score]"),
        ).toHaveCount(1);
        await expect(ranking.getByTestId("ask-dev-ranking-driver")).toHaveCount(2);
        await page.waitForLoadState("networkidle");
        await ranking.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("ranking-teams-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
    });

    test("a repository cohort: 4 ranked rows, each with outcome and 2 drivers", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, REPOS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const ranking = page
            .getByRole("complementary", { name: "Ask Dev" })
            .getByRole("group", { name: "Ranked repositories", exact: true });
        await expect(ranking.getByTestId("ask-dev-ranking-row")).toHaveCount(4);
        await expect(ranking.getByTestId("ask-dev-ranking-driver")).toHaveCount(8);
        await page.waitForLoadState("networkidle");
        await ranking.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("ranking-repos-desktop.png") });
    });

    test("a pull-request cohort: Ranking not shown, no name or score", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, PRS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const notice = panel.getByRole("group", { name: "Ranking not shown", exact: true });
        await expect(notice).toContainText("does not rank");
        await expect(panel.getByTestId("ask-dev-ranking-row")).toHaveCount(0);
        await expect(panel.getByTestId("ask-dev-ranking-score")).toHaveCount(0);
        await page.waitForLoadState("networkidle");
        await notice.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("ranking-not-shown-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the ranking table fits the sheet; nothing scrolls sideways", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, REPOS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const ranking = sheet.getByRole("group", { name: "Ranked repositories", exact: true });
        await expect(ranking.getByTestId("ask-dev-ranking-row")).toHaveCount(4);
        await page.waitForLoadState("networkidle");
        await ranking.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("ranking-repos-mobile.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await ranking.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        const table = ranking.getByTestId("ask-dev-ranking-table");
        expect(await table.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});
