import {
    expect,
    request as requestContext,
    test,
    type BrowserContext,
    type Locator,
    type Page,
    type TestInfo,
} from "@playwright/test";

import { startFaultProxy, type FaultMode, type FaultProxy } from "./fault-proxy";
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
    watchAcr,
    authorize,
    type AcrCall,
} from "./stack";

/**
 * CHAOS-12192: the conversation store's live streams and its status-polling recovery, on the real
 * stack against real ACR, through the browser transport (no mock transport).
 *
 * - AC1: the store owns the stream. Closing the panel keeps the run; sign-out ends it. A sign-out
 *   ends ACR's run only if something cancels it: the test reads the submission's end from ACR
 *   with a new session of the same user (`abandoned`: the run was ended; `done`: it ran on).
 * - AC2: with the run lease off (a window), a drop is recovered by the submission status. The
 *   proxy mode `end-after-accepted-keep-acr` ends the browser's stream and keeps ACR's open, so
 *   the run goes on and the store must poll it; `cut-after-first-stage` drops ACR too.
 * - AC3: the thread header on the wire, read back from ACR's own thread record.
 *
 * The routed suite's guards hold here: nothing is sent unless the oracle answers, and only
 * `questions.ts`'s questions are asked, with this run's nonce. Org switch, impersonation change
 * and `done_unsaved` are proven at unit level only (lead ruling 2026-11-02 on CHAOS-12192).
 */

const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const question = (name: QuestionCase): string => questionFor(name, NONCE);

/** `CHAT_STATUS_COPY` (ask-dev `src/render/chat-copy.ts`): an abandoned run's words. */
const INTERRUPTED = "Interrupted — ask again";

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

/**
 * A stack-wide window, set, read back and restored by the stack owner. Empty: the cases that need
 * no window.
 */
const WINDOW = process.env.ASK_DEV_LIVE_WINDOW ?? "";
const WINDOWS = ["lease_off"] as const;

test.beforeEach(({}, testInfo) => {
    const wants = WINDOWS.find((name) => testInfo.title.startsWith(`window ${name}:`)) ?? "";
    test.skip(
        wants !== WINDOW,
        wants === "" ? `runs with no window, not ${WINDOW}` : `runs only in the ${wants} window`,
    );
});

// Each case makes one silent authorization, in its own tab: web allows one user 6 a minute.
test.afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
});

/** What a call to ACR was: never its query, its headers or its body. */
const acrCalls = (calls: readonly AcrCall[]) =>
    calls.map(({ method, path, status }) => ({ method, path, status: status ?? null }));

async function report(testInfo: TestInfo, name: string, data: unknown) {
    await testInfo.attach(name, {
        contentType: "application/json",
        body: JSON.stringify(data, null, 2),
    });
}

const answers = (surface: Locator) => surface.getByRole("article", { name: "Answer" });

/** The first stage is running: ACR admitted the run and its stream is open. */
const running = (surface: Locator) =>
    expect(surface.locator('li.chat__stage[data-state="active"]')).toBeVisible({
        timeout: 15_000,
    });

/** One of the create's correlation headers: a prefixed 32-hex id. */
function headerOf(call: AcrCall, name: "x-acr-thread-id" | "x-acr-submission-id"): string {
    const value = secretsOf(call).headers[name];
    expect(value, `the create sent no ${name}`).toMatch(/^[a-z]+_[0-9a-f]{32}$/u);
    return value!;
}

/** ACR's own read, with the headers of a call the page made (its bearer): never logged. */
async function acrRead<T>(from: AcrCall, path: string): Promise<{ status: number; body: T }> {
    const headers = secretsOf(from).headers;
    const response = await fetch(`${ACR}${path}`, {
        headers: {
            authorization: headers.authorization!,
            "x-acr-resource": headers["x-acr-resource"] ?? ACR,
            "x-acr-client-version": headers["x-acr-client-version"] ?? "0.1.0",
            accept: "application/json",
        },
    });
    const text = await response.text();
    let body: unknown = null;
    try {
        body = JSON.parse(text);
    } catch {
        body = null;
    }
    return { status: response.status, body: body as T };
}

type ThreadRecord = { turn_count: number; turns: { submission_id: string; result_id?: string }[] };
type SubmissionRecord = { state: string; result_id?: string };

/** conversationStore.ts `THREAD_HINT_KEY`: this tab's restore hint, in session storage. */
const THREAD_HINT_KEY = "ask-dev:thread";

const statusPath = (submission: string) => `${INVESTIGATIONS_PATH}/submissions/${submission}`;

/** The turn's end: `answer`, or its `chat-status` panel's `data-status` and words. */
async function endState(surface: Locator, timeout: number) {
    const answer = answers(surface);
    const status = surface.getByTestId("chat-status");
    let state = "pending";
    await expect
        .poll(
            async () => {
                if ((await answer.count()) > 0) state = "answer";
                else if ((await status.count()) > 0) {
                    state = (await status.last().getAttribute("data-status")) ?? "no data-status";
                } else state = "pending";
                return state;
            },
            { timeout, intervals: [250], message: `the turn did not end in ${String(timeout)} ms` },
        )
        .not.toBe("pending");
    const words =
        state === "answer"
            ? ""
            : ((await status.last().locator(".chat__status-words").textContent()) ?? "");
    return { state, words };
}

/** When the page sent each request to `path` (epoch ms on the runner's clock). */
function timesOf(page: Page, path: () => string | undefined): number[] {
    const times: number[] = [];
    page.on("request", (request) => {
        const want = path();
        if (want !== undefined && new URL(request.url()).pathname === want) times.push(Date.now());
    });
    return times;
}

/** Sends the panel's creates from the `from`-th on (1-based) to the proxy; ACR otherwise. */
async function divert(page: Page, proxy: FaultProxy, from = 1) {
    let seen = 0;
    await page.route(`${ACR}${INVESTIGATIONS_PATH}`, async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        seen += 1;
        if (seen < from) return route.fallback();
        return route.continue({ url: `${proxy.origin}${INVESTIGATIONS_PATH}` });
    });
}

async function withProxy(
    mode: FaultMode,
    testInfo: TestInfo,
    body: (proxy: FaultProxy) => Promise<void>,
) {
    const proxy = await startFaultProxy(ACR, mode);
    try {
        await body(proxy);
    } finally {
        await report(testInfo, "proxy", { fault: proxy.mode, exchanges: proxy.record() });
        await proxy.close();
    }
}

/**
 * Sign-out mid-run: the page leaves, the next session of the same user shows none of it, and
 * ACR's record says how the run ended. Run in both lease states (lead ruling 2026-11-02).
 */
async function signOutCase(page: Page, testInfo: TestInfo, name: QuestionCase) {
    test.setTimeout(240_000);
    const { calls, surface } = await panel(page);
    const created = page.waitForResponse(
        (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === INVESTIGATIONS_PATH,
    );
    await ask(surface, question(name));
    const requestId = (await created).headers()["x-request-id"] ?? null;
    await running(surface);
    const submission = headerOf(investigations(calls)[0]!, "x-acr-submission-id");
    await page.getByRole("button", { name: "Account options" }).click();
    await page.getByRole("button", { name: /sign out/iu }).click();
    const signedOutAt = new Date().toISOString();
    await page.waitForURL((url) => url.pathname.startsWith("/auth/"), { timeout: 30_000 });

    // Whether this tab still names the signed-out conversation (only that a hint is there).
    const hintAfterSignOut = await page.evaluate(
        (key) => window.sessionStorage.getItem(key) !== null,
        THREAD_HINT_KEY,
    );

    // The same user again: the same principal, so ACR serves that submission's record. History's
    // read during the authorization is the new session's call with a bearer.
    await signIn(page);
    const againCalls = watchAcr(page);
    await authorize(page);
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const again = page.getByTestId("ask-dev-panel");
    await expect(again).toBeVisible();
    await page.waitForTimeout(3_000);
    const oldTurnShown = await again.getByText(question(name)).count();
    const composer = again.getByRole("textbox", { name: "Ask a question" });
    const composerDisabled = await composer.isDisabled();
    // What the new session's panel shows (local evidence; no token is on the page).
    const panelWords = (await again.innerText()).replace(/\s+/gu, " ").slice(0, 400);
    await testInfo.attach("after-sign-in.png", {
        body: await page.screenshot(),
        contentType: "image/png",
    });
    const reader = againCalls.findLast((call) => call.hasBearer);
    expect(reader, "the new session made no ACR call with a bearer").toBeDefined();
    // The "Hold" plan entry runs 40 s; a run nothing ended is `done` within about a minute.
    let record: SubmissionRecord | null = null;
    await expect
        .poll(
            async () => {
                const read = await acrRead<SubmissionRecord>(reader!, statusPath(submission));
                record = read.status === 200 ? read.body : null;
                return record?.state ?? `HTTP ${String(read.status)}`;
            },
            { timeout: 120_000, intervals: [3_000], message: "the submission never ended" },
        )
        .not.toBe("running");
    await page.waitForTimeout(3_000);
    const composerDisabledAfterEnd = await composer.isDisabled();
    await report(testInfo, "sign-out-evidence", {
        request_id: requestId,
        submission_id: submission,
        signed_out_at: signedOutAt,
        hint_after_sign_out: hintAfterSignOut,
        old_turn_shown_after_sign_in: oldTurnShown,
        composer_disabled_after_sign_in: composerDisabled,
        composer_disabled_after_the_run_ended: composerDisabledAfterEnd,
        panel_words_after_sign_in: panelWords,
        submission_state: (record as SubmissionRecord | null)?.state ?? null,
        acr_calls: acrCalls(calls),
    });
    expect.soft(oldTurnShown, "the new session shows the signed-out session's turn").toBe(0);
    expect
        .soft(composerDisabledAfterEnd, "the new session cannot ask: its composer is disabled")
        .toBe(false);
    expect(
        (record as SubmissionRecord | null)?.state,
        "after sign-out ACR's run was not ended: it ran on",
    ).toBe("abandoned");
}

test.describe("the store owns the live stream (AC1)", () => {
    test("closing the panel mid-run keeps the run: one POST, and its answer on reopen", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const { calls, surface } = await panel(page);
        await ask(surface, question("close"));
        await running(surface);
        await surface.getByTestId("ask-dev-panel-close").click();
        await expect(surface).toHaveCount(0);
        // The run is ACR's "Hold" entry (40 s): it is still running while the panel is closed.
        await page.waitForTimeout(5_000);
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
        await report(testInfo, "close-evidence", { acr_calls: acrCalls(calls) });
        expect(investigations(calls), "closing or reopening sent the question again").toHaveLength(
            1,
        );
    });

    test("sign-out mid-run (run lease on) ends ACR's run", async ({ page }, testInfo) => {
        await signOutCase(page, testInfo, "signOutLeaseOn");
    });

    test("window lease_off: sign-out mid-run ends ACR's run", async ({ page }, testInfo) => {
        await signOutCase(page, testInfo, "signOutLeaseOff");
    });
});

test.describe("recovery through the submission status, run lease off (AC2)", () => {
    test("window lease_off: a drop ACR does not see is polled every 3 s, then replayed", async ({
        page,
    }, testInfo) => {
        test.setTimeout(240_000);
        await withProxy("end-after-accepted-keep-acr", testInfo, async (proxy) => {
            await divert(page, proxy);
            const { calls, surface } = await panel(page);
            // Set once the create is seen; the poll watcher reads it.
            const watched: { submission?: string } = {};
            const polls = timesOf(page, () =>
                watched.submission === undefined ? undefined : statusPath(watched.submission),
            );
            await ask(surface, question("poll"));
            await expect.poll(() => investigations(calls).length).toBe(1);
            const submission = headerOf(investigations(calls)[0]!, "x-acr-submission-id");
            watched.submission = submission;
            await expect(answers(surface)).toHaveCount(1, { timeout: 150_000 });

            const statusReads = calls.filter(
                (call) => call.method === "GET" && call.path === statusPath(submission),
            );
            const replays = calls.filter((call) =>
                /^\/api\/v1\/context-fabric\/investigations\/result_[0-9a-f]{32}$/u.test(call.path),
            );
            const end = await acrRead<SubmissionRecord>(statusReads[0]!, statusPath(submission));
            const gaps = polls.slice(1).map((at, index) => at - polls[index]!);
            await report(testInfo, "poll-evidence", {
                polls: polls.length,
                gaps_ms: gaps,
                final_state: end.body?.state ?? null,
                acr_calls: acrCalls(calls),
            });
            expect(proxy.exchanges[0]?.faulted, "the proxy did not end the stream").toBe(true);
            expect(proxy.exchanges[0]?.acrTerminal, "ACR's run did not go on").toBe("result");
            expect(investigations(calls), "the question was sent again").toHaveLength(1);
            expect(statusReads.length, "the store did not poll the status").toBeGreaterThanOrEqual(
                3,
            );
            expect(
                statusReads.every((call) => call.hasBearer),
                "a status poll went without its bearer",
            ).toBe(true);
            for (const gap of gaps) {
                expect(
                    gap,
                    `a status poll came ${String(gap)} ms after the one before`,
                ).toBeGreaterThanOrEqual(2_900);
                expect(gap).toBeLessThan(5_000);
            }
            expect(end.body?.state).toBe("done");
            expect(replays.map((call) => call.path)).toEqual([
                `${INVESTIGATIONS_PATH}/${end.body!.result_id!}`,
            ]);
        });
    });

    test("window lease_off: a reused answer's drop replays its FINAL result_id, not the reserved one", async ({
        page,
    }, testInfo) => {
        test.setTimeout(240_000);
        await withProxy("end-after-accepted-keep-acr", testInfo, async (proxy) => {
            const { calls, surface } = await panel(page);
            await ask(surface, question("reuseDrop"));
            await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
            const first = investigations(calls)[0]!;
            const firstThread = await acrRead<ThreadRecord>(
                first,
                `/api/v1/context-fabric/threads/${headerOf(first, "x-acr-thread-id")}`,
            );
            const stored = firstThread.body.turns[0]?.result_id;
            expect(stored, "the first answer has no stored result_id").toMatch(
                /^result_[0-9a-f]{32}$/u,
            );

            // The same owner in a new conversation: ACR does not reuse a follow-up.
            await divert(page, proxy);
            await surface.getByTestId("ask-dev-history-toggle").click();
            await surface.getByRole("button", { name: "New conversation" }).click();
            await ask(surface, question("reuseDrop"));
            await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });

            const second = investigations(calls)[1]!;
            const submission = headerOf(second, "x-acr-submission-id");
            const end = await acrRead<SubmissionRecord>(second, statusPath(submission));
            const reserved = proxy.exchanges[0]?.reservedResultId ?? null;
            const replays = calls
                .filter((call) =>
                    /^\/api\/v1\/context-fabric\/investigations\/result_[0-9a-f]{32}$/u.test(
                        call.path,
                    ),
                )
                .map((call) => call.path);
            await report(testInfo, "reuse-evidence", {
                stored,
                reserved,
                final: end.body?.result_id ?? null,
                replays,
                acr_calls: acrCalls(calls),
            });
            expect(proxy.exchanges[0]?.faulted, "the proxy did not end the stream").toBe(true);
            expect(investigations(calls)).toHaveLength(2);
            expect(reserved, "ACR's accepted frame named no reserved id").toMatch(
                /^result_[0-9a-f]{32}$/u,
            );
            expect(end.body?.state).toBe("done");
            expect(end.body?.result_id, "the second ask was not served by reuse").toBe(stored);
            expect(end.body?.result_id, "the final id is the reserved one").not.toBe(reserved);
            expect(replays, "the store replayed another id").toEqual([
                `${INVESTIGATIONS_PATH}/${stored!}`,
            ]);
        });
    });

    test("window lease_off: a drop that ends ACR's run reads abandoned: the interrupted words", async ({
        page,
    }, testInfo) => {
        test.setTimeout(180_000);
        await withProxy("cut-after-first-stage", testInfo, async (proxy) => {
            await divert(page, proxy);
            const { calls, surface } = await panel(page);
            await ask(surface, question("abandon"));
            const end = await endState(surface, 90_000);
            const create = investigations(calls)[0]!;
            const submission = headerOf(create, "x-acr-submission-id");
            const statusReads = calls.filter(
                (call) => call.method === "GET" && call.path === statusPath(submission),
            );
            const record = await acrRead<SubmissionRecord>(create, statusPath(submission));
            await report(testInfo, "abandon-evidence", {
                state: end.state,
                words: end.words,
                submission_state: record.body?.state ?? null,
                acr_calls: acrCalls(calls),
            });
            expect(proxy.exchanges[0]?.faulted, "the proxy did not cut the stream").toBe(true);
            expect(statusReads.length, "the store did not read the status").toBeGreaterThan(0);
            expect(record.body?.state).toBe("abandoned");
            expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("interrupted");
            await expect(surface.getByTestId("chat-status").last()).toContainText(INTERRUPTED);
        });
    });
});

test.describe("the thread header on the wire (AC3)", () => {
    test("turns 1 and 2 send one X-ACR-Thread-ID; a new conversation sends a new one", async ({
        page,
    }, testInfo) => {
        test.setTimeout(240_000);
        const { calls, surface } = await panel(page);
        await ask(surface, question("thread1"));
        await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
        await ask(surface, question("thread2"));
        await expect(answers(surface)).toHaveCount(2, { timeout: 90_000 });
        await surface.getByTestId("ask-dev-history-toggle").click();
        await surface.getByRole("button", { name: "New conversation" }).click();
        await ask(surface, question("thread3"));
        await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });

        const creates = investigations(calls);
        const threads = creates.map((call) => headerOf(call, "x-acr-thread-id"));
        const submissions = creates.map((call) => headerOf(call, "x-acr-submission-id"));
        // ACR's own record: the header is what put each turn in its thread.
        const read = (threadId: string) =>
            acrRead<ThreadRecord>(creates[2]!, `/api/v1/context-fabric/threads/${threadId}`);
        const first = await read(threads[0]!);
        const second = await read(threads[2]!);
        await report(testInfo, "thread-header-evidence", {
            creates: creates.length,
            same_thread_turns_1_2: threads[0] === threads[1],
            new_thread_after_new_conversation: threads[2] !== threads[0],
            distinct_submissions: new Set(submissions).size,
            first_thread_turns: first.body?.turn_count ?? null,
            second_thread_turns: second.body?.turn_count ?? null,
            acr_calls: acrCalls(calls),
        });
        expect(creates.map((call) => call.status)).toEqual([200, 200, 200]);
        expect(threads[1], "turn 2 sent another thread").toBe(threads[0]);
        expect(threads[2], "a new conversation kept the old thread").not.toBe(threads[0]);
        expect(new Set(submissions).size, "a turn reused a submission key").toBe(3);
        expect([first.status, second.status]).toEqual([200, 200]);
        expect(first.body.turns.map((turn) => turn.submission_id)).toEqual(submissions.slice(0, 2));
        expect(second.body.turns.map((turn) => turn.submission_id)).toEqual([submissions[2]]);
    });
});
