import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// CHAOS-3440: clarification, non-answer and refusal turns in the real Ask Dev panel, from real ACR
// output (`tests/fixtures/ask-dev/captures/`): results captured on the kiac stack,
// and acr encoder frames for what kiac never produced (anchor offers, a 413 budget refusal).
// CHAOS-12384: the panel is ask-dev's render. The test-mode transport plays each captured turn as
// the stream of one question, and records every request it was sent (`ask-dev:test-mode-calls`).
// A choice or a narrower re-ask is therefore asserted from the request on the wire: the receipts it
// carries, each bound to the parent result, and the question it sends. The offers are the render's
// popup above the composer (a dialog, one question per page); a turn that is no longer the latest
// keeps only a closed "How this was resolved" note, with no control.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");
const KEYS = {
    stream: "ask-dev:test-mode-stream",
    calls: "ask-dev:test-mode-calls",
} as const;

type Option = { receipt_id: string; label: string };
type Result = {
    result_id: string;
    question: string;
    structure_needs?: Record<string, Option[] | string[]>;
};
const load = (file: string) => JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as unknown;
const capture = (file: string) => (load(file) as { result: Result }).result;
type Index = { encoder_captures: { captures: { file: string; question: string }[] } };
const INDEX = JSON.parse(readFileSync(join(CAPTURES, "index.json"), "utf8")) as Index;
/** A refusal turn: the question the capture sent, then acr's error frame. */
type Refusal = { question: string; refusal: unknown };
const refusalTurn = (file: string): Refusal => {
    const entry = INDEX.encoder_captures.captures.find((c) => c.file === file);
    if (!entry) throw new Error(`${file} is not indexed`);
    return { question: entry.question, refusal: load(file) };
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

const event = (seq: number, body: Record<string, unknown>) => ({
    schema_version: "context_fabric_investigation_event.v1",
    request_id: "request_e2e",
    seq,
    ...body,
});
const accepted = event(1, {
    type: "accepted",
    reserved_result_id: "result_reserved_e2e_0001",
    started_at: "2026-10-31T12:00:00Z",
    budget_seconds: 110,
});
/** A play: the turn's real ACR result, as the transport hands it to the store. */
const answers = (result: Result) => ({
    events: [accepted, event(2, { type: "result", result })],
});
/** A refusal turn: acr's own error frame, as the capture holds it. */
const refuses = (turn: Refusal) => ({ events: [accepted, turn.refusal] });

async function seedStream(page: Page, stream: unknown[]): Promise<void> {
    await page.addInitScript(
        ([key, value]) => {
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            window.sessionStorage.setItem(key, value);
        },
        [KEYS.stream, JSON.stringify(stream)] as const,
    );
}

type Call = { kind: string; request?: Record<string, unknown> };
/** What was sent: every investigation call the transport recorded, in order. */
const investigations = async (page: Page) =>
    (
        await page.evaluate(
            (key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as Call[],
            KEYS.calls,
        )
    ).filter((call) => call.kind === "investigate");

async function ask(panel: Locator, question: string): Promise<void> {
    const input = panel.getByRole("textbox", { name: "Ask a question" });
    await input.fill(question);
    await input.press("Enter");
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

const lines = (panel: Locator) => panel.getByRole("log", { name: "Conversation" });
const assistantTurns = (panel: Locator) => lines(panel).locator(".chat__turn--assistant");
/** The offers popup above the composer. Only the latest turn has one. */
const popup = (region: Locator) => region.getByRole("dialog");

/** Every receipt the request carries: field -> the receipts it holds. Empty fields are not listed. */
const RECEIPT_FIELDS = [
    "prior_subject_receipts",
    "prior_kind_receipts",
    "prior_anchor_receipts",
    "prior_handle_receipts",
    "prior_window_receipts",
    "prior_candidate_receipts",
] as const;
const receiptsOf = (call: Call) =>
    Object.fromEntries(
        RECEIPT_FIELDS.flatMap((field) => {
            const held = call.request?.[field];
            return Array.isArray(held) && held.length > 0 ? [[field, held]] : [];
        }),
    );

/** Opens a page and the panel, then asks each question in turn, waiting for its turn to settle. */
async function askAll(page: Page, region: Locator, questions: string[]): Promise<void> {
    for (const [index, question] of questions.entries()) {
        await ask(region, question);
        await expect(region.getByText(/^Ask Dev · /u)).toHaveCount(index + 1);
        await expect(region.getByTestId("chat-progress")).toHaveCount(0);
    }
}

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("a prior turn is read-only; the live turn sends only its own receipts", async ({
        page,
    }, testInfo) => {
        await seedStream(page, [
            answers(BLOCKED_NOW),
            answers(KIND_CANDIDATE),
            answers(capture("kiac_project_status_partial.event.json")),
        ]);
        const requests: string[] = [];
        page.on("request", (r) => {
            if (/\/api\/ask-dev|agent-context|context-fabric/u.test(r.url()))
                requests.push(r.url());
        });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();

        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await askAll(page, panel, [BLOCKED_NOW.question, KIND_CANDIDATE.question]);
        const turns = assistantTurns(panel);
        await expect(turns).toHaveCount(2);
        const prior = turns.nth(0);
        // The prior turn offers nothing to send: no control, only what it asked, in a closed note.
        await expect(prior.getByRole("button")).toHaveCount(0);
        const note = prior.getByTestId("frozen-offers-disclosure");
        await note.getByText("How this was resolved").click();
        await expect(note).toContainText("Asked about: time window.");
        // One popup, and it is the live turn's: its first question is the kind, not the window.
        await expect(popup(panel)).toHaveCount(1);
        await expect(popup(panel)).toHaveAccessibleName("Which kind of thing is this about?");

        const kind = KIND_CANDIDATE.structure_needs?.kind_options as Option[];
        const candidates = KIND_CANDIDATE.structure_needs?.candidate_options as Option[];
        const live = popup(panel);
        await live.getByRole("button", { name: kind[0]!.label, exact: true }).click();
        // A single-choice question moves on once it is picked.
        await expect(popup(panel)).toHaveAccessibleName("Did you mean one of these?");
        await live.getByRole("button", { name: candidates[0]!.label, exact: true }).click();
        await expect(
            live.getByRole("button", { name: candidates[0]!.label, exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        // The kind pick is still held when the viewer steps back.
        await live.getByRole("button", { name: "Previous question" }).click();
        await expect(live.getByRole("button", { pressed: true })).toContainText(kind[0]!.label);
        await live.getByRole("button", { name: "Next question" }).click();
        await page.screenshot({ path: testInfo.outputPath("clarification-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);

        // Before this click only the two questions were sent, and neither carried a receipt.
        const before = await investigations(page);
        expect(before).toHaveLength(2);
        expect(before.map(receiptsOf)).toEqual([{}, {}]);

        await live.getByRole("button", { name: "Continue with 1 selected" }).click();
        await expect(panel.getByText(/^Ask Dev · /u)).toHaveCount(3);
        const sent = await investigations(page);
        expect(sent).toHaveLength(3);
        const bound = (option: Option) => [
            { result_id: KIND_CANDIDATE.result_id, receipt_id: option.receipt_id },
        ];
        // Only this result's receipts, each bound to it: nothing from the turn before it.
        expect(receiptsOf(sent[2]!)).toEqual({
            prior_kind_receipts: bound(kind[0]!),
            prior_candidate_receipts: bound(candidates[0]!),
        });
        expect(sent[2]!.request).toHaveProperty("parent_result_id", KIND_CANDIDATE.result_id);
        // The choice went once, and the turn it answered is read-only now.
        await expect(popup(panel)).toHaveCount(0);
        await expect(assistantTurns(panel).nth(1).getByRole("button")).toHaveCount(0);
        expect(requests).toEqual([]);
    });

    test("a no-match with nothing to choose shows no control", async ({ page }) => {
        await seedStream(page, [answers(BARE_NO_MATCH)]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await askAll(page, panel, [BARE_NO_MATCH.question]);
        const answer = panel.getByRole("article", { name: "Answer" });
        await expect(answer).toHaveAttribute("data-state", "no_match");
        await expect(popup(panel)).toHaveCount(0);
        await expect(answer.getByRole("button")).toHaveCount(0);
    });
});

test.describe("desktop (1280px): no-match status word", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    // CHAOS-12417: ACR serves "No answer" on purpose, because the stop of ruling B also ends in
    // `no_match` (acr design, context-fabric-result-semantics.md section 5).
    test("a no-match reads the served word", async ({ page }) => {
        await seedStream(page, [answers(BARE_NO_MATCH)]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await ask(panel, BARE_NO_MATCH.question);
        await expect(panel.getByTestId("ask-dev-answer-status")).toHaveText("No answer");
    });
});

test.describe("desktop (1280px): anchors and refusals", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("anchor offers from acr's encoder send only this result's ancr and winr receipts", async ({
        page,
    }, testInfo) => {
        await seedStream(page, [
            refuses(REFUSAL_WINDOW),
            answers(ANCHOR_V2),
            answers(capture("kiac_project_status_partial.event.json")),
        ]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await ask(panel, REFUSAL_WINDOW.question);
        await expect(panel.getByTestId("ask-dev-refusal")).toBeVisible();
        await ask(panel, ANCHOR_V2.question);
        const turns = assistantTurns(panel);
        await expect(turns).toHaveCount(2);
        await expect(turns.nth(0).getByRole("button")).toHaveCount(0);

        const live = popup(panel);
        const anchors = ANCHOR_V2.structure_needs?.anchor_options as Option[];
        const windows = ANCHOR_V2.structure_needs?.window_options as Option[];
        await live.getByRole("button", { name: anchors[0]!.label, exact: true }).click();
        await page.screenshot({ path: testInfo.outputPath("anchor-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        expect(await investigations(page)).toHaveLength(2);
        await live.getByRole("button", { name: windows[0]!.label, exact: true }).click();
        await expect(panel.getByText(/^Ask Dev · /u)).toHaveCount(3);

        const sent = await investigations(page);
        expect(sent).toHaveLength(3);
        const bound = (option: Option) => [
            { result_id: ANCHOR_V2.result_id, receipt_id: option.receipt_id },
        ];
        // The refused turn before it left no receipt behind; the first two sends carried none.
        expect(sent.slice(0, 2).map(receiptsOf)).toEqual([{}, {}]);
        expect(receiptsOf(sent[2]!)).toEqual({
            prior_anchor_receipts: bound(anchors[0]!),
            prior_window_receipts: bound(windows[0]!),
        });
        expect(sent[2]!.request).toHaveProperty("parent_result_id", ANCHOR_V2.result_id);
    });

    test("a budget refusal offers the narrower re-ask once, with no receipt", async ({
        page,
    }, testInfo) => {
        await seedStream(page, [
            answers(KIND_CANDIDATE),
            refuses(REFUSAL_RESULT_COUNT),
            answers(capture("kiac_project_status_partial.event.json")),
        ]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await ask(panel, KIND_CANDIDATE.question);
        await expect(assistantTurns(panel)).toHaveCount(1);
        await ask(panel, REFUSAL_RESULT_COUNT.question);
        const turns = assistantTurns(panel);
        await expect(turns).toHaveCount(2);
        await expect(turns.nth(0).getByRole("button")).toHaveCount(0);
        const refusal = turns.nth(1).getByTestId("ask-dev-refusal");
        await expect(refusal).toHaveAttribute("data-axis", "result_count");
        await expect(
            refusal.getByRole("heading", { name: "No answer: too large to send" }),
        ).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("refusal-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        expect(await investigations(page)).toHaveLength(2);
        await refusal.getByTestId("ask-dev-refusal-reask").click();
        await expect(panel.getByText(/^Ask Dev · /u)).toHaveCount(3);

        const sent = await investigations(page);
        expect(sent).toHaveLength(3);
        // One narrower question, the viewer's own with a clause on it; no receipt rides on it.
        expect(sent[2]!.request).toHaveProperty(
            "question",
            "Which repositories have the most open work, top 5 only?",
        );
        expect(receiptsOf(sent[2]!)).toEqual({});
        // The refusal turn is read-only now: the re-ask cannot be sent a second time.
        await expect(panel.getByTestId("ask-dev-refusal-reask")).toHaveCount(0);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("wraps many offers inside the sheet", async ({ page }, testInfo) => {
        await seedStream(page, [answers(MANY_HANDLES)]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();

        const sheet = page.getByRole("dialog", { name: "Ask Dev", exact: true });
        await ask(sheet, MANY_HANDLES.question);
        const turn = assistantTurns(sheet).first();
        await expect(turn.getByRole("article", { name: "Answer" })).toHaveAttribute(
            "data-state",
            "clarification_required",
        );
        const offers = popup(sheet);
        const handles = MANY_HANDLES.structure_needs?.handle_options as Option[];
        // One question per page: step on to the one about the item, and count its offers.
        for (let step = 0; step < 6; step += 1) {
            if (
                (await offers.getByRole("heading", { level: 2 }).textContent()) ===
                "Which specific item?"
            )
                break;
            await offers.getByRole("button", { name: "Next question" }).click();
        }
        await expect(offers.getByRole("heading", { level: 2 })).toHaveText("Which specific item?");
        // Every handle is an option of its own, then the "Other" row.
        await expect(offers.getByRole("listitem")).toHaveCount(handles.length + 1);
        for (const handle of handles) {
            await expect(
                offers.getByRole("button", { name: handle.label, exact: true }),
            ).toHaveCount(1);
        }
        await page.screenshot({ path: testInfo.outputPath("clarification-mobile.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        for (const box of [offers, turn, sheet]) {
            expect(await box.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        }
    });

    test("a refusal reads in the sheet without sideways scroll", async ({ page }, testInfo) => {
        await seedStream(page, [refuses(REFUSAL_WINDOW)]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByRole("dialog", { name: "Ask Dev", exact: true });
        await ask(sheet, REFUSAL_WINDOW.question);
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
