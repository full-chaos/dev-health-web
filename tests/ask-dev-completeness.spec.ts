import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

import { rawWordsInNode } from "../src/test/rawWords";

// CHAOS-12245, chris's ruling (2026-10-31): "web never shows the raw completeness state". Each state
// in the real Ask Dev panel, from real ACR answers captured on the kiac stack: `complete` adds
// nothing, `not_derived` renders nothing about completeness, `partial` and `degraded` add one plain
// sentence that names the missing data. The panel's test-mode source reads the answer from session
// storage; nothing is fetched.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");
const KEY = "ask-dev:test-mode-answer";

type Result = Record<string, unknown> & {
    completeness: { state: string; outcomes?: Record<string, unknown>[] };
};
const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Result }).result;

const PARTIAL = capture("kiac_repo_owner_complete.event.json");
/** A real ranking answer (oracle captures): its members serve their driver rows. */
const RANKING = (
    JSON.parse(
        readFileSync(
            join(
                process.cwd(),
                "src/lib/ask-dev/render/__oracle__/captures/kiac_repo_attention_ranking.event.json",
            ),
            "utf8",
        ),
    ) as { result: Result }
).result;
const DEGRADED = capture("kiac_team_open_work_degraded.event.json");
const NOT_DERIVED = capture("kiac_repo_ci_rate_complete.event.json");
/** The same real answer, with its completeness set to complete: kiac served none. */
const COMPLETE: Result = {
    ...PARTIAL,
    completeness: {
        ...PARTIAL.completeness,
        state: "complete",
        outcomes: (PARTIAL.completeness.outcomes ?? []).map((row) => ({
            ...row,
            outcome: "satisfied",
        })),
    },
};

/** Words that name a completeness state, or only restate one. */
const STATE_WORDS =
    /\b(complete|completeness|partial|degraded|not[ _]derived|not known|unknown)\b|needed was read|could not be read/iu;

/**
 * The words of `pattern` a reader can meet in `target`, text node by text node and in labels
 * (CHAOS-12312): `textContent()` glues children ("partial4 of 5 drivers"), and a word boundary
 * never matches inside the glue. The same function as the unit tests' check, run in the page.
 */
const rawWordsIn = (target: Locator, pattern: RegExp) =>
    target.evaluate(rawWordsInNode, [pattern.source, pattern.flags] as const);

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

/** Opens Ask Dev once the launcher is hydrated; never clicks a launcher that is already open. */
async function openAnswer(page: Page, answer: Result, surface: (page: Page) => Locator) {
    await page.addInitScript(([key, value]) => window.sessionStorage.setItem(key, value), [
        KEY,
        JSON.stringify(answer),
    ] as const);
    await page.goto("/dashboard");
    const launcher = page.getByRole("button", { name: "Open Ask Dev" });
    await expect(async () => {
        if ((await launcher.getAttribute("aria-expanded")) !== "true") await launcher.click();
        await expect(surface(page)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000, intervals: [300, 700, 1500] });
    const panel = surface(page);
    await expect(panel.getByTestId("ask-dev-coverage")).toBeVisible();
    return panel;
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });
    const panelOf = (page: Page) => page.getByRole("complementary", { name: "Ask Dev" });

    const cases = [
        {
            state: "complete",
            answer: COMPLETE,
            pill: "Full answer",
            sentence: null,
        },
        {
            state: "not_derived",
            answer: NOT_DERIVED,
            pill: "Answer",
            sentence: null,
        },
        {
            state: "partial",
            answer: PARTIAL,
            pill: "Answer, not fully covered",
            sentence: "Missing data: health read in part (1 of 1); status read in part (1 of 4).",
        },
        {
            state: "degraded",
            answer: DEGRADED,
            pill: "Degraded answer",
            sentence:
                "Missing data: health read in part (1 of 1); ranking not available; status read in part (2 of 5).",
        },
    ] as const;

    for (const { state, answer, pill, sentence } of cases) {
        test(`${state}: never the state word${sentence === null ? ", and nothing added" : ", one sentence of missing data"}`, async ({
            page,
        }, testInfo) => {
            const panel = await openAnswer(page, answer, panelOf);
            await expect(panel.getByTestId("ask-dev-answer-status")).toHaveText(pill);
            const coverageLine = panel.getByTestId("ask-dev-coverage-state");
            if (sentence === null) {
                await expect(coverageLine).toHaveCount(0);
                await expect(panel.getByTestId("ask-dev-answer-completeness")).toHaveCount(0);
            } else {
                await expect(coverageLine).toHaveText(sentence);
            }
            const completenessBlock = panel.getByTestId("ask-dev-coverage-completeness");
            expect(await rawWordsIn(completenessBlock, STATE_WORDS)).toEqual([]);
            await panel.getByTestId("ask-dev-coverage").scrollIntoViewIfNeeded();
            await page.screenshot({
                path: testInfo.outputPath(`completeness-${state}-desktop.png`),
            });
        });
    }
});

test.describe("cohort members (desktop)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("each member shows its served driver rows, never a completeness word", async ({
        page,
    }, testInfo) => {
        const panel = await openAnswer(page, RANKING, (p) =>
            p.getByRole("complementary", { name: "Ask Dev" }),
        );
        const cells = panel.getByTestId("ask-dev-ranking-completeness");
        await expect(cells.first()).toHaveText(/^\d of 5 drivers$/u);
        for (const detail of await panel.getByTestId("ask-dev-ranking-detail").all()) {
            expect(await rawWordsIn(detail, /\b(complete|partial|degraded)\b/iu)).toEqual([]);
        }
        await panel.getByTestId("ask-dev-ranking-detail").last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("completeness-cohort-desktop.png") });
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("degraded, in the sheet: one sentence of missing data", async ({ page }, testInfo) => {
        const sheet = await openAnswer(page, DEGRADED, (p) => p.getByTestId("ask-dev-sheet"));
        await expect(sheet.getByTestId("ask-dev-coverage-state")).toHaveText(/^Missing data: /u);
        await sheet.getByTestId("ask-dev-coverage").scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("completeness-degraded-mobile.png") });
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});
