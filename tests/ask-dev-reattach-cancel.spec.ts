import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11957: Ask Dev reattach of a running investigation and explicit cancel. The test-mode transport
// (`conversation/testModeTransport.ts`) plays ACR's thread list, thread reads, result reads and
// deletes from session storage and records every call there; no request leaves the browser for ACR.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const SHOTS = process.env.ASK_DEV_REATTACH_SHOTS ?? "";
const KEYS = {
    stream: "ask-dev:test-mode-stream",
    status: "ask-dev:test-mode-status",
    results: "ask-dev:test-mode-results",
    calls: "ask-dev:test-mode-calls",
    threads: "ask-dev:test-mode-threads",
    list: "ask-dev:test-mode-thread-list",
    deleted: "ask-dev:test-mode-deleted",
    foreign: "ask-dev:test-mode-foreign",
    attach: "ask-dev:test-mode-attach",
    cancel: "ask-dev:test-mode-cancel",
} as const;
type Script = Partial<Record<keyof typeof KEYS, unknown>>;

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
const PARTIAL = capture("kiac_project_status_partial.event.json");
const PARTIAL_ID = String(PARTIAL.result_id);

const event = (seq: number, body: Record<string, unknown>) => ({
    schema_version: "context_fabric_investigation_event.v1",
    request_id: "request_e2e",
    seq,
    ...body,
});
const accepted = event(1, {
    type: "accepted",
    reserved_result_id: "result_reserved_e2e_0001",
    // Real clock: a restored run's deadline is started_at + budget + 30 s.
    started_at: new Date().toISOString(),
    budget_seconds: 300,
});

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
const errorEnvelope = (code: string, status: number) => ({
    schema_version: "error.v1",
    request_id: "req_e2e",
    error: { code, message: "e2e", http_status: status, retryable: true },
});
const status = (
    submission: string,
    state: "running" | "done" | "abandoned",
    resultId?: string,
) => ({
    schema_version: "context_fabric_submission_status.v1",
    submission_id: submission,
    state,
    reserved_result_id: "result_reserved_e2e_0001",
    ...(resultId === undefined ? {} : { result_id: resultId }),
    updated_at: LATER,
});

const THREAD_A = "thread_e2e_alpha_0001";

type Call = {
    kind: "investigate" | "status" | "read" | "list" | "thread" | "delete" | "attach" | "cancel";
    last_event_id?: number | null;
    thread_id?: string;
    submission_id?: string;
    result_id?: string;
};

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

const openPanel = async (page: Page, path: string | null = "/dashboard") => {
    // `null`: the page is already loaded (a reload); another goto would be a second page load.
    if (path !== null) await page.goto(path);
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const panel = page.getByRole("complementary", { name: "Ask Dev" });
    await expect(panel.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
    return panel;
};

const stage = (seq: number, name: string, state: "started" | "completed", elapsed: number) =>
    event(seq, { type: "stage", stage: name, state, elapsed_ms: elapsed });
const canceled = (seq: number) =>
    event(seq, {
        type: "error",
        reserved_result_id: "result_reserved_e2e_0001",
        error: errorEnvelope("canceled", 409),
    });
const result = (seq: number) => event(seq, { type: "result", result: PARTIAL });

/** A scripted stream with a pause before each event, so the test can click Stop mid-run. */
const slowRun = (last: Record<string, unknown>, delayMs = 3000) => ({
    events: [accepted, stage(2, "interpreting", "started", 100), last],
    delayMs,
});

const QUESTION = "Which projects are at risk?";
test.describe.configure({ mode: "serial" });

const kinds = async (page: Page, kind: Call["kind"]) =>
    (await calls(page)).filter((call) => call.kind === kind);

const ask = async (scope: ReturnType<Page["getByTestId"]>, text = QUESTION) => {
    const input = scope.getByRole("textbox", { name: "Ask a question" });
    await expect(input).toBeEnabled();
    await input.fill(text);
    await input.press("Enter");
};
const stopOf = (scope: ReturnType<Page["getByTestId"]>) =>
    scope.getByTestId("ask-dev-composer-stop");
const statusOf = (scope: ReturnType<Page["getByTestId"]>) =>
    scope.getByTestId("ask-dev-turn-status");
const turnIn = (scope: ReturnType<Page["getByTestId"]>, state: string) =>
    scope.locator(`[data-testid=ask-dev-turn][data-status=${state}]`);

/**
 * A run that this tab started, then lost to a reload: ask once on a stream that never ends, hand
 * ACR's thread body (one `running` turn) to the script, reload and open the panel. The hint the
 * store keeps for the thread (with its partition) comes from the real ask.
 */
const reloadDuringRun = async (page: Page, later: (submission: string) => Script) => {
    const panel = await openPanel(page);
    await ask(panel);
    await expect.poll(async () => (await investigations(page)).length).toBe(1);
    // The store keeps its thread hint once ACR accepted the run.
    await expect(statusOf(panel)).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => window.sessionStorage.getItem("ask-dev:thread")))
        .not.toBeNull();
    const [sent] = await investigations(page);
    const threadId = String(sent!.thread_id);
    const submission = String(sent!.submission_id);
    await rescript(page, "threads", {
        [threadId]: thread(threadId, [turn(submission, "running", { question: QUESTION })]),
    });
    for (const [key, value] of Object.entries(later(submission))) {
        await rescript(page, key as keyof typeof KEYS, value);
    }
    await page.reload();
    return { panel: await openPanel(page, null), submission };
};

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("1. a reload during a run reattaches: stages, then the answer, no new investigation", async ({
        page,
    }) => {
        await seed(page, { stream: [{ events: [accepted], then: "hold" }] });
        const panel = await openPanel(page);
        await ask(panel);
        await expect(statusOf(panel)).toBeVisible();
        await expect.poll(async () => (await investigations(page)).length).toBe(1);
        const [sent] = await investigations(page);
        const threadId = String(sent!.thread_id);
        const submission = String(sent!.submission_id);
        // The store keeps its thread hint once it has processed ACR's `accepted`, which can land
        // after the investigate call is recorded (CHAOS-12311): wait for it, never read it once.
        await expect
            .poll(async () =>
                JSON.parse(
                    (await page.evaluate(() => window.sessionStorage.getItem("ask-dev:thread"))) ??
                        "{}",
                ),
            )
            .toMatchObject({ thread_id: threadId });

        await rescript(page, "threads", {
            [threadId]: thread(threadId, [turn(submission, "running", { question: QUESTION })]),
        });
        await rescript(page, "results", { [PARTIAL_ID]: PARTIAL });
        await rescript(page, "attach", [
            {
                events: [
                    accepted,
                    stage(2, "interpreting", "started", 100),
                    stage(3, "interpreting", "completed", 200),
                    result(4),
                ],
                delayMs: 2500,
            },
        ]);
        const before = (await investigations(page)).length;
        await page.reload();
        const reopened = await openPanel(page, null);
        await expect(reopened.getByTestId("ask-dev-stages")).toBeVisible();
        await shot(page, "panel-reattached-progress-light", reopened);
        await expect(reopened.getByTestId("ask-dev-answer")).toBeVisible({ timeout: 20_000 });
        expect((await investigations(page)).length).toBe(before);
        // One page load after the reload: one cursorless attach.
        expect(await kinds(page, "attach")).toEqual([
            { kind: "attach", submission_id: submission, last_event_id: null },
        ]);
    });

    test("2. 410 on attach falls back to status, then replays the result", async ({ page }) => {
        await seed(page, {
            stream: [{ events: [accepted], then: "hold" }],
            results: { [PARTIAL_ID]: PARTIAL },
        });
        await page.goto("/dashboard");
        const { panel, submission } = await reloadDuringRun(page, (id) => ({
            status: [status(id, "done", PARTIAL_ID)],
        }));
        await expect(panel.getByTestId("ask-dev-answer")).toBeVisible({ timeout: 20_000 });
        expect((await investigations(page)).length).toBe(1);
        expect((await kinds(page, "attach")).length).toBeGreaterThan(0);
        expect(
            (await kinds(page, "status")).every((call) => call.submission_id === submission),
        ).toBe(true);
        expect((await kinds(page, "status")).length).toBeGreaterThan(0);
        expect((await kinds(page, "read")).length).toBeGreaterThan(0);
    });

    test("3. Stop, 202: Canceling… until the stream's canceled terminal", async ({ page }) => {
        await seed(page, { stream: [slowRun(canceled(3))], cancel: ["running"] });
        const panel = await openPanel(page);
        await ask(panel);
        await expect(panel.locator('[data-stage="interpreting"][data-state="active"]')).toBeVisible(
            {
                timeout: 15_000,
            },
        );
        await stopOf(panel).click();
        await expect(turnIn(panel, "canceling")).toBeVisible();
        await expect(statusOf(panel)).toHaveText("Canceling…");
        await shot(page, "panel-canceling-light", panel);
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        await expect(turnIn(panel, "canceled")).toBeVisible({ timeout: 20_000 });
        await shot(page, "panel-canceled-light", panel);
        expect((await investigations(page)).length).toBe(1);
        expect(await kinds(page, "cancel")).toHaveLength(1);
    });

    test("4. Stop, 202: a result that finishes first is the answer", async ({ page }) => {
        await seed(page, { stream: [slowRun(result(3))], cancel: ["running"] });
        const panel = await openPanel(page);
        await ask(panel);
        await expect(panel.locator('[data-stage="interpreting"][data-state="active"]')).toBeVisible(
            {
                timeout: 15_000,
            },
        );
        await stopOf(panel).click();
        await expect(turnIn(panel, "canceling")).toBeVisible();
        await expect(panel.getByTestId("ask-dev-answer")).toBeVisible({ timeout: 20_000 });
        expect((await investigations(page)).length).toBe(1);
        expect(await kinds(page, "cancel")).toHaveLength(1);
    });

    test("5. Stop, 204: the status says abandoned, so the turn is halted", async ({ page }) => {
        await seed(page, {
            stream: [
                { events: [accepted, stage(2, "interpreting", "started", 100)], then: "hold" },
            ],
            cancel: ["final"],
        });
        const panel = await openPanel(page);
        await ask(panel);
        const [sent] = await investigations(page);
        await rescript(page, "status", [status(String(sent!.submission_id), "abandoned")]);
        await expect(panel.locator('[data-stage="interpreting"][data-state="active"]')).toBeVisible(
            {
                timeout: 15_000,
            },
        );
        await stopOf(panel).click();
        await expect(turnIn(panel, "halted")).toBeVisible({ timeout: 20_000 });
        await expect(statusOf(panel)).toHaveText("Stopped or interrupted. Ask again.");
        await shot(page, "panel-halted-light", panel);
        expect(await kinds(page, "cancel")).toHaveLength(1);
        expect((await kinds(page, "status")).length).toBeGreaterThan(0);
    });

    test("6. Stop on a restored run, 409: it cannot be stopped; Stop is gone", async ({ page }) => {
        await seed(page, { stream: [{ events: [accepted], then: "hold" }] });
        await page.goto("/dashboard");
        const { panel } = await reloadDuringRun(page, () => ({
            attach: [
                { events: [accepted, stage(2, "interpreting", "started", 100)], then: "hold" },
            ],
            cancel: ["not_leased"],
        }));
        await expect(panel.locator('[data-stage="interpreting"][data-state="active"]')).toBeVisible(
            {
                timeout: 15_000,
            },
        );
        await stopOf(panel).click();
        const note = panel.getByTestId("ask-dev-turn-stop");
        await expect(note).toHaveText("This run cannot be stopped. It ends on its own.");
        await expect(stopOf(panel)).toHaveCount(0);
        await shot(page, "panel-not-leased-light", panel);
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        expect(await kinds(page, "cancel")).toHaveLength(1);
        expect((await investigations(page)).length).toBe(1);
    });

    test("7. with no cancel script Stop cancels at once, as before", async ({ page }) => {
        await seed(page, {
            stream: [
                { events: [accepted, stage(2, "interpreting", "started", 100)], then: "hold" },
            ],
        });
        const panel = await openPanel(page);
        await ask(panel);
        await expect(panel.locator('[data-stage="interpreting"][data-state="active"]')).toBeVisible(
            {
                timeout: 15_000,
            },
        );
        await stopOf(panel).click();
        await expect(turnIn(panel, "canceled")).toBeVisible();
        expect(await kinds(page, "cancel")).toHaveLength(1);
        expect((await investigations(page)).length).toBe(1);
    });

    test("8. /dev, dark: Canceling…", async ({ page }) => {
        await seed(page, { stream: [slowRun(canceled(3), 4000)], cancel: ["running"] }, "dark");
        await page.goto("/dev");
        const main = page.getByTestId("ask-dev-page");
        await ask(main);
        await expect(main.locator('[data-stage="interpreting"][data-state="active"]')).toBeVisible({
            timeout: 15_000,
        });
        await main.getByRole("button", { name: "Stop" }).click();
        await expect(main.getByTestId("chat-progress")).toContainText("Canceling…");
        await shot(page, "dev-canceling-dark");
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("9. the sheet shows Canceling…", async ({ page }) => {
        await seed(page, { stream: [slowRun(canceled(3), 4000)], cancel: ["running"] });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        await ask(sheet);
        await expect(sheet.locator('[data-stage="interpreting"][data-state="active"]')).toBeVisible(
            {
                timeout: 15_000,
            },
        );
        await stopOf(sheet).click();
        await expect(turnIn(sheet, "canceling")).toBeVisible();
        await expect(statusOf(sheet)).toHaveText("Canceling…");
        await shot(page, "sheet-mobile-canceling-light");
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
    });
});
