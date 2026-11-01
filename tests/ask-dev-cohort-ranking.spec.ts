import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11944: the cohort ranking in the real Ask Dev panel, from real, scrubbed ACR answers: the
// public ask-dev seed (a discovered team cohort, 3 ranked, 1 scored), a kiac answer ranking 4
// repositories, and a kiac answer whose cohort is 25 pull requests (G1: Ranking not shown). The
// panel's test-mode source reads them from session storage; nothing is fetched.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const ORACLE = join(process.cwd(), "tests/fixtures/ask-dev/captures");
const ANSWERS = join(process.cwd(), "tests/fixtures/ask-dev/captures");
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
        const table = ranking.getByRole("group", { name: "Ranking" }).getByRole("table");
        const rows = table.locator("tbody tr");
        await expect(rows).toHaveCount(3);
        // The window is a column of each row in the render: every ranked row states it.
        await expect(table.getByRole("cell", { name: "current period", exact: true })).toHaveCount(
            3,
        );
        await expect(
            rows.first().getByRole("cell", { name: "provisional", exact: true }),
        ).toBeVisible();
        // Exactly one row carries a score; it sits beside its outcome, with its drivers.
        const scored = rows.filter({ has: page.locator("td:nth-child(3)", { hasText: /^\d/u }) });
        await expect(scored).toHaveCount(1);
        await expect(scored.getByRole("cell", { name: "provisional", exact: true })).toHaveCount(1);
        await expect(scored.getByRole("listitem")).toHaveCount(2);
        await expect(table.getByRole("listitem")).toHaveCount(2);
        // An unscored row shows a dash and says why, never a number.
        await expect(rows.nth(1).getByRole("cell", { name: "—", exact: true })).toHaveCount(1);
        await expect(rows.nth(1)).toContainText("not enough evidence");
        // The ranking comes before the drivers that explain it.
        const drivers = panel.getByRole("group", { name: "Drivers", exact: true });
        const rankingBox = await ranking.boundingBox();
        const driversBox = await drivers.boundingBox();
        expect(rankingBox!.y).toBeLessThan(driversBox!.y);
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
        // The render builds the heading as "Ranked <kind>s"; assert the word it uses.
        const ranking = page
            .getByRole("complementary", { name: "Ask Dev" })
            .getByRole("group", { name: /^Ranked repositor(y|ie)s$/u });
        const rows = ranking.getByRole("group", { name: "Ranking" }).locator("tbody tr");
        await expect(rows).toHaveCount(4);
        await expect(rows.getByRole("cell", { name: "provisional", exact: true })).toHaveCount(4);
        await expect(
            ranking.getByRole("group", { name: "Ranking" }).getByRole("listitem"),
        ).toHaveCount(8);
        for (const row of await rows.all()) await expect(row.getByRole("listitem")).toHaveCount(2);
        await page.waitForLoadState("networkidle");
        await ranking.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("ranking-repos-desktop.png") });
    });

    // CHAOS-12477: ACR's ranking pass marks every member computed, and this answer has no score and
    // no driver, so nothing was ranked: the members are the answer. This changes CHAOS-12429 G1
    // for a list; a real ranking of a kind this view does not rank still reads "Ranking not shown".
    test("a pull-request cohort with nothing ranked lists its members", async ({
        page,
    }, testInfo) => {
        await seedAnswer(page, PRS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const list = panel.getByTestId("cohort-members-panel");
        await expect(list.getByRole("heading", { name: "pull requests" })).toBeVisible();
        await expect(list.locator("li.record__title")).toHaveCount(25);
        await expect(list.getByTestId("cohort-members-notice")).toContainText(
            "not every pull request",
        );
        await expect(panel.getByRole("group", { name: "Ranking not shown" })).toHaveCount(0);
        await expect(panel.getByRole("group", { name: /^Ranked / })).toHaveCount(0);
        await page.waitForLoadState("networkidle");
        await list.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("cohort-members-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the ranking table is in the sheet, in its own scroll box", async ({ page }, testInfo) => {
        await seedAnswer(page, REPOS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const ranking = sheet.getByRole("group", { name: /^Ranked repositor(y|ie)s$/u });
        const scroll = ranking.getByRole("group", { name: "Ranking" });
        await expect(scroll.locator("tbody tr")).toHaveCount(4);
        await page.waitForLoadState("networkidle");
        await ranking.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("ranking-repos-mobile.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        // The wide table may scroll inside its own box, but the box itself stays inside the sheet.
        const sheetBox = (await sheet.boundingBox())!;
        const scrollBox = (await scroll.boundingBox())!;
        expect(scrollBox.x + scrollBox.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1);
    });

    test("nothing scrolls sideways", async ({ page }) => {
        await seedAnswer(page, REPOS);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const ranking = sheet.getByRole("group", { name: /^Ranked repositor(y|ie)s$/u });
        await expect(
            ranking.getByRole("group", { name: "Ranking" }).locator("tbody tr"),
        ).toHaveCount(4);
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await ranking.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});
