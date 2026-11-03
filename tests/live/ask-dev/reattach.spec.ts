import {
    expect,
    request as requestContext,
    test,
    type BrowserContext,
    type Locator,
    type Page,
    type TestInfo,
} from "@playwright/test";

import { startFaultProxy, type FaultProxy } from "./fault-proxy";
import { questionFor, type QuestionCase } from "./questions";
import { framesOf, longestSilenceMs, seqMismatches } from "./reattach-views";
import { watchStreams, type RecordedStream } from "./stream-chunks";
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
 * CHAOS-12233 (I-S10b's live half, CHAOS-11957): reattach and cancel on the real stack against real
 * ACR with the run lease on, through the browser transport. The lead's plan (2026-11-03):
 *
 * - 1a: an attach after a lost create stream resumes the events with no gap (`seq`). Whether it came
 *   from the other replica is read from ACR's log (p1), by the request ids this case records.
 * - 1b: an attach with a `Last-Event-ID` ACR never issued gets 410 `cursor_expired`; the store reads
 *   the status, then replays the result.
 * - 2a: Stop on a run: ACR takes the cancel and starts no model attempt after it. `t_req`, `t_eff`
 *   and the attempt starts are ACR's log lines (p1); the oracle's own count is checked here.
 * - 2c: a result that finished first is kept: a cancel after it changes nothing.
 * - 3: pod loss, run by p1 only (`ASK_DEV_LIVE_POD_LOSS=1`): p1 deletes the run's pod; the turn ends
 *   as interrupted.
 * - 4a and 4c: a reload during a long run restores it; its attach stays alive with `: keepalive`, and
 *   no wait outlives the run's deadline D, which comes from the replayed `accepted`.
 *
 * NOT RUN, recorded on the ticket: 1c (an event-log cap window), 2b (an oracle fault mode) and 4b (a
 * fault-proxy mode on the attach route). AC-3 is CHAOS-12883.
 */

const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const POD_LOSS = process.env.ASK_DEV_LIVE_POD_LOSS === "1";
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
const submissionOf = (create: AcrCall): string => secretsOf(create).headers["x-acr-submission-id"]!;
const eventsPath = (submission: string) =>
    `${INVESTIGATIONS_PATH}/submissions/${submission}/events`;
const statusPath = (submission: string) => `${INVESTIGATIONS_PATH}/submissions/${submission}`;

/** What a call to ACR was: never its query, its headers or its body. */
const acrCalls = (calls: readonly AcrCall[]) =>
    calls.map(({ method, path, status }) => ({ method, path, status: status ?? null }));

/** ACR's request id of every investigation call, by method, path and time: p1 reads ACR's log by these. */
function watchRequestIds(page: Page) {
    const ids: Array<{
        at: string;
        method: string;
        path: string;
        status: number;
        requestId: string | null;
    }> = [];
    page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.origin !== ACR || !url.pathname.startsWith(INVESTIGATIONS_PATH)) return;
        ids.push({
            at: new Date().toISOString(),
            method: response.request().method(),
            path: url.pathname,
            status: response.status(),
            requestId: response.headers()["x-request-id"] ?? null,
        });
    });
    return ids;
}

async function report(testInfo: TestInfo, name: string, data: unknown): Promise<void> {
    await testInfo.attach(name, {
        contentType: "application/json",
        body: JSON.stringify(data, null, 2),
    });
}

/** The create's POST goes through the fault proxy (`terminals.spec.ts`'s `divert`). */
async function divertCreates(page: Page, proxy: FaultProxy): Promise<void> {
    await page.route(`${ACR}${INVESTIGATIONS_PATH}`, async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        return route.continue({ url: `${proxy.origin}${INVESTIGATIONS_PATH}` });
    });
}

/** ACR's own call with the panel's create headers (bearer, resource, client version): never logged. */
async function acrCallAs(create: AcrCall, method: "GET" | "POST", path: string) {
    const from = secretsOf(create).headers;
    const response = await fetch(`${ACR}${path}`, {
        method,
        headers: {
            authorization: from.authorization!,
            "x-acr-resource": from["x-acr-resource"]!,
            "x-acr-client-version": from["x-acr-client-version"]!,
            accept: "application/json",
        },
    });
    const text = await response.text();
    try {
        return { status: response.status, body: JSON.parse(text) as unknown };
    } catch {
        return { status: response.status, body: null };
    }
}

type OracleCounts = { started?: number; answered?: number; cancelled?: number };
async function oracleCountsOf(text: string): Promise<Record<string, OracleCounts> | undefined> {
    const oracle = await requestContext.newContext();
    try {
        const response = await oracle.get(`${ORACLE}/service/calls`);
        expect(response.status(), "the oracle's call log is not readable").toBe(200);
        const calls = (await response.json()) as {
            by_question: Record<string, Record<string, OracleCounts>>;
        };
        return calls.by_question[text];
    } finally {
        await oracle.dispose();
    }
}

/** Waits for the turn to end: its answer, or its `chat-status` panel's `data-status`. */
async function endState(surface: Locator, timeout: number): Promise<string> {
    const status = surface.getByTestId("chat-status");
    let state = "pending";
    await expect
        .poll(
            async () => {
                if ((await answers(surface).count()) > 0) state = "answer";
                else if ((await status.count()) > 0) {
                    state = (await status.last().getAttribute("data-status")) ?? "no data-status";
                } else state = "pending";
                return state;
            },
            { timeout, intervals: [250], message: `the turn did not end in ${String(timeout)} ms` },
        )
        .not.toBe("pending");
    return state;
}

const streamText = (stream: RecordedStream) => stream.chunks.map((chunk) => chunk.text).join("");
const seqsOf = (stream: RecordedStream) =>
    framesOf(streamText(stream)).flatMap((frame) => (frame.seq === undefined ? [] : [frame.seq]));
const isCreate = (stream: RecordedStream) => stream.method === "POST";
const isAttachOf = (submission: string) => (stream: RecordedStream) =>
    stream.method === "GET" && stream.path === eventsPath(submission);

test("1a: an attach after a lost create stream resumes the events with no gap (3 runs; replica from ACR's log)", async ({
    page,
}, testInfo) => {
    test.setTimeout(360_000);
    const streams = await watchStreams(page);
    const requestIds = watchRequestIds(page);
    const proxy = await startFaultProxy(ACR, "cut-after-first-stage");
    const evidence: Record<string, unknown> = {};
    const { calls, surface } = await panel(page);
    try {
        await divertCreates(page, proxy);
        const runs: Array<Record<string, unknown>> = [];
        for (const [index, name] of (["att1", "att2", "att3"] as const).entries()) {
            await ask(surface, question(name));
            await expect(answers(surface)).toHaveCount(index + 1, { timeout: 90_000 });
            const create = investigations(calls)[index]!;
            const submission = submissionOf(create);
            await expect
                .poll(() => streams.filter(isAttachOf(submission)).length, {
                    message: `${name}: no attach was read`,
                })
                .toBeGreaterThan(0);
            const created = streams.filter(isCreate).at(index);
            const attach = streams.find(isAttachOf(submission))!;
            expect(created, `${name}: the create stream was not read`).toBeDefined();
            const cursor = attach.lastEventId === null ? null : Number(attach.lastEventId);
            const mismatches = seqMismatches(seqsOf(created!), seqsOf(attach), cursor);
            runs.push({
                name,
                submission,
                create_seqs: seqsOf(created!),
                attach_seqs: seqsOf(attach),
                cursor,
                attach_status: attach.status,
                mismatches,
            });
            expect(
                proxy.exchanges[index]?.faulted,
                `${name}: the proxy did not cut the create`,
            ).toBe(true);
            expect(mismatches, `${name}: the attach did not resume with no gap`).toEqual([]);
        }
        evidence.runs = runs;
    } finally {
        evidence.proxy = proxy.exchanges.map(({ acrRequestId, receivedAt, fault, faulted }) => ({
            acrRequestId,
            receivedAt: new Date(receivedAt).toISOString(),
            fault,
            faulted,
        }));
        evidence.request_ids = requestIds;
        evidence.acr_calls = acrCalls(calls);
        await report(testInfo, "attach-seq-evidence", evidence);
        await proxy.close();
    }
});

test("1b: an attach with a Last-Event-ID ACR never issued gets 410 cursor_expired; the store reads the status, then replays", async ({
    page,
}, testInfo) => {
    test.setTimeout(240_000);
    const requestIds = watchRequestIds(page);
    const proxy = await startFaultProxy(ACR, "cut-after-first-stage");
    const evidence: Record<string, unknown> = {};
    const refusals: Array<{ status: number; code: unknown }> = [];
    page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.origin !== ACR || !url.pathname.endsWith("/events") || response.status() < 400)
            return;
        void response
            .json()
            .then((body: { error?: { code?: unknown } }) =>
                refusals.push({ status: response.status(), code: body.error?.code }),
            )
            .catch(() => refusals.push({ status: response.status(), code: null }));
    });
    const { calls, surface } = await panel(page);
    try {
        await divertCreates(page, proxy);
        // The first attach carries a cursor ACR never issued; any later one goes as the page sent it.
        let fabricated = false;
        await page.route(
            (url) => url.origin === ACR && /\/submissions\/[^/]+\/events$/u.test(url.pathname),
            async (route) => {
                if (fabricated || route.request().method() !== "GET") return route.continue();
                fabricated = true;
                await route.continue({
                    headers: { ...route.request().headers(), "last-event-id": "4503599627370495" },
                });
            },
        );
        await ask(surface, question("attCursor"));
        await expect(answers(surface)).toHaveCount(1, { timeout: 120_000 });
        const submission = submissionOf(investigations(calls)[0]!);
        const order = calls
            .map((call, index) => ({ call, index }))
            .filter(
                ({ call }) =>
                    call.path.startsWith(statusPath(submission)) ||
                    /\/result_[0-9a-f]{32}$/u.test(call.path),
            );
        const firstAttach = order.find(({ call }) => call.path === eventsPath(submission));
        const statusRead = order.find(
            ({ call, index }) =>
                call.path === statusPath(submission) && index > (firstAttach?.index ?? Infinity),
        );
        const replay = calls.findIndex(
            (call, index) =>
                /\/result_[0-9a-f]{32}$/u.test(call.path) &&
                call.status === 200 &&
                index > (statusRead?.index ?? Infinity),
        );
        evidence.fabricated = fabricated;
        evidence.refusals = refusals;
        evidence.order = order.map(({ call, index }) => ({
            index,
            method: call.method,
            path: call.path,
            status: call.status ?? null,
        }));
        expect(fabricated, "the store made no attach to fabricate a cursor on").toBe(true);
        expect(
            firstAttach?.call.status,
            "the attach with the fabricated cursor was not refused 410",
        ).toBe(410);
        expect(refusals[0]?.code, "ACR's 410 was not cursor_expired").toBe("cursor_expired");
        expect(statusRead, "after the 410 the store read no status").toBeDefined();
        expect(replay, "after the status the store replayed no result").toBeGreaterThan(-1);
        expect(investigations(calls), "the recovery sent a create").toHaveLength(1);
    } finally {
        evidence.request_ids = requestIds;
        evidence.acr_calls = acrCalls(calls);
        await report(testInfo, "cursor-expired-evidence", evidence);
        await proxy.close();
    }
});

test("2c: a result that finished first is kept: a cancel after it changes nothing", async ({
    page,
}, testInfo) => {
    test.setTimeout(180_000);
    const requestIds = watchRequestIds(page);
    const evidence: Record<string, unknown> = {};
    const { calls, surface } = await panel(page);
    try {
        await ask(surface, question("attKept"));
        await expect(answers(surface)).toHaveCount(1, { timeout: 90_000 });
        const create = investigations(calls)[0]!;
        const submission = submissionOf(create);
        const before = await acrCallAs(create, "GET", statusPath(submission));
        const cancel = await acrCallAs(create, "POST", `${statusPath(submission)}/cancel`);
        const after = await acrCallAs(create, "GET", statusPath(submission));
        const stateOf = (body: unknown) => (body as { state?: unknown } | null)?.state ?? null;
        const resultOf = (body: unknown) =>
            (body as { result_id?: unknown } | null)?.result_id ?? null;
        evidence.status_before = {
            status: before.status,
            state: stateOf(before.body),
            result_id: resultOf(before.body),
        };
        evidence.cancel = {
            status: cancel.status,
            code: (cancel.body as { error?: { code?: unknown } } | null)?.error?.code ?? null,
        };
        evidence.status_after = {
            status: after.status,
            state: stateOf(after.body),
            result_id: resultOf(after.body),
        };
        expect(stateOf(before.body), "the run was not done before the cancel").toBe("done");
        expect(cancel.status, "ACR took a cancel of a finished run").not.toBe(202);
        expect(evidence.status_after, "the cancel changed the finished run").toEqual({
            status: 200,
            state: "done",
            result_id: resultOf(before.body),
        });
        // The answer is still the conversation's after a reload.
        await page.reload({ waitUntil: "commit" });
        await page.getByRole("button", { name: "Open Ask Dev" }).click({ timeout: 30_000 });
        await expect(answers(page.getByTestId("ask-dev-panel"))).toHaveCount(1, {
            timeout: 30_000,
        });
    } finally {
        evidence.request_ids = requestIds;
        evidence.acr_calls = acrCalls(calls);
        await report(testInfo, "result-kept-evidence", evidence);
    }
});

test("2a: Stop on a long run: ACR takes the cancel, and no model attempt starts after it (ACR's log by p1)", async ({
    page,
}, testInfo) => {
    test.setTimeout(180_000);
    const requestIds = watchRequestIds(page);
    const evidence: Record<string, unknown> = {};
    const { calls, surface } = await panel(page);
    try {
        // Long: the oracle holds the interpretation 30 s, then the synthesis 35 s.
        await ask(surface, question("attStop"));
        await expect(activeStage(surface)).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(3_000);
        evidence.stop_clicked_at = new Date().toISOString();
        await surface.getByRole("button", { name: "Stop" }).click();
        const end = await endState(surface, 20_000);
        evidence.end = end;
        const cancels = calls.filter((call) => call.path.endsWith("/cancel"));
        evidence.cancel_statuses = cancels.map((call) => call.status ?? null);
        expect([202, 204], "ACR did not take the Stop").toContain(cancels.at(-1)?.status);
        expect(end, "the turn did not end as canceled").toBe("canceled");
        // No model attempt after the cancel: past the 30 s hold, the oracle saw no synthesis start.
        await page.waitForTimeout(35_000);
        const counts = await oracleCountsOf(question("attStop"));
        evidence.oracle = counts ?? null;
        expect(counts?.interpret?.started, "the oracle saw no interpretation for this run").toBe(1);
        expect(counts?.synthesize?.started ?? 0, "a synthesis started after the cancel").toBe(0);
    } finally {
        evidence.request_ids = requestIds;
        evidence.acr_calls = acrCalls(calls);
        await report(testInfo, "stop-evidence", evidence);
    }
});

test("4a and 4c: a reload during a long run restores it; the attach stays alive with keepalives, and no wait outlives D from accepted", async ({
    page,
}, testInfo) => {
    test.setTimeout(240_000);
    const streams = await watchStreams(page);
    const requestIds = watchRequestIds(page);
    const evidence: Record<string, unknown> = {};
    const { calls, surface } = await panel(page);
    try {
        await ask(surface, question("attLong"));
        await expect(activeStage(surface)).toBeVisible({ timeout: 15_000 });
        const submission = submissionOf(investigations(calls)[0]!);
        await page.reload({ waitUntil: "commit" });
        await page.getByRole("button", { name: "Open Ask Dev" }).click({ timeout: 30_000 });
        await expect(answers(page.getByTestId("ask-dev-panel"))).toHaveCount(1, {
            timeout: 150_000,
        });
        await expect
            .poll(() => streams.filter(isAttachOf(submission)).length, {
                message: "the restored run was not attached",
            })
            .toBeGreaterThan(0);
        const attach = streams.filter(isAttachOf(submission)).at(-1)!;
        const frames = framesOf(streamText(attach));
        const keepalives = frames.filter((frame) => frame.comment === "keepalive").length;
        const silence = longestSilenceMs(attach.chunks, attach.endedAt);
        // D, as the store takes it from the replayed accepted: started_at + budget_seconds + 30 s.
        const acceptedData = streamText(attach)
            .split(/\r?\n/u)
            .filter((line) => line.startsWith("data:"))
            .map(
                (line) =>
                    JSON.parse(line.slice(5).trim()) as {
                        type?: string;
                        started_at?: string;
                        budget_seconds?: number;
                    },
            )
            .find((event) => event.type === "accepted");
        expect(
            acceptedData,
            "the restored attach did not replay accepted: D does not come from it",
        ).toBeDefined();
        const deadline =
            Date.parse(acceptedData!.started_at!) + acceptedData!.budget_seconds! * 1000 + 30_000;
        const waits = {
            attach_headers: { from: attach.sentAt, to: attach.chunks[0]?.at ?? attach.endedAt },
            attach_stream: { from: attach.sentAt, to: attach.endedAt },
            status_reads: calls.filter(
                (call) => call.method === "GET" && call.path === statusPath(submission),
            ).length,
            replays: calls.filter((call) => /\/result_[0-9a-f]{32}$/u.test(call.path)).length,
        };
        evidence.attach = {
            cursor: attach.lastEventId,
            status: attach.status,
            seconds: Math.round((attach.endedAt - attach.sentAt) / 1000),
            keepalives,
            longest_silence_ms: silence,
        };
        evidence.deadline = {
            from: "accepted",
            D: new Date(deadline).toISOString(),
            budget_seconds: acceptedData!.budget_seconds,
        };
        evidence.waits = waits;
        expect(
            attach.lastEventId,
            "the restored run's attach sent a cursor: it is not the cursorless restore",
        ).toBeNull();
        expect(
            keepalives,
            "the attach stream sent no keepalive through its silences",
        ).toBeGreaterThanOrEqual(2);
        expect(
            silence,
            "the attach stream was silent longer than one keepalive interval",
        ).toBeLessThanOrEqual(11_000);
        expect(
            waits.attach_headers.to,
            "the attach's wait for headers outlived D",
        ).toBeLessThanOrEqual(deadline);
        expect(waits.attach_stream.to, "the attach stream outlived D").toBeLessThanOrEqual(
            deadline,
        );
    } finally {
        evidence.request_ids = requestIds;
        evidence.acr_calls = acrCalls(calls);
        await report(testInfo, "keepalive-deadline-evidence", evidence);
    }
});

test(`3: pod loss${POD_LOSS ? "" : " [behind a flag]"}: the run's pod is deleted; the turn ends as interrupted`, async ({
    page,
}, testInfo) => {
    test.skip(
        !POD_LOSS,
        "NOT RUN: an operator step. p1 deletes the run's acr-api pod (ASK_DEV_LIVE_POD_LOSS=1)",
    );
    test.setTimeout(300_000);
    const requestIds = watchRequestIds(page);
    const evidence: Record<string, unknown> = {};
    const { calls, surface } = await panel(page);
    try {
        await ask(surface, question("attPodLoss"));
        await expect(activeStage(surface)).toBeVisible({ timeout: 15_000 });
        const create = investigations(calls)[0]!;
        // For the operator: the run's ids, so ACR's log names its pod.
        const ids = {
            submission: submissionOf(create),
            request_ids: requestIds.map((id) => id.requestId),
        };
        console.log(`pod-loss run: ${JSON.stringify(ids)}`);
        evidence.run = ids;
        const end = await endState(surface, 240_000);
        evidence.end = end;
        expect(end, "the turn did not end as interrupted after its pod was lost").toBe(
            "interrupted",
        );
    } finally {
        evidence.request_ids = requestIds;
        evidence.acr_calls = acrCalls(calls);
        await report(testInfo, "pod-loss-evidence", evidence);
    }
});
