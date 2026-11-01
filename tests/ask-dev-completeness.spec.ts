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
/** A real ranking answer (captures): its members serve their driver rows. */
const RANKING = (
    JSON.parse(
        readFileSync(
            join(
                process.cwd(),
                "tests/fixtures/ask-dev/captures/kiac_repo_attention_ranking.event.json",
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
 * The same, for the panel itself: its own name, "Completeness", is the panel's title, not a state
 * word. Every state word and restated state is still named.
 */
const PANEL_STATE_WORDS =
    /\b(complete|partial|degraded|not[ _]derived|not known|unknown)\b|needed was read|could not be read/iu;

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
    await expect(panel.getByRole("group", { name: "Coverage", exact: true })).toBeVisible();
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
            sentence: null,
        },
        {
            state: "not_derived",
            answer: NOT_DERIVED,
            sentence: null,
        },
        {
            state: "partial",
            answer: PARTIAL,
            sentence: "Missing data: health narrowed; state narrowed (1 of 4).",
        },
        {
            state: "degraded",
            answer: DEGRADED,
            sentence:
                "Missing data: health narrowed; ranking unavailable; state narrowed (2 of 5).",
        },
    ] as const;

    for (const { state, answer, sentence } of cases) {
        test(`${state}: never the state word${sentence === null ? ", and nothing added" : ", one sentence of missing data"}`, async ({
            page,
        }, testInfo) => {
            const panel = await openAnswer(page, answer, panelOf);
            const coverageLine = panel.getByTestId("completeness-missing-data");
            if (sentence === null) {
                await expect(coverageLine).toHaveCount(0);
            } else {
                await expect(coverageLine).toHaveText(sentence);
            }
            const completenessBlock = panel.getByTestId("completeness-panel");
            await expect(completenessBlock).toHaveAttribute("data-completeness-state", state);
            // The stop reason's value can hold a state word, so it sits in the closed fold that
            // CHAOS-12417 rules for it. It stays closed, and everything outside it is read.
            const fold = completenessBlock.locator("details", {
                has: page.getByTestId("completeness-terminal-reason"),
            });
            for (const reason of await fold.all()) {
                await expect(reason).not.toHaveAttribute("open");
            }
            await fold.evaluateAll((folds) => {
                for (const reason of folds) reason.remove();
            });
            expect(await rawWordsIn(completenessBlock, PANEL_STATE_WORDS)).toEqual([]);
            await panel
                .getByRole("group", { name: "Coverage", exact: true })
                .scrollIntoViewIfNeeded();
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
        const ranking = panel.getByTestId("cohort-ranking-panel");
        await expect(ranking).toBeVisible();
        const rows = ranking.getByTestId("ranking-row");
        // A member shows "N of 5 drivers" (memberDriversText).
        await expect(rows.first().getByText(/^\d of 5 drivers$/u)).toBeVisible();
        for (const row of await rows.all()) {
            expect(await rawWordsIn(row, /\b(complete|partial|degraded)\b/iu)).toEqual([]);
        }
        await rows.last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("completeness-cohort-desktop.png") });
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("degraded, in the sheet: the answer fits with no sideways scroll", async ({
        page,
    }, testInfo) => {
        const sheet = await openAnswer(page, DEGRADED, (p) => p.getByTestId("ask-dev-sheet"));
        await sheet.getByRole("group", { name: "Coverage", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("completeness-degraded-mobile.png") });
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });

    test("degraded, in the sheet: one sentence of missing data", async ({ page }) => {
        const sheet = await openAnswer(page, DEGRADED, (p) => p.getByTestId("ask-dev-sheet"));
        await expect(sheet.getByTestId("completeness-missing-data")).toHaveText(/^Missing data: /u);
    });
});
