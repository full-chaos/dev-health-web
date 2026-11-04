import {
    expect,
    request as requestContext,
    test,
    type BrowserContext,
    type Locator,
} from "@playwright/test";

import { THREADS_PATH } from "./history-views";
import { questionFor, type QuestionCase } from "./questions";
import {
    INVESTIGATIONS_PATH,
    ORACLE,
    acrCallAs,
    ask,
    expectAnswersSynthesized,
    investigations,
    panel,
    signIn,
    threadOf,
    watchResults,
    withBearer,
} from "./stack";

/**
 * CHAOS-11960, E6 AC-6 (plan N1): "usage survives retention". The monthly usage is a content-free
 * (organization, month) aggregate written in the admission transaction and outside retention, so
 * purging a conversation does not give the allowance back. Two windows, run by the stack owner in
 * order (lead ruling 2026-11-04: the owner sets the allowance to the current count for the run,
 * restores 5000 and reads it back, and runs the purge):
 *
 * - `ac6_prepare` (allowance untouched): one retention-0 turn is made and its conversation is read
 *   back, and the test prints the conversation's id. This is the data the purge will remove, and
 *   one admitted turn the usage counts.
 * - the owner then sets the allowance to the usage count, back-dates that conversation and runs the
 *   retention purge (acr's own job), and gives the test the id.
 * - `ac6_after` (`ASK_DEV_LIVE_AC6_THREAD` = that id): the conversation is gone (404, absent from the
 *   list), and a new submit is still refused with 429 `allowance_exhausted`: the purge did not
 *   return the month's allowance.
 *
 * ACR's own proof of the same rule is `TestTheUsageAggregateGatesAndOutlivesItsRecords`
 * (pginvestigation, real Postgres); this is the deployed stack's.
 */
const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const question = (name: QuestionCase): string => questionFor(name, NONCE);
const WINDOW = process.env.ASK_DEV_LIVE_WINDOW ?? "";
const PURGED_THREAD = process.env.ASK_DEV_LIVE_AC6_THREAD ?? "";

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

test.beforeEach(({}, testInfo) => {
    const wants = testInfo.title.startsWith("window ac6_prepare:")
        ? "ac6_prepare"
        : testInfo.title.startsWith("window ac6_after:")
          ? "ac6_after"
          : "";
    test.skip(wants !== WINDOW, `runs only in the ${wants} window, not "${WINDOW}"`);
});

const answers = (surface: Locator) => surface.getByRole("article", { name: "Answer" });
const statusPanel = (surface: Locator) => surface.getByTestId("chat-status").last();

test("window ac6_prepare: a retention-0 turn is admitted and its conversation is read back", async ({
    page,
}, testInfo) => {
    const results = await watchResults(page);
    const { calls, surface } = await panel(page);
    await ask(surface, question("p4Retention0"));
    await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
    await expectAnswersSynthesized(results, "p4Retention0");
    const create = investigations(calls)[0]!;
    const thread = threadOf(create);
    const read = await acrCallAs(withBearer(calls), "GET", `${THREADS_PATH}/${thread}`);
    expect(read.status, "the conversation cannot be read before the purge").toBe(200);
    const body = read.body as { retention_days?: number; turn_count?: number };
    expect(body.retention_days, "the conversation is not retention 0").toBe(0);
    expect(body.turn_count, "the conversation holds no turn").toBe(1);
    const evidence = {
        thread_id: thread,
        retention_days: body.retention_days,
        request_id: read.requestId,
    };
    await testInfo.attach("ac6-prepare-evidence", {
        body: JSON.stringify(evidence, null, 2),
        contentType: "application/json",
    });
    // The id is not a secret: the stack owner needs it to back-date and to hand to the next window.
    console.log(`AC6_THREAD=${thread}`);
});

test("window ac6_after: the purged conversation is gone, and the exhausted allowance still refuses", async ({
    page,
}, testInfo) => {
    expect(PURGED_THREAD, "ASK_DEV_LIVE_AC6_THREAD is not set: the prepare window's id").toMatch(
        /^[a-z]+_[0-9a-f]{32}$/u,
    );
    const { calls, surface } = await panel(page);
    const owner = withBearer(calls);
    const gone = await acrCallAs(owner, "GET", `${THREADS_PATH}/${PURGED_THREAD}`);
    expect(gone.status, "the purged conversation is still readable").toBe(404);
    const listed: string[] = [];
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 40; pageNumber++) {
        const query = new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) });
        const list = await acrCallAs(owner, "GET", `${THREADS_PATH}?${query.toString()}`);
        expect(list.status, "ACR did not serve the thread list").toBe(200);
        const parsed = list.body as {
            threads?: Array<{ thread_id: string }>;
            next_cursor?: string;
        };
        listed.push(...(parsed.threads ?? []).map((thread) => thread.thread_id));
        cursor = parsed.next_cursor;
        if (cursor === undefined) break;
    }
    expect(listed, "the purged conversation is still listed").not.toContain(PURGED_THREAD);

    const created = page.waitForResponse(
        (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === INVESTIGATIONS_PATH,
    );
    await ask(surface, question("p4Exhausted"));
    const response = await created;
    const retryAfter = response.headers()["retry-after"] ?? null;
    await expect(statusPanel(surface)).toHaveAttribute("data-status", "limited", {
        timeout: 30_000,
    });
    await expect(statusPanel(surface)).toContainText(
        "Your organization has used this month's Ask Dev allowance.",
    );
    await testInfo.attach("ac6-after-evidence", {
        body: JSON.stringify(
            {
                purged_thread_read_status: gone.status,
                purged_thread_listed: false,
                create_status: response.status(),
                retry_after: retryAfter,
                request_id: response.headers()["x-request-id"] ?? null,
            },
            null,
            2,
        ),
        contentType: "application/json",
    });
    expect(response.status(), "the submit after the purge was not refused").toBe(429);
    expect(retryAfter, "ACR sent no Retry-After").toMatch(/^\d+$/u);
});
