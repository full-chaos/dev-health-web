import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-3440: clarification, non-answer and refusal turns in the real Ask Dev panel, from real ACR
// output (`tests/fixtures/ask-dev/captures/`): results captured on the kiac stack,
// and acr encoder frames for what kiac never produced (anchor offers, a 413 budget refusal). The
// panel's test-mode source reads the turns from session storage and writes a sent choice or
// re-ask back there; nothing is fetched.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");
const TURNS_KEY = "ask-dev:test-mode-answer";
const CHOICE_KEY = "ask-dev:test-mode-choice";
const REASK_KEY = "ask-dev:test-mode-reask";

type Option = { receipt_id: string; label: string };
type Result = {
    result_id: string;
    question: string;
    structure_needs?: Record<string, Option[] | string[]>;
};
const event = (file: string) => JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as unknown;
const capture = (file: string) => (event(file) as { result: Result }).result;
type Index = { encoder_captures: { captures: { file: string; question: string }[] } };
const INDEX = JSON.parse(readFileSync(join(CAPTURES, "index.json"), "utf8")) as Index;
/** A refusal turn: the question the capture sent, then acr's error frame. */
type Refusal = { question: string; refusal: unknown };
const refusalTurn = (file: string): Refusal => {
    const entry = INDEX.encoder_captures.captures.find((c) => c.file === file);
    if (!entry) throw new Error(`${file} is not indexed`);
    return { question: entry.question, refusal: event(file) };
};
const BLOCKED_NOW = capture("kiac_blocked_now_window_clarification.event.json");
const KIND_CANDIDATE = capture("kiac_kind_and_candidate_clarification.event.json");
const MANY_HANDLES = capture("kiac_kind_candidate_handle_clarification.event.json");
const BARE_NO_MATCH = capture("kiac_unresolved_structure_no_match.event.json");
const ANCHOR_V2 = capture("acr_encoder_anchor_v2_clarification.event.json");
const REFUSAL_RESULT_COUNT = refusalTurn("acr_encoder_budget_refusal_result_count.event.json");
const REFUSAL_WINDOW = refusalTurn("acr_encoder_budget_refusal_evidence_window.event.json");

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seedTurns(page: Page, turns: (Result | Refusal)[]): Promise<void> {
    await page.addInitScript(([key, value]) => window.sessionStorage.setItem(key, value), [
        TURNS_KEY,
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

    test("a prior turn is read-only; the live turn sends only its own receipts", async ({
        page,
    }, testInfo) => {
        await seedTurns(page, [BLOCKED_NOW, KIND_CANDIDATE]);
        const requests: string[] = [];
        page.on("request", (r) => {
            if (/\/api\/ask-dev|agent-context|context-fabric/u.test(r.url()))
                requests.push(r.url());
        });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();

        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const turns = panel.getByTestId("ask-dev-turn");
        await expect(turns).toHaveCount(2);
        const prior = turns.nth(0);
        const live = turns.nth(1);
        await expect(prior.getByTestId("ask-dev-clarification")).toHaveAttribute(
            "data-live",
            "false",
        );
        await expect(prior.getByRole("button")).toHaveCount(0);
        await expect(prior.getByTestId("ask-dev-clarification-offered").first()).toBeVisible();

        const kind = KIND_CANDIDATE.structure_needs?.kind_options as Option[];
        const candidates = KIND_CANDIDATE.structure_needs?.candidate_options as Option[];
        await live.getByRole("button", { name: kind[0]!.label, exact: true }).click();
        await live.getByRole("button", { name: candidates[0]!.label, exact: true }).click();
        await expect(live.locator("[aria-pressed=true]")).toHaveCount(2);
        await page.screenshot({ path: testInfo.outputPath("clarification-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);

        await live.getByTestId("ask-dev-clarification-ask-again").click();
        const choice = JSON.parse(
            (await page.evaluate((key) => window.sessionStorage.getItem(key), CHOICE_KEY)) ??
                "null",
        );
        const bound = (option: Option) => [
            { result_id: KIND_CANDIDATE.result_id, receipt_id: option.receipt_id },
        ];
        expect(choice).toEqual({
            parentResultId: KIND_CANDIDATE.result_id,
            receipts: {
                prior_kind_receipts: bound(kind[0]!),
                prior_candidate_receipts: bound(candidates[0]!),
            },
        });
        await expect(live.getByTestId("ask-dev-clarification-ask-again")).toBeDisabled();
        expect(requests).toEqual([]);
    });

    test("a no-match with nothing to choose shows no control", async ({ page }) => {
        await seedTurns(page, [BARE_NO_MATCH]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(panel.getByTestId("ask-dev-answer-status")).toHaveText(
            "No answer: no matching subject",
        );
        await expect(panel.getByTestId("ask-dev-clarification-chip")).toHaveCount(0);
        await expect(panel.getByTestId("ask-dev-clarification-ask-again")).toHaveCount(0);
    });
});

test.describe("desktop (1280px): anchors and refusals", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("anchor offers from acr's encoder send only this result's ancr and winr receipts", async ({
        page,
    }, testInfo) => {
        await seedTurns(page, [REFUSAL_WINDOW, ANCHOR_V2]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const turns = panel.getByTestId("ask-dev-turn");
        await expect(turns).toHaveCount(2);
        await expect(turns.nth(0).getByRole("button")).toHaveCount(0);

        const live = turns.nth(1);
        const anchors = ANCHOR_V2.structure_needs?.anchor_options as Option[];
        const windows = ANCHOR_V2.structure_needs?.window_options as Option[];
        await live.getByRole("button", { name: anchors[0]!.label, exact: true }).click();
        await live.getByRole("button", { name: windows[0]!.label, exact: true }).click();
        await page.screenshot({ path: testInfo.outputPath("anchor-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        await live.getByTestId("ask-dev-clarification-ask-again").click();
        const choice = JSON.parse(
            (await page.evaluate((key) => window.sessionStorage.getItem(key), CHOICE_KEY)) ??
                "null",
        );
        const bound = (option: Option) => [
            { result_id: ANCHOR_V2.result_id, receipt_id: option.receipt_id },
        ];
        expect(choice).toEqual({
            parentResultId: ANCHOR_V2.result_id,
            receipts: {
                prior_anchor_receipts: bound(anchors[0]!),
                prior_window_receipts: bound(windows[0]!),
            },
        });
    });

    test("a budget refusal offers the narrower re-ask once, with no receipt", async ({
        page,
    }, testInfo) => {
        await seedTurns(page, [KIND_CANDIDATE, REFUSAL_RESULT_COUNT]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const turns = panel.getByTestId("ask-dev-turn");
        await expect(turns).toHaveCount(2);
        await expect(turns.nth(0).getByRole("button")).toHaveCount(0);
        const refusal = turns.nth(1).getByTestId("ask-dev-refusal");
        await expect(refusal).toHaveAttribute("data-axis", "result_count");
        await expect(refusal.getByTestId("ask-dev-answer-status")).toHaveText(
            "No answer: too large to send",
        );
        await page.screenshot({ path: testInfo.outputPath("refusal-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        await refusal.getByTestId("ask-dev-refusal-reask").click();
        const reask = JSON.parse(
            (await page.evaluate((key) => window.sessionStorage.getItem(key), REASK_KEY)) ?? "null",
        );
        expect(reask).toEqual({ question: REFUSAL_RESULT_COUNT.question, axis: "result_count" });
        await expect(refusal.getByTestId("ask-dev-refusal-reask")).toBeDisabled();
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("wraps many offers inside the sheet", async ({ page }, testInfo) => {
        await seedTurns(page, [MANY_HANDLES]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();

        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const turn = sheet.getByTestId("ask-dev-clarification");
        await expect(turn).toHaveAttribute("data-live", "true");
        const handles = MANY_HANDLES.structure_needs?.handle_options as Option[];
        await expect(
            turn.locator("[data-family=subject_handle] [data-testid=ask-dev-clarification-chip]"),
        ).toHaveCount(handles.length);
        await page.screenshot({ path: testInfo.outputPath("clarification-mobile.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        for (const box of [turn, sheet]) {
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        }
    });

    test("a refusal reads in the sheet without sideways scroll", async ({ page }, testInfo) => {
        await seedTurns(page, [REFUSAL_WINDOW]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        const refusal = sheet.getByTestId("ask-dev-refusal");
        await expect(refusal).toHaveAttribute("data-axis", "evidence_window");
        await expect(refusal.getByTestId("ask-dev-refusal-reask")).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("refusal-mobile.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        for (const box of [refusal, sheet]) {
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        }
    });
});
