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
    expectAModelPath,
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
 * CHAOS-11960, E6 AC-6 (plan N1): "usage survives retention", and the retention purge that precedes
 * it. Two windows, run by the stack owner in order (lead ruling 2026-11-04):
 *
 * - `ac6_prepare`: one retention-0 turn is made and its conversation is read back; the test prints
 *   the conversation's id. This is the data the purge removes.
 * - the owner back-dates that ONE conversation (a scoped UPDATE, rowcount 1 checked) and acr's own
 *   retention sweep removes it; the owner gives the test the id.
 * - `ac6_after` (`ASK_DEV_LIVE_AC6_THREAD` = that id): the conversation is gone (404, absent from
 *   the list). That is the live half, proven on askdev-1 on 2026-11-04 (acr's sweep line
 *   `context fabric retention sweep outcome=removed`, then the thread read `not_found`).
 *
 * The usage half (a new submit is still refused 429 `allowance_exhausted` after the purge) runs only
 * with `ASK_DEV_LIVE_ALLOWANCE_GATED=1`, for a stack whose runs the monthly allowance counts: the
 * platform model's. On askdev-1 org 70d529e0, which its own BYO model answers, it did NOT hold: with
 * the allowance at the usage count (1773 == 1773) a new submit was admitted and answered, because a
 * BYO-served run is not a `platform_runs` and is not gated. So that half is not asserted live there;
 * acr's own proof is `TestTheUsageAggregateGatesAndOutlivesItsRecords` (pginvestigation, real
 * Postgres).
 */
const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const question = (name: QuestionCase): string => questionFor(name, NONCE);
const WINDOW = process.env.ASK_DEV_LIVE_WINDOW ?? "";
const PURGED_THREAD = process.env.ASK_DEV_LIVE_AC6_THREAD ?? "";
const ALLOWANCE_GATED = process.env.ASK_DEV_LIVE_ALLOWANCE_GATED === "1";

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
let session: Session;

test.beforeAll(async ({ browser, baseURL }) => {
    expect(NONCE, "ASK_DEV_LIVE_NONCE is not set: run make-plan.ts for this run").not.toBe("");
    const oracle = await requestContext.newContext();
    try {
        await expectAModelPath(oracle);
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

test("window ac6_after: the purged conversation is gone, and with a gated allowance a submit still refuses", async ({
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

    if (!ALLOWANCE_GATED) {
        await testInfo.attach("ac6-after-evidence", {
            body: JSON.stringify(
                {
                    purged_thread_read_status: gone.status,
                    purged_thread_listed: false,
                    allowance_checked: false,
                },
                null,
                2,
            ),
            contentType: "application/json",
        });
        console.log(
            `AC6_AFTER purged_thread_read_status=${String(gone.status)} allowance_checked=false`,
        );
        return;
    }
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
