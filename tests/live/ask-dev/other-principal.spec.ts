import { randomBytes } from "node:crypto";

import {
    expect,
    request as requestContext,
    test,
    type Browser,
    type BrowserContext,
    type Locator,
    type Page,
    type TestInfo,
} from "@playwright/test";

import { THREADS_PATH, threadDeletes, threadLists, threadReads } from "./history-views";
import { questionFor, type QuestionCase } from "./questions";
import {
    INVESTIGATIONS_PATH,
    ORACLE,
    OTHER_EMAIL,
    acrCallAs,
    acrInvestigateAs,
    ask,
    authorize,
    expectAnswersSynthesized,
    investigations,
    orgOf,
    panel,
    secretsOf,
    signIn,
    signInOther,
    threadOf,
    watchAcr,
    watchResults,
    withBearer,
    type AcrCall,
} from "./stack";

/**
 * CHAOS-12883: INV-1 live, with a second principal of the owner's organization (the ACs split out of
 * CHAOS-12232 and CHAOS-12233). The owner is `admin@test.com`; the other is `OTHER_EMAIL`.
 *
 * - Threads: the other principal's read of the owner's thread is ACR's neutral 404 (the same answer
 *   as for a thread that never existed), its History list does not include the thread, and its
 *   DELETE of the thread is 204 with the owner's thread unchanged.
 * - Runs: the other principal's attach to the owner's run and its cancel of it are 404, and the
 *   owner's run completes.
 *
 * A 404 alone proves nothing: it could mean the other principal can read nothing at all. So each case
 * first shows the other principal doing the same call on ITS OWN thread or run (the positive
 * control), and each guard is compared with a thread or run that never existed.
 */
const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const question = (name: QuestionCase): string => questionFor(name, NONCE);

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
let session: Session;

test.beforeAll(async ({ browser, baseURL }) => {
    expect(ORACLE, "ASK_DEV_LIVE_ORACLE is not set: no question may be sent").not.toBe("");
    expect(NONCE, "ASK_DEV_LIVE_NONCE is not set: run make-plan.ts for this run").not.toBe("");
    expect(
        OTHER_EMAIL,
        "ASK_DEV_LIVE_OTHER_EMAIL is not set: INV-1 needs a second principal",
    ).not.toBe("");
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

// Each case authorizes twice (the owner, then the other principal): web allows one user 6 a minute.
test.afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
});

const answers = (surface: Locator) => surface.getByRole("article", { name: "Answer" });
const activeStage = (surface: Locator) => surface.locator('li.chat__stage[data-state="active"]');
const historyRow = (surface: Locator, threadId: string) =>
    surface.locator(`[data-testid="ask-dev-history-row"][data-thread-id="${threadId}"]`);
const submissionOf = (create: AcrCall): string => secretsOf(create).headers["x-acr-submission-id"]!;
const statusPath = (submission: string) => `${INVESTIGATIONS_PATH}/submissions/${submission}`;
const eventsPath = (submission: string) => `${statusPath(submission)}/events`;

/** An id of the same shape as `id`, that ACR never issued. */
function fabricated(id: string): string {
    const fake = id.replace(/[0-9a-f]{8,}$/u, (hex) =>
        randomBytes(Math.ceil(hex.length / 2))
            .toString("hex")
            .slice(0, hex.length),
    );
    expect(fake, "no fabricated id could be made from the real one").not.toBe(id);
    return fake;
}

/** What a refusal says, without anything per request: two neutral refusals must be equal. */
function refusalOf(body: unknown): unknown {
    const refusal = (body as { error?: unknown } | null)?.error ?? body;
    return JSON.parse(
        JSON.stringify(refusal, (key, value: unknown) =>
            /request_id|trace/iu.test(key) ? undefined : value,
        ),
    );
}

/** Every thread id on every page of a principal's History list. */
async function listedThreads(like: AcrCall): Promise<{ ids: string[]; requestId: string | null }> {
    const ids: string[] = [];
    let cursor: string | undefined;
    let requestId: string | null = null;
    for (let page = 0; page < 40; page++) {
        const query = new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) });
        const response = await acrCallAs(like, "GET", `${THREADS_PATH}?${query.toString()}`);
        expect(response.status, "ACR did not serve the thread list").toBe(200);
        requestId ??= response.requestId;
        const body = response.body as {
            threads?: Array<{ thread_id: string }>;
            next_cursor?: string;
        };
        expect(Array.isArray(body.threads), "the thread list is not a list").toBe(true);
        ids.push(...body.threads!.map((thread) => thread.thread_id));
        cursor = body.next_cursor;
        if (cursor === undefined) return { ids, requestId };
    }
    throw new Error("the thread list has more than 40 pages: the case cannot read all of it");
}

/** The other principal: a signed-in, authorized tab in a context of its own, with its panel open. */
async function otherPrincipal(browser: Browser, baseURL: string) {
    // An empty session on purpose: a context made in a test takes the test's `use` options, so it
    // would hold the owner's storageState and land signed in as the owner (askdev-1, 2026-11-03).
    const context = await browser.newContext({
        baseURL,
        ignoreHTTPSErrors: true,
        storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    const calls = watchAcr(page);
    const results = await watchResults(page);
    await signInOther(page);
    await authorize(page);
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const surface = page.getByTestId("ask-dev-panel");
    await expect(surface.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
    return { context, page, calls, results, surface };
}

/** The precondition, measured: the principals are two users of one organization. */
async function expectSameOrganization(
    owner: Page,
    other: Page,
    calls: readonly AcrCall[],
    otherCalls: readonly AcrCall[],
    testInfo: TestInfo,
): Promise<void> {
    expect(secretsOf(withBearer(otherCalls)).bearer, "the two principals hold one bearer").not.toBe(
        secretsOf(withBearer(calls)).bearer,
    );
    const ownerOrg = await orgOf(owner);
    const otherOrg = await orgOf(other);
    await testInfo.attach("principals", {
        body: JSON.stringify({
            owner_role: ownerOrg.role,
            other_role: otherOrg.role,
            same_org: ownerOrg.org === otherOrg.org,
        }),
        contentType: "application/json",
    });
    expect(ownerOrg.org, "the owner's session names no organization").not.toBeNull();
    expect(otherOrg.org, "the second principal is not in the owner's organization").toBe(
        ownerOrg.org,
    );
}

test("INV-1 threads: another principal of the organization gets 404 on the owner's thread, does not list it, and its DELETE changes nothing", async ({
    page,
    browser,
    baseURL,
}, testInfo) => {
    test.setTimeout(420_000);
    const evidence: Record<string, unknown> = {};
    const results = await watchResults(page);
    const { calls, surface } = await panel(page);
    let other: Awaited<ReturnType<typeof otherPrincipal>> | undefined;
    try {
        await ask(surface, question("peerThreadOwner"));
        await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
        await expectAnswersSynthesized(results, "peerThreadOwner");
        const ownerThread = threadOf(investigations(calls)[0]!);
        const owner = withBearer(calls);
        evidence.owner_thread = ownerThread;

        // Before the other principal acts, the owner's thread is read as the owner: the baseline.
        const baseline = await acrCallAs(owner, "GET", `${THREADS_PATH}/${ownerThread}`);
        expect(baseline.status, "the owner cannot read its own thread").toBe(200);
        const turns = (baseline.body as { turn_count?: number }).turn_count;
        expect(turns, "the owner's thread holds no turn").toBeGreaterThan(0);
        expect((await listedThreads(owner)).ids, "the owner's list lacks its thread").toContain(
            ownerThread,
        );

        other = await otherPrincipal(browser, baseURL!);
        await ask(other.surface, question("peerThreadOwn"));
        await expect(answers(other.surface)).toHaveCount(1, { timeout: 90_000 });
        await expectAnswersSynthesized(other.results, "peerThreadOwn");
        const ownThread = threadOf(investigations(other.calls)[0]!);
        expect(ownThread, "the other principal's thread is the owner's").not.toBe(ownerThread);
        const theirs = withBearer(other.calls);
        await expectSameOrganization(page, other.page, calls, other.calls, testInfo);

        // The positive control: the other principal reads and lists its OWN thread.
        const ownRead = await acrCallAs(theirs, "GET", `${THREADS_PATH}/${ownThread}`);
        expect(ownRead.status, "the other principal cannot read its own thread").toBe(200);
        const theirList = await listedThreads(theirs);
        expect(theirList.ids, "the other principal's list lacks its own thread").toContain(
            ownThread,
        );
        evidence.control = { read_request_id: ownRead.requestId };

        // The guard 1: a read of the owner's thread is the neutral 404, the answer for a thread that
        // never existed.
        const read = await acrCallAs(theirs, "GET", `${THREADS_PATH}/${ownerThread}`);
        const never = await acrCallAs(theirs, "GET", `${THREADS_PATH}/${fabricated(ownerThread)}`);
        evidence.read = { status: read.status, request_id: read.requestId };
        expect(read.status, "another principal read the owner's thread").toBe(404);
        expect(never.status, "a thread that never existed is not 404").toBe(404);
        expect(
            refusalOf(read.body),
            "the 404 tells the owner's thread from an unknown one",
        ).toEqual(refusalOf(never.body));

        // The guard 2: its list, through the API and on its own History, does not include it.
        expect(
            theirList.ids,
            "the other principal's list includes the owner's thread",
        ).not.toContain(ownerThread);
        evidence.list = { threads: theirList.ids.length, request_id: theirList.requestId };
        await other.surface.getByTestId("ask-dev-history-toggle").click();
        await expect(
            historyRow(other.surface, ownThread),
            "the other principal's History lacks its own thread",
        ).toHaveCount(1, { timeout: 30_000 });
        expect(
            await historyRow(other.surface, ownerThread).count(),
            "the other principal's History shows the owner's thread",
        ).toBe(0);
        expect(
            threadLists(other.calls).filter((call) => call.status === 200).length,
            "the other principal's History read no list",
        ).toBeGreaterThan(0);

        // The guard 3: its DELETE of the owner's thread is 204, and the owner's thread is unchanged.
        const del = await acrCallAs(theirs, "DELETE", `${THREADS_PATH}/${ownerThread}`);
        evidence.delete = { status: del.status, request_id: del.requestId };
        expect(del.status, "ACR did not answer a foreign DELETE with 204").toBe(204);
        const after = await acrCallAs(owner, "GET", `${THREADS_PATH}/${ownerThread}`);
        expect(after.status, "another principal's DELETE removed the owner's thread").toBe(200);
        expect(
            (after.body as { turn_count?: number }).turn_count,
            "another principal's DELETE changed the owner's thread",
        ).toBe(turns);
        expect(
            (await listedThreads(owner)).ids,
            "another principal's DELETE took the thread off the owner's list",
        ).toContain(ownerThread);

        // The DELETE route does act for a principal's OWN thread: the 204 above is not a no-op route.
        const ownDelete = await acrCallAs(theirs, "DELETE", `${THREADS_PATH}/${ownThread}`);
        expect(ownDelete.status, "the other principal cannot delete its own thread").toBe(204);
        const gone = await acrCallAs(theirs, "GET", `${THREADS_PATH}/${ownThread}`);
        expect(gone.status, "the other principal's own DELETE removed nothing").toBe(404);
        evidence.own_delete = { status: ownDelete.status, read_after: gone.status };

        const reads = threadReads(calls, ownerThread).filter((call) => call.status === 200);
        evidence.owner_page_calls = {
            reads: reads.length,
            deletes: threadDeletes(calls, ownerThread).length,
        };
        expect(
            threadDeletes(calls, ownerThread),
            "the owner's own page deleted the thread",
        ).toHaveLength(0);
    } finally {
        await testInfo.attach("other-principal-threads", {
            body: JSON.stringify(evidence, null, 2),
            contentType: "application/json",
        });
        await other?.context.close();
    }
});

test("INV-1 runs: another principal of the organization gets 404 on an attach to, and a cancel of, the owner's run, and the run completes", async ({
    page,
    browser,
    baseURL,
}, testInfo) => {
    test.setTimeout(420_000);
    const evidence: Record<string, unknown> = {};
    const results = await watchResults(page);
    const { calls, surface } = await panel(page);
    let other: Awaited<ReturnType<typeof otherPrincipal>> | undefined;
    try {
        other = await otherPrincipal(browser, baseURL!);
        // The other principal's own run, held in flight by the oracle: the control for both routes.
        await ask(other.surface, question("peerRunOwn"));
        await expect(activeStage(other.surface)).toBeVisible({ timeout: 15_000 });
        const ownCreate = investigations(other.calls)[0]!;
        const ownSubmission = submissionOf(ownCreate);
        const theirs = withBearer(other.calls);

        // The owner's run, held in flight the same way.
        await ask(surface, question("peerRunOwner"));
        await expect(activeStage(surface)).toBeVisible({ timeout: 15_000 });
        const ownerCreate = investigations(calls)[0]!;
        const ownerSubmission = submissionOf(ownerCreate);
        expect(ownerSubmission, "the two principals share a run").not.toBe(ownSubmission);
        await expectSameOrganization(page, other.page, calls, other.calls, testInfo);
        const owner = withBearer(calls);
        const running = await acrCallAs(owner, "GET", statusPath(ownerSubmission));
        expect(running.status, "the owner cannot read its own run").toBe(200);
        expect(
            (running.body as { state?: string }).state,
            "the owner's run is not in flight: nothing to attach to or cancel",
        ).not.toBe("done");

        // The positive control: the other principal attaches to its OWN run (200).
        const ownAttach = await acrCallAs(theirs, "GET", eventsPath(ownSubmission), {
            headersOnly: true,
        });
        expect(ownAttach.status, "the other principal cannot attach to its own run").toBe(200);

        // The guard: an attach to, and a cancel of, the owner's run are 404, the answer for a run
        // that never existed.
        const attach = await acrCallAs(theirs, "GET", eventsPath(ownerSubmission), {
            headersOnly: true,
        });
        const attachNever = await acrCallAs(
            theirs,
            "GET",
            eventsPath(fabricated(ownerSubmission)),
            {
                headersOnly: true,
            },
        );
        const cancel = await acrCallAs(theirs, "POST", `${statusPath(ownerSubmission)}/cancel`);
        const cancelNever = await acrCallAs(
            theirs,
            "POST",
            `${statusPath(fabricated(ownerSubmission))}/cancel`,
        );
        evidence.attach = { status: attach.status, request_id: attach.requestId };
        evidence.cancel = { status: cancel.status, request_id: cancel.requestId };
        expect(attach.status, "another principal attached to the owner's run").toBe(404);
        expect(cancel.status, "another principal cancelled the owner's run").toBe(404);
        expect(attachNever.status, "an attach to a run that never existed is not 404").toBe(404);
        expect(cancelNever.status, "a cancel of a run that never existed is not 404").toBe(404);
        expect(
            refusalOf(attach.body),
            "the attach 404 tells the owner's run from an unknown one",
        ).toEqual(refusalOf(attachNever.body));
        expect(
            refusalOf(cancel.body),
            "the cancel 404 tells the owner's run from an unknown one",
        ).toEqual(refusalOf(cancelNever.body));

        // The cancel route does act for a principal's OWN run: the 404 above is the guard.
        const ownCancel = await acrCallAs(theirs, "POST", `${statusPath(ownSubmission)}/cancel`);
        expect([202, 204], "the other principal cannot cancel its own run").toContain(
            ownCancel.status,
        );
        evidence.own_cancel = { status: ownCancel.status, request_id: ownCancel.requestId };

        // Neither call touched the owner's run: it completes, with a synthesized answer.
        await expect(answers(surface)).toHaveCount(1, { timeout: 120_000 });
        await expectAnswersSynthesized(results, "peerRunOwner");
        const done = await acrCallAs(owner, "GET", statusPath(ownerSubmission));
        evidence.owner_status_after = {
            status: done.status,
            state: (done.body as { state?: string } | null)?.state ?? null,
        };
        expect(evidence.owner_status_after, "the owner's run did not complete").toEqual({
            status: 200,
            state: "done",
        });
    } finally {
        await testInfo.attach("other-principal-runs", {
            body: JSON.stringify(evidence, null, 2),
            contentType: "application/json",
        });
        await other?.context.close();
    }
});

/**
 * CHAOS-11960, E6 AC-10 (c4 F4): "append re-authorizes the result through the gate" and "another
 * principal's `thread_id` does not join the thread". The other principal makes two creates by hand
 * with its own bearer, in the owner's organization:
 *
 * - a turn whose `parent_result_id` is the OWNER's result: the other principal may not read that
 *   result, so ACR refuses it, with the answer it gives for a parent that never existed;
 * - a turn that names the OWNER's `thread_id`: whatever ACR does with it, the owner's thread is the
 *   same afterwards (same turns, same results), and nothing of the owner's is in what the other
 *   principal reads under that id.
 *
 * The owner reads its thread first (the baseline) and last, so a join could not pass unseen.
 */
test("AC-10 (INV-1): another principal cannot use the owner's result as a parent, and its turn naming the owner's thread id does not join it", async ({
    page,
    browser,
    baseURL,
}, testInfo) => {
    test.setTimeout(420_000);
    const evidence: Record<string, unknown> = {};
    const results = await watchResults(page);
    const { calls, surface } = await panel(page);
    let other: Awaited<ReturnType<typeof otherPrincipal>> | undefined;
    try {
        await ask(surface, question("p4Owner"));
        await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
        await expectAnswersSynthesized(results, "p4Owner");
        const create = investigations(calls)[0]!;
        const ownerThread = threadOf(create);
        const owner = withBearer(calls);
        const baseline = await acrCallAs(owner, "GET", `${THREADS_PATH}/${ownerThread}`);
        expect(baseline.status, "the owner cannot read its own thread").toBe(200);
        const turnsOf = (body: unknown) =>
            (
                (body as { turns?: Array<{ submission_id: string; result_id?: string }> }).turns ??
                []
            ).map((turn) => `${turn.submission_id}/${turn.result_id ?? ""}`);
        const before = turnsOf(baseline.body);
        const ownerResult = (baseline.body as { turns?: Array<{ result_id?: string }> }).turns?.[0]
            ?.result_id;
        expect(ownerResult, "the owner's first turn names no result").toMatch(/^result_/u);
        evidence.owner = { thread: ownerThread, turns_before: before.length };

        other = await otherPrincipal(browser, baseURL!);
        const theirs = withBearer(other.calls);
        await expectSameOrganization(page, other.page, calls, other.calls, testInfo);
        const freshThread = () => `thread_${randomBytes(16).toString("hex")}`;

        // The parent: the owner's result, and a result that never existed, from the other principal.
        const realParent = await acrInvestigateAs(theirs, create, {
            question: question("p4Parent"),
            threadId: freshThread(),
            parentResultId: ownerResult!,
        });
        const unknownParent = await acrInvestigateAs(theirs, create, {
            question: question("p4ParentUnknown"),
            threadId: freshThread(),
            parentResultId: fabricated(ownerResult!),
        });
        evidence.parent = {
            owner_result_status: realParent.status,
            unknown_status: unknownParent.status,
            owner_request_id: realParent.requestId,
            unknown_request_id: unknownParent.requestId,
        };
        expect(
            realParent.status,
            "ACR took another principal's turn with the owner's result as its parent",
        ).toBeGreaterThanOrEqual(400);
        expect(realParent.status, "ACR failed the refusal").toBeLessThan(500);
        expect(
            refusalOf(realParent.body),
            "the refusal tells the owner's result from an unknown one",
        ).toEqual(refusalOf(unknownParent.body));
        expect(realParent.status, "the two refusals differ in status").toBe(unknownParent.status);

        // The join: the other principal's turn on the owner's thread id.
        const join = await acrInvestigateAs(theirs, create, {
            question: question("p4Join"),
            threadId: ownerThread,
        });
        evidence.join = { status: join.status, request_id: join.requestId };
        const after = await acrCallAs(owner, "GET", `${THREADS_PATH}/${ownerThread}`);
        expect(after.status, "the owner lost its thread").toBe(200);
        expect(
            turnsOf(after.body),
            "the owner's thread changed after the other principal's turn",
        ).toEqual(before);
        const theirRead = await acrCallAs(theirs, "GET", `${THREADS_PATH}/${ownerThread}`);
        evidence.their_read = { status: theirRead.status, request_id: theirRead.requestId };
        if (theirRead.status === 200) {
            const mine = turnsOf(theirRead.body);
            expect(
                mine.filter((turn) => before.includes(turn)),
                "what the other principal reads under the owner's id holds the owner's turns",
            ).toEqual([]);
        } else {
            expect(theirRead.status, "the other principal's read of that id").toBe(404);
        }
    } finally {
        await testInfo.attach("ac10-evidence", {
            body: JSON.stringify(evidence, null, 2),
            contentType: "application/json",
        });
        await other?.context.close();
    }
});
