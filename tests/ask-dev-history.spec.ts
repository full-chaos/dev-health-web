import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11956: Ask Dev conversation history and reload recovery. The test-mode transport
// (`conversation/testModeTransport.ts`) plays ACR's thread list, thread reads, result reads and
// deletes from session storage and records every call there; no request leaves the browser for ACR.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");
const SHOTS = process.env.ASK_DEV_HISTORY_SHOTS ?? "";
const KEYS = {
    stream: "ask-dev:test-mode-stream",
    status: "ask-dev:test-mode-status",
    results: "ask-dev:test-mode-results",
    calls: "ask-dev:test-mode-calls",
    threads: "ask-dev:test-mode-threads",
    list: "ask-dev:test-mode-thread-list",
    deleted: "ask-dev:test-mode-deleted",
    foreign: "ask-dev:test-mode-foreign",
} as const;
type Script = Partial<Record<keyof typeof KEYS, unknown>>;

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
const PARTIAL = capture("kiac_project_status_partial.event.json");
const READINESS = capture("kiac_project_readiness_partial.event.json");
const PARTIAL_ID = String(PARTIAL.result_id);
const READINESS_ID = String(READINESS.result_id);

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
const quickRun = { events: [accepted, event(2, { type: "result", result: PARTIAL })] };

const AT = "2026-10-30T12:00:00Z";
const LATER = "2026-10-30T12:05:00Z";
const EXPIRES = "2030-01-01T00:00:00Z";

type TurnBody = Record<string, unknown>;
const turn = (submission: string, state: string, extra: TurnBody = {}): TurnBody => ({
    submission_id: submission,
    state,
    admitted_at: AT,
    updated_at: LATER,
    ...extra,
});
const thread = (id: string, turns: TurnBody[], extra: TurnBody = {}) => ({
    schema_version: "context_fabric_thread.v1",
    thread_id: id,
    retention_days: 30,
    turn_count: turns.length,
    created_at: AT,
    last_turn_at: LATER,
    expires_at: EXPIRES,
    turns,
    ...extra,
});
const summary = (id: string, turns = 1, extra: Record<string, unknown> = {}) => ({
    thread_id: id,
    retention_days: 30,
    turn_count: turns,
    created_at: AT,
    last_turn_at: LATER,
    expires_at: EXPIRES,
    ...extra,
});
const listPage = (...ids: string[]) => ({
    schema_version: "context_fabric_thread_list.v1",
    threads: ids.map((id) => summary(id)),
});
const errorEnvelope = (code: string, status: number) => ({
    schema_version: "error.v1",
    request_id: "req_e2e",
    error: { code, message: "e2e", http_status: status, retryable: true },
});
const status = (submission: string, state: "running" | "done", resultId?: string) => ({
    schema_version: "context_fabric_submission_status.v1",
    submission_id: submission,
    state,
    reserved_result_id: "result_reserved_e2e_0001",
    ...(resultId === undefined ? {} : { result_id: resultId }),
    updated_at: LATER,
});

const THREAD_A = "thread_e2e_alpha_0001";
const THREAD_B = "thread_e2e_bravo_0002";
const THREAD_X = "thread_e2e_unknown_9999";
const doneTurn = (submission: string, resultId: string, question: string) =>
    turn(submission, "done", { question, result_id: resultId });

type Call = {
    kind: "investigate" | "status" | "read" | "list" | "thread" | "delete";
    thread_id?: string;
    submission_id?: string;
    result_id?: string;
};

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seed(page: Page, script: Script, theme: "dark" | "light" = "light") {
    await page.addInitScript(
        ([keys, values, mode]) => {
            // Once per tab: a reload keeps what the run recorded.
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            window.localStorage.setItem("theme", mode);
            for (const [name, value] of Object.entries(values)) {
                window.sessionStorage.setItem(
                    keys[name as keyof typeof keys],
                    JSON.stringify(value),
                );
            }
        },
        [KEYS, { stream: [], ...script }, theme] as const,
    );
}

/** Replaces one script key mid-test, as a changing ACR would. */
const rescript = (page: Page, key: keyof typeof KEYS, value: unknown) =>
    page.evaluate(([name, json]) => window.sessionStorage.setItem(name, json), [
        KEYS[key],
        JSON.stringify(value),
    ] as const);

const calls = (page: Page) =>
    page.evaluate(
        (key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as Call[],
        KEYS.calls,
    );
const investigations = async (page: Page) =>
    (await calls(page)).filter((call) => call.kind === "investigate");

async function shot(page: Page, name: string, target?: ReturnType<Page["getByTestId"]>) {
    if (SHOTS === "") return;
    mkdirSync(SHOTS, { recursive: true });
    const path = join(SHOTS, `${name}.png`);
    if (target) await target.screenshot({ path });
    else await page.screenshot({ path });
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

const openPanel = async (page: Page, path = "/dashboard") => {
    await page.goto(path);
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const panel = page.getByRole("complementary", { name: "Ask Dev" });
    await expect(panel.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
    return panel;
};

/** The render's transcript on `/dev`. */
const transcriptOf = (page: Page) => page.getByRole("log", { name: "Conversation" });

/** Each turn's state in the transcript, in served order: an answer's status, or a turn's. */
const turnOrder = (page: Page) =>
    transcriptOf(page)
        .locator("article[data-state], [data-testid=chat-status]")
        .evaluateAll((nodes) =>
            nodes.map(
                (node) =>
                    node.getAttribute("data-state") ?? node.getAttribute("data-status") ?? "?",
            ),
        );

const historyRow = (page: Page, threadId: string) =>
    page.locator(`[data-testid=ask-dev-history-row][data-thread-id="${threadId}"]`);

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("1. a reload of /dev?thread=A restores its turns in served order, with no investigation", async ({
        page,
    }) => {
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [
                    doneTurn("sub_e2e_a_0001", PARTIAL_ID, "First question"),
                    turn("sub_e2e_a_0002", "done", {
                        question: "Second question",
                        result_withheld: true,
                    }),
                    turn("sub_e2e_a_0003", "done_unsaved", { question: "Third question" }),
                ]),
            },
            results: { [PARTIAL_ID]: PARTIAL },
            list: [listPage(THREAD_A)],
        });
        await page.goto(`/dev?thread=${THREAD_A}`);
        await expect(page.getByTestId("answer-panel")).toBeVisible();
        await expect.poll(() => turnOrder(page)).toEqual(["partial", "unavailable", "unsaved"]);
        await expect(page.getByText("This answer is not available to you now.")).toBeVisible();
        await shot(page, "dev-wide-restored-light");

        await page.reload();
        await expect(page.getByTestId("answer-panel")).toBeVisible();
        await expect.poll(() => turnOrder(page)).toEqual(["partial", "unavailable", "unsaved"]);
        await expect(historyRow(page, THREAD_A)).toHaveAttribute("data-current", "true");
        expect(await investigations(page)).toEqual([]);
        expect((await calls(page)).filter((c) => c.kind === "thread").length).toBeGreaterThan(1);
    });

    test("1b. /dev wide with the history column, dark", async ({ page }) => {
        await seed(
            page,
            {
                threads: {
                    [THREAD_A]: thread(THREAD_A, [
                        doneTurn("sub_e2e_a_0001", PARTIAL_ID, "First question"),
                    ]),
                    [THREAD_B]: thread(THREAD_B, [
                        doneTurn("sub_e2e_b_0001", READINESS_ID, "Other question"),
                    ]),
                },
                results: { [PARTIAL_ID]: PARTIAL, [READINESS_ID]: READINESS },
                list: [listPage(THREAD_A, THREAD_B)],
            },
            "dark",
        );
        await page.goto(`/dev?thread=${THREAD_A}`);
        await expect(page.getByTestId("ask-dev-history")).toBeVisible();
        await expect(page.getByTestId("answer-panel")).toBeVisible();
        await expect(page.getByTestId("ask-dev-history-row")).toHaveCount(2);
        await shot(page, "dev-wide-restored-dark");
    });

    test("2. back and forward between two conversations show A, B, A", async ({ page }) => {
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa")]),
                [THREAD_B]: thread(THREAD_B, [doneTurn("sub_e2e_b_0001", READINESS_ID, "Qb")]),
            },
            results: { [PARTIAL_ID]: PARTIAL, [READINESS_ID]: READINESS },
            list: [listPage(THREAD_A, THREAD_B)],
        });
        await page.goto("/dev");
        const transcript = transcriptOf(page);
        const showsA = async () => {
            await expect(page).toHaveURL(new RegExp(`thread=${THREAD_A}$`, "u"));
            await expect(historyRow(page, THREAD_A)).toHaveAttribute("data-current", "true");
            await expect(transcript.getByText("Qa", { exact: true })).toBeVisible();
        };
        const showsB = async () => {
            await expect(page).toHaveURL(new RegExp(`thread=${THREAD_B}$`, "u"));
            await expect(historyRow(page, THREAD_B)).toHaveAttribute("data-current", "true");
            await expect(transcript.getByText("Qb", { exact: true })).toBeVisible();
        };

        await historyRow(page, THREAD_A).getByTestId("ask-dev-history-open").click();
        await showsA();
        await historyRow(page, THREAD_B).getByTestId("ask-dev-history-open").click();
        await showsB();
        await page.goBack();
        await showsA();
        await page.goForward();
        await showsB();
        await page.goBack();
        await showsA();
        expect(await investigations(page)).toEqual([]);
    });

    test("3. a question asked in the panel is restored in the panel after a reload", async ({
        page,
    }) => {
        await seed(page, {
            stream: [quickRun],
            results: { [PARTIAL_ID]: PARTIAL },
        });
        const panel = await openPanel(page);
        const input = panel.getByRole("textbox", { name: "Ask a question" });
        await input.fill("Which projects are at risk?");
        await input.press("Enter");
        await expect(panel.getByTestId("answer-panel")).toBeVisible();
        const [sent] = await investigations(page);
        expect(sent?.thread_id).toBeTruthy();
        const threadId = String(sent!.thread_id);
        const hint = await page.evaluate(() => window.sessionStorage.getItem("ask-dev:thread"));
        expect(JSON.parse(hint ?? "{}")).toMatchObject({ thread_id: threadId });

        // ACR now serves the thread it admitted.
        const submission = String(sent!.submission_id);
        await rescript(page, "threads", {
            [threadId]: thread(threadId, [
                doneTurn(submission, PARTIAL_ID, "Which projects are at risk?"),
            ]),
        });
        const before = (await investigations(page)).length;
        await page.reload();
        const reopened = await openPanel(page, "/dashboard");
        await expect(reopened.getByTestId("answer-panel")).toBeVisible();
        expect((await investigations(page)).length).toBe(before);
        expect(
            (await calls(page)).filter((c) => c.kind === "thread" && c.thread_id === threadId)
                .length,
        ).toBeGreaterThan(0);
    });

    test("4. a reload during the first unfinished turn observes it, then shows the answer", async ({
        page,
    }) => {
        const submission = "sub_e2e_run_0001";
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [
                    turn(submission, "running", { question: "Is it still running?" }),
                ]),
            },
            status: [status(submission, "running"), status(submission, "done", PARTIAL_ID)],
            results: { [PARTIAL_ID]: PARTIAL },
            list: [listPage(THREAD_A)],
        });
        await page.goto(`/dev?thread=${THREAD_A}`);
        const observing = page.getByTestId("chat-progress");
        await expect(observing).toContainText(
            "This question was still running when the conversation was loaded.",
        );
        await shot(page, "turn-observing-light", observing);
        await expect(page.getByTestId("answer-panel")).toBeVisible({ timeout: 20_000 });
        expect(await investigations(page)).toEqual([]);
    });

    test("5. delete from the panel is gone on /dev, and delete on /dev is gone in the panel", async ({
        page,
    }) => {
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa")]),
                [THREAD_B]: thread(THREAD_B, [doneTurn("sub_e2e_b_0001", READINESS_ID, "Qb")]),
            },
            results: { [PARTIAL_ID]: PARTIAL, [READINESS_ID]: READINESS },
            list: [listPage(THREAD_A, THREAD_B)],
        });
        const panel = await openPanel(page);
        await panel.getByTestId("ask-dev-history-toggle").click();
        await expect(panel.getByTestId("ask-dev-history-row")).toHaveCount(2);
        await shot(page, "panel-history-light", panel);
        await historyRow(page, THREAD_B).getByTestId("ask-dev-history-delete").click();
        await expect(page.getByTestId("ask-dev-history-confirm")).toBeVisible();
        // Cancel keeps the row.
        await page.getByTestId("ask-dev-history-confirm-cancel").click();
        await expect(historyRow(page, THREAD_B)).toBeVisible();
        await historyRow(page, THREAD_B).getByTestId("ask-dev-history-delete").click();
        await page.getByTestId("ask-dev-history-confirm-delete").click();
        await expect(historyRow(page, THREAD_B)).toHaveCount(0);
        await expect(historyRow(page, THREAD_A)).toBeVisible();

        // Same tab: the full page no longer lists it.
        await page.goto("/dev");
        await expect(historyRow(page, THREAD_A)).toBeVisible();
        await expect(historyRow(page, THREAD_B)).toHaveCount(0);

        // Delete the current conversation on /dev: a fresh one, bare /dev.
        await historyRow(page, THREAD_A).getByTestId("ask-dev-history-open").click();
        await expect(page).toHaveURL(new RegExp(`thread=${THREAD_A}$`, "u"));
        await expect(page.getByTestId("answer-panel")).toBeVisible();
        await historyRow(page, THREAD_A).getByTestId("ask-dev-history-delete").click();
        await page.getByTestId("ask-dev-history-confirm-delete").click();
        await expect(page).toHaveURL(/\/dev$/u);
        await expect(historyRow(page, THREAD_A)).toHaveCount(0);
        await expect(page.getByTestId("answer-panel")).toHaveCount(0);
        await expect(page.getByText("Your conversation will appear here.")).toBeVisible();

        // And in the panel, in the same tab.
        const again = await openPanel(page);
        await again.getByTestId("ask-dev-history-toggle").click();
        await expect(again.getByTestId("ask-dev-history-empty")).toBeVisible();
        const deleted = await page.evaluate(
            (key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as string[],
            KEYS.deleted,
        );
        expect([...deleted].sort()).toEqual([THREAD_A, THREAD_B]);
    });

    // GAP: the old list mounted when History opened, so it read then (AskDevHistory.tsx:191-193 at
    // 98600f25). ask-dev's AskDevChat reads on mount and once per conversation id (AskDevChat.tsx
    // effect on `chat.history.load()`), never on opening History: the list read before this test
    // scripted it stays, so the running conversation has no row and no delete.
    test.fixme("5b. the confirm of the running conversation says delete does not stop it", async ({
        page,
    }) => {
        await seed(page, { stream: [{ events: [accepted], then: "hold" }] });
        const panel = await openPanel(page);
        const input = panel.getByRole("textbox", { name: "Ask a question" });
        await input.fill("Which projects are at risk?");
        await input.press("Enter");
        await expect(panel.getByTestId("chat-progress")).toBeVisible();
        const [sent] = await investigations(page);
        const threadId = String(sent!.thread_id);
        await rescript(page, "list", [listPage(threadId)]);
        await panel.getByTestId("ask-dev-history-toggle").click();
        await historyRow(page, threadId).getByTestId("ask-dev-history-delete").click();
        await expect(page.getByTestId("ask-dev-history-confirm-running")).toHaveText(
            "This does not stop the running question.",
        );
        await shot(page, "panel-delete-confirm-running-light", panel);
    });

    // GAP: this test closes and reopens History to force a second list read (AskDevHistory.tsx:191-193
    // at 98600f25 read on each mount). ask-dev's AskDevChat does not read again on the toggle
    // (AskDevChat.tsx effect on `chat.history.load()`), so a late list cannot be provoked from the UI.
    test.fixme("6. a late list after a delete does not bring the row back", async ({ page }) => {
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa")]),
            },
            results: { [PARTIAL_ID]: PARTIAL },
            // ACR keeps listing both: the last page repeats.
            list: [listPage(THREAD_A, THREAD_B)],
        });
        const panel = await openPanel(page);
        const toggle = panel.getByTestId("ask-dev-history-toggle");
        await toggle.click();
        await expect(panel.getByTestId("ask-dev-history-row")).toHaveCount(2);
        await historyRow(page, THREAD_B).getByTestId("ask-dev-history-delete").click();
        await page.getByTestId("ask-dev-history-confirm-delete").click();
        await expect(historyRow(page, THREAD_B)).toHaveCount(0);

        const listsBefore = (await calls(page)).filter((c) => c.kind === "list").length;
        await toggle.click();
        await toggle.click();
        await expect(historyRow(page, THREAD_A)).toBeVisible();
        await expect
            .poll(async () => (await calls(page)).filter((c) => c.kind === "list").length)
            .toBeGreaterThan(listsBefore);
        await expect(historyRow(page, THREAD_B)).toHaveCount(0);
    });

    test("7. an unknown thread is unavailable, locked, and New conversation clears the URL", async ({
        page,
    }) => {
        await seed(page, { list: [listPage(THREAD_A)] });
        await page.goto(`/dev?thread=${THREAD_X}`);
        await expect(page.getByTestId("ask-dev-conversation-unavailable")).toBeVisible();
        await expect(page.getByTestId("ask-dev-composer-locked")).toBeVisible();
        await shot(page, "dev-unavailable-light");
        expect(await axeViolations(page, "[data-testid=ask-dev-page]")).toEqual([]);

        await page.getByTestId("ask-dev-conversation-new").click();
        await expect(page).toHaveURL(/\/dev$/u);
        await expect(page.getByTestId("ask-dev-conversation-unavailable")).toHaveCount(0);
        await expect(page.getByTestId("ask-dev-composer-locked")).toHaveCount(0);
        await expect(page.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
        expect(await investigations(page)).toEqual([]);
    });

    test("8. a foreign thread's delete hides the row and leaves the owner's thread alone", async ({
        page,
    }) => {
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa")]),
            },
            results: { [PARTIAL_ID]: PARTIAL },
            list: [listPage(THREAD_A, THREAD_B)],
            foreign: [THREAD_B],
        });
        await page.goto(`/dev?thread=${THREAD_A}`);
        await expect(page.getByTestId("answer-panel")).toBeVisible();
        await historyRow(page, THREAD_B).getByTestId("ask-dev-history-delete").click();
        await page.getByTestId("ask-dev-history-confirm-delete").click();
        await expect(historyRow(page, THREAD_B)).toHaveCount(0);
        expect((await calls(page)).filter((c) => c.kind === "delete")).toEqual([
            { kind: "delete", thread_id: THREAD_B },
        ]);
        // Nothing was removed on ACR's side, and the shown thread is unchanged.
        expect(
            await page.evaluate((key) => window.sessionStorage.getItem(key), KEYS.deleted),
        ).toBeNull();
        await expect(page).toHaveURL(new RegExp(`thread=${THREAD_A}$`, "u"));
        await expect(historyRow(page, THREAD_A)).toHaveAttribute("data-current", "true");
        await expect(page.getByTestId("answer-panel")).toBeVisible();
    });

    test("9. a thread body that breaks the contract is read_failed, and Try again restores it", async ({
        page,
    }) => {
        const good = thread(THREAD_A, [doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa")]);
        const broken = thread(THREAD_A, [
            { ...doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa"), surprise: true },
        ]);
        await seed(page, {
            threads: { [THREAD_A]: broken },
            results: { [PARTIAL_ID]: PARTIAL },
            list: [listPage(THREAD_A)],
        });
        await page.goto(`/dev?thread=${THREAD_A}`);
        await expect(page.getByTestId("ask-dev-conversation-read-failed")).toBeVisible();
        await shot(page, "dev-read-failed-light");
        await rescript(page, "threads", { [THREAD_A]: good });
        await page.getByTestId("ask-dev-conversation-retry").click();
        await expect(page.getByTestId("answer-panel")).toBeVisible();
        await expect(page.getByTestId("ask-dev-conversation-read-failed")).toHaveCount(0);
        expect(await investigations(page)).toEqual([]);
    });

    test("10. a restored turn whose result read fails offers Load again", async ({ page }) => {
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa")]),
            },
            results: {
                [PARTIAL_ID]: {
                    refuse: { status: 503, error: errorEnvelope("service_unavailable", 503) },
                },
            },
            list: [listPage(THREAD_A)],
        });
        await page.goto(`/dev?thread=${THREAD_A}`);
        const failed = page.locator("[data-testid=chat-status][data-status=restore_failed]");
        await expect(failed).toBeVisible();
        await shot(page, "turn-restore-failed-light", failed);
        await rescript(page, "results", { [PARTIAL_ID]: PARTIAL });
        await failed.getByRole("button", { name: "Load again" }).click();
        await expect(page.getByTestId("answer-panel")).toBeVisible();
        await expect(failed).toHaveCount(0);
        expect(await investigations(page)).toEqual([]);
    });

    test("11. a done turn without a question says so", async ({ page }) => {
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [turn("sub_e2e_a_0001", "done_unsaved")]),
            },
            list: [listPage(THREAD_A)],
        });
        await page.goto(`/dev?thread=${THREAD_A}`);
        const note = page.getByTestId("ask-dev-turn-question-not-recorded");
        await expect(note).toBeVisible();
        await expect(note).toHaveText("Question not recorded");
        await shot(page, "turn-question-not-recorded-light", transcriptOf(page));
    });

    test("12. the history list has no axe violations", async ({ page }) => {
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa")]),
            },
            results: { [PARTIAL_ID]: PARTIAL },
            list: [listPage(THREAD_A, THREAD_B)],
        });
        await page.goto(`/dev?thread=${THREAD_A}`);
        await expect(page.getByTestId("ask-dev-history-row")).toHaveCount(2);
        expect(await axeViolations(page, "[data-testid=ask-dev-history]")).toEqual([]);
        await historyRow(page, THREAD_B).getByTestId("ask-dev-history-delete").click();
        await expect(page.getByTestId("ask-dev-history-confirm")).toBeVisible();
        expect(await axeViolations(page, "[data-testid=ask-dev-history]")).toEqual([]);
    });
});

test.describe("narrow (700px)", () => {
    test.use({ viewport: { width: 700, height: 900 } });

    // CHAOS-12383: ask-dev's render follows its container's width (860px), not the viewport's.
    test("the history is behind a toggle at the render's narrow width", async ({ page }) => {
        await seed(page, {
            threads: {
                [THREAD_A]: thread(THREAD_A, [doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa")]),
            },
            results: { [PARTIAL_ID]: PARTIAL },
            list: [listPage(THREAD_A, THREAD_B)],
        });
        await page.goto(`/dev?thread=${THREAD_A}`);
        const toggle = page.getByTestId("ask-dev-history-toggle");
        await expect(toggle).toBeVisible();
        await expect(page.getByTestId("ask-dev-history-row").first()).toBeHidden();
        await toggle.click();
        await expect(page.getByTestId("ask-dev-history-row")).toHaveCount(2);
        await expect(page.getByTestId("ask-dev-history-row").first()).toBeVisible();
        await shot(page, "dev-narrow-disclosure-light");
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the sheet shows the history and a restored conversation", async ({ page }) => {
        await seed(page, { stream: [quickRun], results: { [PARTIAL_ID]: PARTIAL } });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        const input = sheet.getByRole("textbox", { name: "Ask a question" });
        await expect(input).toBeEnabled();
        await input.fill("Which projects are at risk?");
        await input.press("Enter");
        await expect(sheet.getByTestId("answer-panel")).toBeVisible();
        const [sent] = await investigations(page);
        const threadId = String(sent!.thread_id);
        await rescript(page, "threads", {
            [threadId]: thread(threadId, [
                doneTurn(String(sent!.submission_id), PARTIAL_ID, "Which projects are at risk?"),
            ]),
        });
        await rescript(page, "list", [listPage(threadId, THREAD_B)]);
        const before = (await investigations(page)).length;

        await page.reload();
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        await expect(sheet.getByTestId("answer-panel")).toBeVisible();
        await shot(page, "sheet-mobile-restored-light");
        expect((await investigations(page)).length).toBe(before);

        await sheet.getByTestId("ask-dev-history-toggle").click();
        await expect(sheet.getByTestId("ask-dev-history-row")).toHaveCount(2);
        await shot(page, "sheet-mobile-history-light");
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
    });
});

// CHAOS-12238: a row is titled by its thread's first question when ACR serves one (its switch on),
// and keeps the date-and-count label when it serves none (the switch off, or a legacy turn).
const FIRST_QUESTION =
    "Which teams are overloaded this quarter, and what is driving the extra review load on the platform repositories?";
const titledList = {
    schema_version: "context_fabric_thread_list.v1",
    threads: [summary(THREAD_A, 3, { first_question: FIRST_QUESTION }), summary(THREAD_B, 1)],
};

test.describe("first question as the row title (CHAOS-12238)", () => {
    test.describe("desktop (1280px)", () => {
        test.use({ viewport: { width: 1280, height: 900 } });

        test("a served first question titles its row; a row without one keeps its date label", async ({
            page,
        }, testInfo) => {
            await seed(page, {
                threads: {
                    [THREAD_A]: thread(THREAD_A, [doneTurn("sub_e2e_a_0001", PARTIAL_ID, "Qa")]),
                },
                results: { [PARTIAL_ID]: PARTIAL },
                list: [titledList],
            });
            await page.goto("/dev");
            const titled = historyRow(page, THREAD_A);
            const legacy = historyRow(page, THREAD_B);
            const question = titled.getByTestId("ask-dev-history-question");
            await expect(question).toHaveText(FIRST_QUESTION);
            await expect(titled.getByTestId("ask-dev-history-meta")).toHaveText(/ · 3 questions$/u);
            await expect(legacy.getByTestId("ask-dev-history-question")).toHaveCount(0);
            await expect(legacy.getByTestId("ask-dev-history-open")).toHaveText(
                /^Conversation of .+ · 1 question$/u,
            );
            // One line at rest: the question is cut, not wrapped.
            expect(await question.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(
                true,
            );
            await page.screenshot({
                path: testInfo.outputPath("history-first-question-desktop.png"),
            });

            // The full text on focus (and on hover): the line wraps instead of being cut.
            await titled.getByTestId("ask-dev-history-open").focus();
            await page.keyboard.press("Shift+Tab");
            await page.keyboard.press("Tab");
            await expect(titled.getByTestId("ask-dev-history-open")).toBeFocused();
            expect(await question.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
                true,
            );
            await page.screenshot({
                path: testInfo.outputPath("history-first-question-focused-desktop.png"),
            });
            expect(await axeViolations(page, "[data-testid=ask-dev-history]")).toEqual([]);
        });
    });

    test.describe("mobile (390px)", () => {
        test.use({ viewport: { width: 390, height: 844 } });

        test("the sheet lists the titled row and the legacy row, with no sideways scroll", async ({
            page,
        }, testInfo) => {
            await seed(page, { list: [titledList] });
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            const sheet = page.getByTestId("ask-dev-sheet");
            await expect(sheet.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
            await sheet.getByTestId("ask-dev-history-toggle").click();
            await expect(sheet.getByTestId("ask-dev-history-row")).toHaveCount(2);
            await expect(
                historyRow(page, THREAD_A).getByTestId("ask-dev-history-question"),
            ).toHaveText(FIRST_QUESTION);
            await page.screenshot({
                path: testInfo.outputPath("history-first-question-mobile.png"),
            });
            expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
            expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        });
    });
});
