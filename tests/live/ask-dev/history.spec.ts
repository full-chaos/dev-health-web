import {
    expect,
    request as requestContext,
    test,
    type BrowserContext,
    type Locator,
    type Page,
    type Route,
    type TestInfo,
} from "@playwright/test";

import {
    THREADS_PATH,
    threadDeletes,
    threadLists,
    threadReads,
    turnOrderMismatches,
} from "./history-views";
import { questionFor, type QuestionCase } from "./questions";
import {
    ACR,
    INVESTIGATIONS_PATH,
    ORACLE,
    ask,
    investigations,
    panel,
    secretsOf,
    signIn,
    type AcrCall,
} from "./stack";

/**
 * CHAOS-12232 (I-31's live half, CHAOS-11956): conversation history and reload recovery on the real
 * stack against real ACR, through the browser transport (no test-mode transport).
 *
 * - AC-2: a hard reload, then back and forward, on `/dev?thread=<id>` draws the thread's turns once
 *   each, in order, with no create, from the thread read; then the panel goes on with the same
 *   thread (the next question sends the same `X-ACR-Thread-ID`, read on the wire).
 * - AC-2: a hard reload while the thread's first turn is unfinished finds that turn through the
 *   thread read, with no create. The attach itself is CHAOS-12233's.
 * - AC-12: a delete in the panel takes the thread off `/dev`'s History, and a delete on `/dev` takes
 *   it off the panel's. A list or a read that ACR answered before the delete, and that arrives after
 *   it, does not bring the thread back: the case holds that answer in the browser (`page.route`)
 *   until the delete's 204.
 *
 * AC-3 (another principal of the same org) needs a second user: it is not here (CHAOS-12234's
 * `signInOther` owns that sign-in).
 */

const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const question = (name: QuestionCase): string => questionFor(name, NONCE);

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
let session: Session;

test.beforeAll(async ({ browser, baseURL }) => {
    expect(ORACLE, "ASK_DEV_LIVE_ORACLE is not set: no question may be sent").not.toBe("");
    expect(NONCE, "ASK_DEV_LIVE_NONCE is not set: run make-plan.ts for this run").not.toBe("");
    const oracle = await requestContext.newContext();
    try {
        expect((await oracle.get(`${ORACLE}/health`)).status(), "the oracle is not up").toBe(204);
    } finally {
        await oracle.dispose();
    }
    const context = await browser.newContext({ baseURL: baseURL!, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await signIn(page);
    session = await context.storageState();
    await context.close();
});

test.use({
    // Playwright reads a fixture's first argument, so it stays a destructuring pattern.
    storageState: async ({}, provide) => {
        await provide(session);
    },
});

// Web allows one user 6 silent authorizations a minute, and each case authorizes once.
test.afterEach(async ({ page }) => {
    await page.waitForTimeout(10_000);
});

const answers = (surface: Locator) => surface.getByRole("article", { name: "Answer" });
const activeStage = (surface: Locator) => surface.locator('li.chat__stage[data-state="active"]');
/** The transcript, not the rail: History also shows a question's text. */
const conversation = (surface: Locator) => surface.getByRole("log", { name: "Conversation" });
const historyRow = (surface: Locator, threadId: string) =>
    surface.locator(`[data-testid="ask-dev-history-row"][data-thread-id="${threadId}"]`);

/** The create's thread id: a prefixed 32-hex id. */
function threadOf(call: AcrCall): string {
    const value = secretsOf(call).headers["x-acr-thread-id"];
    expect(value, "the create sent no x-acr-thread-id").toMatch(/^[a-z]+_[0-9a-f]{32}$/u);
    return value!;
}

/** ACR's request id of each thread call and create, by method and path: the evidence the AC names. */
function watchRequestIds(
    page: Page,
): Array<{ method: string; path: string; status: number; requestId: string | null }> {
    const ids: Array<{ method: string; path: string; status: number; requestId: string | null }> =
        [];
    page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.origin !== ACR) return;
        if (!url.pathname.startsWith(THREADS_PATH) && url.pathname !== INVESTIGATIONS_PATH) return;
        ids.push({
            method: response.request().method(),
            path: url.pathname,
            status: response.status(),
            requestId: response.headers()["x-request-id"] ?? null,
        });
    });
    return ids;
}

/** What a call to ACR was: never its query, its headers or its body. */
const acrCalls = (calls: readonly AcrCall[]) =>
    calls.map(({ method, path, status }) => ({ method, path, status: status ?? null }));

async function attachEvidence(
    testInfo: TestInfo,
    evidence: Record<string, unknown>,
): Promise<void> {
    await testInfo.attach("history-evidence", {
        contentType: "application/json",
        body: JSON.stringify(evidence, null, 2),
    });
}

/** A wait that fails at once, naming its step, instead of running the test into its timeout. */
async function within<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${step}: nothing in ${String(ms)} ms`)), ms);
    });
    try {
        return await Promise.race([promise, late]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * The narrow panel's History view, on or off, by its toggle's own state: the rail's copy of the list
 * stays in the DOM while hidden (run 2), so the list's presence says nothing.
 */
async function showHistory(surface: Locator, on: boolean): Promise<void> {
    const toggle = surface.getByTestId("ask-dev-history-toggle");
    if (((await toggle.getAttribute("aria-pressed")) === "true") !== on) await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", on ? "true" : "false");
}

/** Deletes a conversation from a History list, as a user does: Delete, then the confirm. */
async function deleteFromHistory(surface: Locator, threadId: string): Promise<void> {
    const row = historyRow(surface, threadId);
    await row.getByTestId("ask-dev-history-delete").click();
    await row.getByTestId("ask-dev-history-confirm-delete").click();
}

/**
 * One answer ACR gave, held in the browser until `release` resolves, then handed to the page.
 * `outcome` says what became of it: `delivered` (the page got it, late) or `aborted` (the page had
 * cancelled the read itself, so the late answer could not reach it). A case must know which: a late
 * answer that never reached the page proves nothing about what the page does with one.
 */
function holdAnswer(release: Promise<void>): {
    handler: (route: Route) => Promise<void>;
    fetched: Promise<string>;
    outcome: Promise<string>;
} {
    let fetchedBody: (body: string) => void = () => undefined;
    const fetched = new Promise<string>((resolve) => {
        fetchedBody = resolve;
    });
    let settle: (outcome: string) => void = () => undefined;
    const outcome = new Promise<string>((resolve) => {
        settle = resolve;
    });
    let held = false;
    const handler = async (route: Route) => {
        // Only the read itself: a CORS preflight, and any later read, go on as they are.
        if (held || route.request().method() !== "GET") {
            await route.continue();
            return;
        }
        held = true;
        // ACR answers now, before the delete; the page gets that answer only after it.
        const response = await route.fetch();
        fetchedBody(await response.text());
        await release;
        try {
            await route.fulfill({ response });
            settle("delivered");
        } catch (error: unknown) {
            settle(
                `aborted: ${error instanceof Error ? error.message.split("\n")[0]! : String(error)}`,
            );
        }
    };
    return { handler, fetched, outcome };
}

test("AC-2: a hard reload, then back and forward, on /dev?thread draws the turns in order with no create; the panel goes on with the thread", async ({
    page,
}, testInfo) => {
    test.setTimeout(300_000);
    const requestIds = watchRequestIds(page);
    const { calls, surface } = await panel(page);
    const from = new URL(page.url()).pathname;
    const evidence: Record<string, unknown> = { from };
    const asked = [question("histTurn1"), question("histTurn2")];
    try {
        await ask(surface, asked[0]!);
        await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
        await ask(surface, asked[1]!);
        await expect(answers(surface)).toHaveCount(2, { timeout: 90_000 });
        expect(investigations(calls), "two questions are two creates").toHaveLength(2);
        const threadId = threadOf(investigations(calls)[0]!);
        expect(threadOf(investigations(calls)[1]!), "the second turn left the thread").toBe(
            threadId,
        );
        evidence.thread_id = threadId;

        const full = page.getByTestId("ask-dev-page");
        const restored = async (step: string) => {
            await expect(answers(full), `${step}: the turns are not drawn`).toHaveCount(2, {
                timeout: 30_000,
            });
            const transcript = (await conversation(full).textContent()) ?? "";
            expect(turnOrderMismatches(transcript, asked), step).toEqual([]);
            expect(investigations(calls), `${step}: a create was sent`).toHaveLength(2);
        };
        const reads = () =>
            threadReads(calls, threadId).filter((call) => call.status === 200).length;

        // A hard load of /dev?thread, then a hard reload: each draws the turns from a thread read.
        const beforeOpen = reads();
        await page.goto(`/dev?thread=${threadId}`, { waitUntil: "commit" });
        await restored("open /dev?thread");
        await expect
            .poll(reads, { message: "/dev?thread drew the turns with no thread read" })
            .toBeGreaterThan(beforeOpen);
        const beforeReload = reads();
        await page.reload({ waitUntil: "commit" });
        await restored("hard reload");
        await expect
            .poll(reads, { message: "the reload drew the turns with no thread read" })
            .toBeGreaterThan(beforeReload);

        // Back to the page the panel was on, then forward to the thread again.
        await page.goBack({ waitUntil: "commit" });
        await expect(page).toHaveURL((url) => url.pathname === from);
        const beforeForward = reads();
        await page.goForward({ waitUntil: "commit" });
        await expect(page).toHaveURL(
            (url) => url.pathname === "/dev" && url.searchParams.get("thread") === threadId,
        );
        await restored("back, then forward");
        await expect
            .poll(reads, { message: "forward drew the turns with no thread read" })
            .toBeGreaterThan(beforeForward);
        evidence.thread_reads = reads();

        // The panel goes on with the same thread: its next question sends the same thread id.
        await page.getByTestId("ask-dev-minimize").click();
        await expect(page).toHaveURL((url) => url.pathname !== "/dev");
        const panelSurface = page.getByTestId("ask-dev-panel");
        await expect(answers(panelSurface)).toHaveCount(2, { timeout: 30_000 });
        await ask(panelSurface, question("histTurn3"));
        await expect(answers(panelSurface)).toHaveCount(3, { timeout: 90_000 });
        expect(investigations(calls), "the follow-up was not one create").toHaveLength(3);
        evidence.follow_up_thread_same = threadOf(investigations(calls)[2]!) === threadId;
        expect(evidence.follow_up_thread_same, "the panel did not go on with the thread").toBe(
            true,
        );
    } finally {
        evidence.acr_calls = acrCalls(calls);
        evidence.request_ids = requestIds;
        await attachEvidence(testInfo, evidence);
    }
});

test("AC-2: a hard reload while the thread's first turn is unfinished finds it through the thread read, with no create", async ({
    page,
}, testInfo) => {
    test.setTimeout(240_000);
    const requestIds = watchRequestIds(page);
    const { calls, surface } = await panel(page);
    const evidence: Record<string, unknown> = {};
    try {
        // The oracle holds this question's interpretation 40 s: the turn is unfinished meanwhile.
        const sent = Date.now();
        await ask(surface, question("histHold"));
        await expect(activeStage(surface)).toBeVisible({ timeout: 15_000 });
        expect(investigations(calls)).toHaveLength(1);
        const threadId = threadOf(investigations(calls)[0]!);
        evidence.thread_id = threadId;
        const full = page.getByTestId("ask-dev-page");
        const reads = () =>
            threadReads(calls, threadId).filter((call) => call.status === 200).length;

        for (const step of ["open /dev?thread", "hard reload"] as const) {
            const before = reads();
            if (step === "open /dev?thread") {
                await page.goto(`/dev?thread=${threadId}`, { waitUntil: "commit" });
            } else {
                await page.reload({ waitUntil: "commit" });
            }
            await expect(
                conversation(full).getByText(question("histHold")),
                `${step}: the turn is not found`,
            ).toBeVisible({
                timeout: 30_000,
            });
            await expect
                .poll(reads, { message: `${step}: no thread read found the turn` })
                .toBeGreaterThan(before);
            // Unfinished when found: no answer yet, inside the oracle's 40 s hold.
            evidence[`${step}: seconds since sent`] = Math.round((Date.now() - sent) / 1000);
            evidence[`${step}: answers drawn`] = await answers(full).count();
            expect(
                evidence[`${step}: answers drawn`],
                `${step}: the turn was already finished`,
            ).toBe(0);
            expect(investigations(calls), `${step}: a create was sent`).toHaveLength(1);
        }
        expect(
            Date.now() - sent,
            "the reload came after the hold: the turn may have finished",
        ).toBeLessThan(40_000);
    } finally {
        evidence.acr_calls = acrCalls(calls);
        evidence.request_ids = requestIds;
        await attachEvidence(testInfo, evidence);
    }
});

test("AC-12: a delete in the panel takes the thread off /dev's History, and a delete on /dev takes it off the panel's", async ({
    page,
}, testInfo) => {
    test.setTimeout(300_000);
    const requestIds = watchRequestIds(page);
    const { calls, surface } = await panel(page);
    const from = new URL(page.url()).pathname;
    const evidence: Record<string, unknown> = { from };
    const lists = () => threadLists(calls).filter((call) => call.status === 200).length;
    try {
        // A conversation, deleted in the panel.
        await ask(surface, question("histDelPanel"));
        await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
        const panelThread = threadOf(investigations(calls)[0]!);
        await showHistory(surface, true);
        await expect(historyRow(surface, panelThread)).toHaveCount(1, { timeout: 30_000 });
        await deleteFromHistory(surface, panelThread);
        await expect(historyRow(surface, panelThread)).toHaveCount(0, { timeout: 30_000 });
        await expect
            .poll(() => threadDeletes(calls, panelThread).map((call) => call.status ?? null))
            .toEqual([204]);

        // /dev's History, read after the delete, does not list it.
        const beforeDev = lists();
        await page.goto("/dev", { waitUntil: "commit" });
        const full = page.getByTestId("ask-dev-page");
        await expect
            .poll(lists, { message: "/dev read no History list" })
            .toBeGreaterThan(beforeDev);
        await expect(full.getByTestId("ask-dev-history-row").first()).toBeVisible({
            timeout: 30_000,
        });
        evidence.panel_delete_absent_on_dev = (await historyRow(full, panelThread).count()) === 0;
        expect(
            evidence.panel_delete_absent_on_dev,
            "/dev still lists the thread the panel deleted",
        ).toBe(true);

        // The reverse: a conversation asked and deleted on /dev is gone from the panel's History.
        await ask(full, question("histDelDev"));
        await expect(answers(full)).toHaveCount(1, { timeout: 90_000 });
        const devThread = threadOf(investigations(calls)[1]!);
        // History reads again only when the conversation changes, and its read right after the
        // create can come before ACR stores the thread (run 4): a reload of the thread reads it now.
        await page.goto(`/dev?thread=${devThread}`, { waitUntil: "commit" });
        await expect(historyRow(full, devThread)).toHaveCount(1, { timeout: 30_000 });
        await deleteFromHistory(full, devThread);
        await expect(historyRow(full, devThread)).toHaveCount(0, { timeout: 30_000 });
        await expect
            .poll(() => threadDeletes(calls, devThread).map((call) => call.status ?? null))
            .toEqual([204]);

        const beforePanel = lists();
        await page.goto(from, { waitUntil: "commit" });
        await page.getByRole("button", { name: "Open Ask Dev" }).click({ timeout: 30_000 });
        const panelAgain = page.getByTestId("ask-dev-panel");
        await showHistory(panelAgain, true);
        await expect
            .poll(lists, { message: "the panel read no History list" })
            .toBeGreaterThan(beforePanel);
        await expect(panelAgain.getByTestId("ask-dev-history-row").first()).toBeVisible({
            timeout: 30_000,
        });
        evidence.dev_delete_absent_in_panel =
            (await historyRow(panelAgain, devThread).count()) === 0;
        expect(
            evidence.dev_delete_absent_in_panel,
            "the panel still lists the thread /dev deleted",
        ).toBe(true);
        expect(investigations(calls), "the deletes sent a create").toHaveLength(2);
    } finally {
        evidence.acr_calls = acrCalls(calls);
        evidence.request_ids = requestIds;
        await attachEvidence(testInfo, evidence);
    }
});

test("AC-12: a list or a read that ACR answered before a delete, and that arrives after it, does not bring the thread back", async ({
    page,
}, testInfo) => {
    test.setTimeout(300_000);
    const requestIds = watchRequestIds(page);
    const { calls, surface } = await panel(page);
    const evidence: Record<string, unknown> = {};
    try {
        // A late list: the panel's History is read again while a row is on screen; ACR's answer
        // (which still lists the thread) is held until the delete's 204.
        await ask(surface, question("histLateList"));
        await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
        const listThread = threadOf(investigations(calls)[0]!);
        // A new conversation first: a delete of the CURRENT thread reads the list again, which
        // aborts the held one (run 1), and a late answer that never arrives proves nothing.
        await showHistory(surface, true);
        await surface.getByTestId("ask-dev-history-new").click();
        await expect(answers(surface)).toHaveCount(0, { timeout: 15_000 });
        await showHistory(surface, true);
        await expect(historyRow(surface, listThread)).toBeVisible({ timeout: 30_000 });
        await showHistory(surface, false);
        let releaseList: () => void = () => undefined;
        const listReleased = new Promise<void>((resolve) => {
            releaseList = resolve;
        });
        const list = holdAnswer(listReleased);
        const isList = (url: URL) => url.origin === ACR && url.pathname === THREADS_PATH;
        await page.route(isList, list.handler);
        const listsBefore = threadLists(calls).filter((call) => call.status === 200).length;
        await showHistory(surface, true);
        const lateList = await within(list.fetched, 30_000, "showing History again read no list");
        await expect(historyRow(surface, listThread)).toBeVisible();
        evidence.late_list_held_the_thread = lateList.includes(listThread);
        expect(
            evidence.late_list_held_the_thread,
            "ACR's list no longer held the thread: nothing to bring back",
        ).toBe(true);
        await deleteFromHistory(surface, listThread);
        await expect
            .poll(() => threadDeletes(calls, listThread).map((call) => call.status ?? null))
            .toEqual([204]);
        releaseList();
        evidence.late_list_outcome = await within(
            list.outcome,
            30_000,
            "the held list was never handed over",
        );
        expect(
            evidence.late_list_outcome,
            "the held list did not reach the page: nothing late arrived",
        ).toBe("delivered");
        // The page's response event records the status a moment after the hand-over (run 3).
        await expect
            .poll(() => threadLists(calls).filter((call) => call.status === 200).length, {
                message: "the page recorded no answer to the held list",
                timeout: 10_000,
            })
            .toBeGreaterThan(listsBefore);
        await page.waitForTimeout(3_000);
        evidence.late_list_brought_back = await historyRow(surface, listThread).count();
        expect(
            evidence.late_list_brought_back,
            "the late list brought the deleted thread back",
        ).toBe(0);
        await page.unroute(isList, list.handler);

        // A late read, on /dev, whose rail stays on screen: a row is opened, ACR's read of it is held,
        // and the row is deleted before the read reaches the page.
        await page.goto("/dev", { waitUntil: "commit" });
        const full = page.getByTestId("ask-dev-page");
        await ask(full, question("histLateRead"));
        await expect(answers(full)).toHaveCount(1, { timeout: 90_000 });
        const readThread = threadOf(investigations(calls)[1]!);
        // A new conversation, so opening the row reads the thread (the rail's own button). It also
        // makes History read again: its read right after the create can come before ACR stores the
        // thread (run 4).
        await full.locator("button.rail__new").click();
        await expect(answers(full)).toHaveCount(0, { timeout: 15_000 });
        await expect(historyRow(full, readThread)).toHaveCount(1, { timeout: 30_000 });
        let releaseRead: () => void = () => undefined;
        const readReleased = new Promise<void>((resolve) => {
            releaseRead = resolve;
        });
        const read = holdAnswer(readReleased);
        const isRead = (url: URL) =>
            url.origin === ACR && url.pathname === `${THREADS_PATH}/${readThread}`;
        await page.route(isRead, read.handler);
        await historyRow(full, readThread).getByTestId("ask-dev-history-open").click();
        const lateRead = await within(read.fetched, 30_000, "opening the row read no thread");
        evidence.late_read_held_the_turn = lateRead.includes(question("histLateRead"));
        expect(
            evidence.late_read_held_the_turn,
            "ACR's read no longer held the turn: nothing to bring back",
        ).toBe(true);
        await deleteFromHistory(full, readThread);
        await expect
            .poll(() => threadDeletes(calls, readThread).map((call) => call.status ?? null))
            .toEqual([204]);
        releaseRead();
        // The opened thread is the selection: its delete resets it, and the store aborts its read
        // (run 1). Either way the measurement happened, and the case records which.
        evidence.late_read_outcome = await within(
            read.outcome,
            30_000,
            "the held read was never handed over",
        );
        await page.waitForTimeout(3_000);
        evidence.late_read_brought_back = {
            row: await historyRow(full, readThread).count(),
            turn: await conversation(full).getByText(question("histLateRead")).count(),
        };
        expect(
            evidence.late_read_brought_back,
            "the late read brought the deleted thread back",
        ).toEqual({
            row: 0,
            turn: 0,
        });
        await page.unroute(isRead, read.handler);
        expect(
            investigations(calls),
            "a create was sent other than the two questions",
        ).toHaveLength(2);
    } finally {
        evidence.acr_calls = acrCalls(calls);
        evidence.request_ids = requestIds;
        await attachEvidence(testInfo, evidence);
    }
});
