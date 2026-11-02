import {
    expect,
    request as requestContext,
    test,
    type BrowserContext,
    type Locator,
    type Page,
    type Request,
    type TestInfo,
} from "@playwright/test";

import { HOLD_HEADERS_MS, startFaultProxy, type FaultMode, type FaultProxy } from "./fault-proxy";
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
 * CHAOS-12199: each terminal the browser transport decides itself, on the real stack against the
 * real ACR. A healthy ACR never stalls, holds its headers, breaks its grammar or cuts a stream, so
 * the fault is put on the network: the browser's create goes through a forwarding proxy
 * (`fault-proxy.ts`) with one fault, and everything else goes to ACR directly.
 *
 * Each case asserts what ask-dev's render puts on the page: `ChatStatusPanel`'s
 * `data-testid="chat-status"` with its `data-status`, and its words (`chat-copy.ts`
 * `CHAT_STATUS_COPY`, web's strings). A reason code the page does not show is never asserted.
 *
 * The routed suite's guards hold here: nothing is sent unless the oracle answers, and only
 * `questions.ts`'s questions are asked. Each case gives its own verdict: a fault that does not end
 * the run says so in its failure.
 */

const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const question = (name: QuestionCase): string => questionFor(name, NONCE);

/** `CHAT_STATUS_COPY` (ask-dev `src/render/chat-copy.ts`): the words each end state shows. */
const WORDS = {
    stalled: "The answer stopped arriving. Ask again.",
    admission: "Ask Dev did not start the investigation in time. Ask again.",
    budgetExhausted: "Ask Dev ran out of time before the question could start. Ask again.",
    failed: "The investigation did not finish. Ask again.",
    interrupted: "Interrupted — ask again",
} as const;

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
 * A stack-wide window (lead ruling 2026-11-02 on CHAOS-12199): the stack owner sets one ACR value,
 * reads it back, the run takes only that window's test, and the owner restores it. Empty: the
 * cases that need no window.
 */
const WINDOW = process.env.ASK_DEV_LIVE_WINDOW ?? "";
const WINDOWS = ["stream_off", "allowance", "org_limit", "lease_off"] as const;

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

/**
 * Sends the browser's create to the proxy. `before` runs in the handler, before the request goes
 * on. Every other ACR call goes to ACR directly.
 */
async function divert(page: Page, proxy: FaultProxy, before?: () => Promise<void>) {
    await page.route(`${ACR}${INVESTIGATIONS_PATH}`, async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        await before?.();
        return route.continue({ url: `${proxy.origin}${INVESTIGATIONS_PATH}` });
    });
}

type EndState = {
    /** `answer`, or the `data-status` of the turn's `chat-status` panel. */
    readonly state: string;
    /** The panel's words, as shown. */
    readonly words: string;
    /** Epoch ms when the test saw it. */
    readonly seenAt: number;
};

/** Waits for the turn to end: its answer, or its `chat-status` panel. */
async function endState(surface: Locator, timeout: number): Promise<EndState> {
    const answer = surface.getByRole("article", { name: "Answer" });
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
    const seenAt = Date.now();
    const words =
        state === "answer"
            ? ""
            : ((await status.last().locator(".chat__status-words").textContent()) ?? "");
    return { state, words, seenAt };
}

/** What a call to ACR was: never its query, its headers or its body. */
const acrCalls = (calls: readonly AcrCall[]) =>
    calls.map(({ method, path, status }) => ({ method, path, status: status ?? null }));

async function evidence(
    testInfo: TestInfo,
    proxy: FaultProxy,
    calls: readonly AcrCall[],
    shown: Partial<EndState> & { readonly elapsedMs?: Record<string, number> },
) {
    await testInfo.attach("terminal-evidence", {
        contentType: "application/json",
        body: JSON.stringify(
            {
                fault: proxy.mode,
                state: shown.state ?? "not reached",
                words: shown.words ?? "",
                elapsed_ms: shown.elapsedMs ?? {},
                proxy: proxy.record(),
                acr_calls: acrCalls(calls),
            },
            null,
            2,
        ),
    });
}

/** The end state at desktop and at mobile width, into this test's output folder. */
async function screenshots(page: Page, testInfo: TestInfo, name: string) {
    for (const [width, height, label] of [
        [1440, 900, "desktop"],
        [390, 844, "mobile"],
    ] as const) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(500);
        await page.screenshot({ path: testInfo.outputPath(`${name}-${label}.png`) });
    }
}

/** One fault case: its proxy, its panel and its report, whatever the outcome. */
async function faultCase(
    page: Page,
    testInfo: TestInfo,
    mode: FaultMode,
    body: (
        proxy: FaultProxy,
        calls: AcrCall[],
        surface: Locator,
        shown: { end?: EndState; elapsedMs?: Record<string, number> },
    ) => Promise<void>,
    before?: () => Promise<void>,
) {
    const proxy = await startFaultProxy(ACR, mode);
    let calls: AcrCall[] = [];
    const shown: { end?: EndState; elapsedMs?: Record<string, number> } = {};
    try {
        const opened = await panel(page);
        calls = opened.calls;
        await divert(page, proxy, before);
        await body(proxy, calls, opened.surface, shown);
    } finally {
        await evidence(testInfo, proxy, calls, { ...shown.end, elapsedMs: shown.elapsedMs });
        await proxy.close();
    }
}

const noAnswer = (surface: Locator) =>
    expect(surface.getByRole("article", { name: "Answer" })).toHaveCount(0);

const statusPanel = (surface: Locator) => surface.getByTestId("chat-status").last();

test("window lease_off: stalled: no byte for 30 s after accepted ends the turn as stalled", async ({
    page,
}, testInfo) => {
    test.setTimeout(150_000);
    await faultCase(page, testInfo, "hold-after-accepted", async (proxy, _, surface, shown) => {
        // Hold: ACR's run is still in its 40 s interpretation when the browser gives up.
        await ask(surface, question("stop"));
        await expect
            .poll(() => proxy.exchanges[0]?.at.accepted, {
                message: "ACR's accepted never reached the proxy",
                timeout: 20_000,
            })
            .toBeDefined();
        const create = proxy.exchanges[0]!;
        const accepted = create.receivedAt + create.at.accepted!;
        const end = await endState(surface, 50_000);
        shown.end = end;
        shown.elapsedMs = { since_accepted: end.seenAt - accepted };
        expect(create.faulted, `the proxy did not hold the stream: ${create.fault}`).toBe(true);
        expect(
            end.state,
            "an answer shows: the store attached to the run or read its status after the stall, " +
                "so the stall did not end the run (is ACR's run lease on?)",
        ).not.toBe("answer");
        expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("stalled");
        await expect(statusPanel(surface)).toHaveAttribute("data-status", "stalled");
        await expect(statusPanel(surface)).toContainText(WORDS.stalled);
        await noAnswer(surface);
        expect(end.seenAt - accepted, "the turn ended before the 30 s stall").toBeGreaterThan(
            29_000,
        );
        expect(end.seenAt - accepted, "the turn ended more than 45 s after accepted").toBeLessThan(
            45_000,
        );
        await screenshots(page, testInfo, "stalled");
    });
});

test("admission_timeout: no response headers in 15 s ends the turn on the admission deadline", async ({
    page,
}, testInfo) => {
    await faultCase(page, testInfo, "hold-headers", async (proxy, _, surface, shown) => {
        const asked = Date.now();
        await ask(surface, question("ceiling"));
        const end = await endState(surface, 30_000);
        shown.end = end;
        shown.elapsedMs = { since_ask: end.seenAt - asked };
        const create = proxy.exchanges[0];
        expect(create, "the create never reached the proxy").toBeDefined();
        expect(create!.browserStatus, "the proxy sent the browser headers").toBeNull();
        expect(
            create!.at.browserGone,
            "the browser did not give up before the proxy's 16 s",
        ).toBeLessThan(HOLD_HEADERS_MS);
        expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("deadline");
        await expect(statusPanel(surface)).toHaveAttribute("data-status", "deadline");
        await expect(statusPanel(surface)).toContainText(WORDS.admission);
        await noAnswer(surface);
        expect(end.seenAt - asked, "the turn ended before the 15 s header wait").toBeGreaterThan(
            14_000,
        );
        expect(end.seenAt - asked, "the turn took more than 25 s to end").toBeLessThan(25_000);
        await screenshots(page, testInfo, "admission-timeout");
    });
});

test("invalid_upstream: a broken seq ends the turn as failed, with its reference", async ({
    page,
}, testInfo) => {
    await faultCase(
        page,
        testInfo,
        "corrupt-second-frame",
        async (proxy, calls, surface, shown) => {
            const asked = Date.now();
            await ask(surface, question("stages"));
            const end = await endState(surface, 60_000);
            shown.end = end;
            shown.elapsedMs = { since_ask: end.seenAt - asked };
            const create = proxy.exchanges[0];
            expect(create, "the create never reached the proxy").toBeDefined();
            expect(create!.faulted, `the proxy did not break the stream: ${create!.fault}`).toBe(
                true,
            );
            expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("failed");
            await expect(statusPanel(surface)).toHaveAttribute("data-status", "failed");
            // Not retryable: the run was admitted, so the words say ask again and no Retry shows.
            await expect(statusPanel(surface)).toContainText(WORDS.failed);
            await expect(statusPanel(surface).getByRole("button", { name: "Retry" })).toHaveCount(
                0,
            );
            // The reference is the request_id this turn sent: ACR sent no error.v1.
            const sent = JSON.parse(secretsOf(investigations(calls)[0]!).body!) as {
                request_id: string;
            };
            await expect(statusPanel(surface).getByTestId("chat-status-reference")).toContainText(
                sent.request_id,
            );
            await noAnswer(surface);
            await screenshots(page, testInfo, "invalid-upstream");
        },
    );
});

test("window lease_off: an end of stream with no terminal reads the status, then ends the turn as interrupted", async ({
    page,
}, testInfo) => {
    test.setTimeout(150_000);
    // ACR stores the result before it writes the terminal (acr `context_fabric_event_stream.go`),
    // so a cut just before it is recovered. A cut after the first stage, with the lease off, ends
    // the run on the disconnect (run 6, window 4).
    await faultCase(
        page,
        testInfo,
        "cut-after-first-stage",
        async (proxy, calls, surface, shown) => {
            const asked = Date.now();
            await ask(surface, question("stop"));
            const end = await endState(surface, 90_000);
            shown.end = end;
            shown.elapsedMs = { since_ask: end.seenAt - asked };
            const create = proxy.exchanges[0];
            expect(create, "the create never reached the proxy").toBeDefined();
            expect(create!.faulted, `the proxy did not cut the stream: ${create!.fault}`).toBe(
                true,
            );
            expect(
                end.state,
                "the run finished anyway (status done) and its answer shows: the fault did not end the run",
            ).not.toBe("answer");
            const submission = secretsOf(investigations(calls)[0]!).headers["x-acr-submission-id"];
            expect(submission, "the create carried no submission id").toBeDefined();
            const statusPath = `${INVESTIGATIONS_PATH}/submissions/${submission}`;
            const reads = calls.filter((call) => call.method === "GET" && call.path === statusPath);
            expect(reads.length, "the store never read the submission status").toBeGreaterThan(0);
            expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("interrupted");
            await expect(statusPanel(surface)).toHaveAttribute("data-status", "interrupted");
            await expect(statusPanel(surface)).toContainText(WORDS.interrupted);
            await noAnswer(surface);
            await screenshots(page, testInfo, "interrupted");
        },
    );
});

test("budget_exhausted: a resend after a 401 with too little budget left sends nothing", async ({
    page,
}, testInfo) => {
    // Before the page loads: the store's deadline and the transport's budget read this clock.
    await page.clock.install();
    let moved = false;
    await faultCase(
        page,
        testInfo,
        "unauthorized-once",
        async (proxy, calls, surface, shown) => {
            const asked = Date.now();
            await ask(surface, question("reload"));
            const end = await endState(surface, 30_000);
            shown.end = end;
            shown.elapsedMs = { since_ask: end.seenAt - asked };
            expect(moved, "the create never reached the route").toBe(true);
            expect(proxy.exchanges[0]?.browserStatus, "the proxy sent no 401").toBe(401);
            expect(
                end.state,
                `the page showed ${end.state}: "${end.words}". A 401 resend that ends in an ` +
                    "authorization state means the token store gave no other token",
            ).toBe("deadline");
            await expect(statusPanel(surface)).toHaveAttribute("data-status", "deadline");
            await expect(statusPanel(surface)).toContainText(WORDS.budgetExhausted);
            await noAnswer(surface);
            expect(proxy.exchanges, "a second create reached the proxy").toHaveLength(1);
            expect(investigations(calls), "the browser sent a second create").toHaveLength(1);
            await screenshots(page, testInfo, "budget-exhausted");
        },
        async () => {
            if (moved) return;
            moved = true;
            // D is 120 s after the submit; 112 s on, D − now − 5 s is under ACR's 10 s minimum.
            // `setSystemTime` fires no timer: only the wall clock moves.
            const now = await page.evaluate(() => Date.now());
            await page.clock.setSystemTime(now + 112_000);
        },
    );
});

/** The headers a create needs, from the panel's own create. Never logged. */
const CREATE_HEADERS = [
    "authorization",
    "x-acr-resource",
    "x-acr-client-version",
    "x-acr-submission-id",
    "x-acr-thread-id",
    "x-acr-wait-budget-seconds",
    "accept",
    "content-type",
] as const;

type Side = {
    readonly status: number;
    readonly requestId: string | null;
    /** Resolves true when ACR's `accepted` frame arrived. */
    readonly accepted: Promise<boolean>;
    readonly stop: () => void;
};

/**
 * One create the test sends itself, with the panel's own headers, before the panel's create goes
 * on: real ACR then answers the panel's create with the state this makes. It reads the stream in
 * the background until `stop`.
 */
async function sideCreate(
    request: Request,
    change: {
        readonly submission?: string;
        readonly thread?: string;
        readonly body?: string;
        /** Another credential: its bearer, with no resource header (it binds none). */
        readonly bearer?: string;
    } = {},
): Promise<Side> {
    const from = request.headers();
    const headers: Record<string, string> = {};
    for (const name of CREATE_HEADERS) if (from[name] !== undefined) headers[name] = from[name]!;
    if (change.bearer !== undefined) {
        headers.authorization = `Bearer ${change.bearer}`;
        delete headers["x-acr-resource"];
    }
    if (change.submission !== undefined) headers["x-acr-submission-id"] = change.submission;
    if (change.thread !== undefined) headers["x-acr-thread-id"] = change.thread;
    const controller = new AbortController();
    const response = await fetch(`${ACR}${INVESTIGATIONS_PATH}`, {
        method: "POST",
        headers,
        body: change.body ?? request.postData() ?? "",
        signal: controller.signal,
    });
    if (response.status !== 200) {
        const text = await response.text().catch(() => "");
        const code = /"code":\s*"([a-z_]+)"/u.exec(text)?.[1] ?? "no code";
        throw new Error(
            `the side create was answered ${String(response.status)} ${code}, not a stream`,
        );
    }
    let seen = "";
    let sawAccepted: (value: boolean) => void = () => undefined;
    const accepted = new Promise<boolean>((resolve) => {
        sawAccepted = resolve;
    });
    // Reads in the background; `accepted` settles at the first `accepted` frame, not at the end.
    void (async () => {
        const reader = response.body?.getReader();
        if (reader === undefined) return sawAccepted(false);
        const decoder = new TextDecoder();
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) return sawAccepted(false);
                seen += decoder.decode(value, { stream: true });
                if (/^event: ?accepted\r?$/mu.test(seen)) sawAccepted(true);
                if (seen.length > 65_536) seen = seen.slice(-4_096);
            }
        } catch {
            sawAccepted(false);
        }
    })();
    return {
        status: response.status,
        requestId: response.headers.get("x-request-id"),
        accepted: Promise.race([
            accepted,
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
        ]),
        stop: () => controller.abort(),
    };
}

/** ACR's own call, with the panel's bearer: never logged. */
async function acrCall(request: Request, method: "GET" | "POST", path: string) {
    const from = request.headers();
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
    let body: unknown = null;
    try {
        body = JSON.parse(text);
    } catch {
        body = null;
    }
    return { status: response.status, body };
}

/** The panel's first create is held until `side` has run; later creates go on unchanged. */
const started: { request?: Request; submissions: string[] } = { submissions: [] };

async function sideFirst(
    page: Page,
    side: (request: Request) => Promise<void>,
    headers?: (from: Record<string, string>) => Record<string, string>,
) {
    let held = false;
    await page.route(`${ACR}${INVESTIGATIONS_PATH}`, async (route) => {
        if (route.request().method() !== "POST" || held) return route.fallback();
        held = true;
        started.request = route.request();
        started.submissions.push(route.request().headers()["x-acr-submission-id"]!);
        await side(route.request());
        return route.continue(
            headers === undefined ? undefined : { headers: headers(route.request().headers()) },
        );
    });
}

async function report(testInfo: TestInfo, name: string, data: unknown) {
    await testInfo.attach(name, {
        contentType: "application/json",
        body: JSON.stringify(data, null, 2),
    });
}

const fresh = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

/** Ends every run a case started under the panel's bearer: the next case needs its slots. */
async function cancelRuns(request: Request | undefined, submissions: readonly string[]) {
    if (request === undefined) return;
    for (const submission of new Set(submissions)) {
        await acrCall(
            request,
            "POST",
            `${INVESTIGATIONS_PATH}/submissions/${submission}/cancel`,
        ).catch(() => undefined);
    }
}

test.describe("ACR's own states (AC4)", () => {
    test.afterEach(async () => {
        await cancelRuns(started.request, started.submissions);
        started.request = undefined;
        started.submissions = [];
    });

    test("409 submission_mismatch: the key reused for another request", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const { calls, surface } = await panel(page);
        let side: Side | undefined;
        await sideFirst(page, async (request) => {
            const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
            // Another question under the same key. ACR's request digest leaves `request_id` out
            // (run 3: a changed request_id was the same request), so the question changes.
            side = await sideCreate(request, {
                body: JSON.stringify({ ...body, question: question("stages") }),
            });
            expect(await side.accepted, "the first run under this key was not accepted").toBe(true);
        });
        try {
            await ask(surface, question("stop"));
            const end = await endState(surface, 60_000);
            await report(testInfo, "mismatch-evidence", {
                state: end.state,
                words: end.words,
                side_status: side?.status,
                side_request_id: side?.requestId,
                acr_calls: acrCalls(calls),
            });
            expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("mismatch");
            await expect(statusPanel(surface)).toContainText(
                "This question could not be sent again as it was first sent. Ask again.",
            );
            await noAnswer(surface);
            await screenshots(page, testInfo, "mismatch");
        } finally {
            side?.stop();
        }
    });

    test("409 submission_abandoned: the key's run ended without an answer", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const { calls, surface } = await panel(page);
        let side: Side | undefined;
        let ended: unknown;
        await sideFirst(page, async (request) => {
            side = await sideCreate(request);
            expect(await side.accepted, "the first run under this key was not accepted").toBe(true);
            const submission = request.headers()["x-acr-submission-id"]!;
            const base = `${INVESTIGATIONS_PATH}/submissions/${submission}`;
            const cancel = await acrCall(request, "POST", `${base}/cancel`);
            expect([202, 204], "ACR did not take the cancel").toContain(cancel.status);
            side.stop();
            await expect
                .poll(
                    async () => {
                        const status = await acrCall(request, "GET", base);
                        ended = status.body;
                        return (status.body as { state?: string } | null)?.state;
                    },
                    {
                        // The panel's create waits in the route: past 15 s it is an admission timeout.
                        timeout: 10_000,
                        intervals: [250],
                        message: "the run under this key did not end",
                    },
                )
                .toBe("abandoned");
        });
        await ask(surface, question("stop"));
        const end = await endState(surface, 60_000);
        await report(testInfo, "abandoned-evidence", {
            state: end.state,
            words: end.words,
            side_status: side?.status,
            side_request_id: side?.requestId,
            status_before: ended,
            acr_calls: acrCalls(calls),
        });
        expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("abandoned");
        await expect(statusPanel(surface)).toContainText(
            "An earlier run of this question ended without an answer. Ask again.",
        );
        await noAnswer(surface);
        await screenshots(page, testInfo, "abandoned");
    });

    test("409 submission_in_progress: the store polls the status and replays the final answer", async ({
        page,
    }, testInfo) => {
        test.setTimeout(170_000);
        const { calls, surface } = await panel(page);
        let side: Side | undefined;
        let submission = "";
        await sideFirst(page, async (request) => {
            submission = request.headers()["x-acr-submission-id"]!;
            side = await sideCreate(request);
            expect(await side.accepted, "the first run under this key was not accepted").toBe(true);
        });
        try {
            await ask(surface, question("stop"));
            const end = await endState(surface, 140_000);
            const statusPath = `${INVESTIGATIONS_PATH}/submissions/${submission}`;
            const polls = calls.filter((call) => call.method === "GET" && call.path === statusPath);
            const replays = calls.filter(
                (call) =>
                    call.method === "GET" && call.path.startsWith(`${INVESTIGATIONS_PATH}/result_`),
            );
            const creates = investigations(calls);
            await report(testInfo, "in-progress-evidence", {
                state: end.state,
                side_status: side?.status,
                side_request_id: side?.requestId,
                create_statuses: creates.map((call) => call.status ?? null),
                status_polls: polls.length,
                replays: replays.map((call) => call.path.slice(INVESTIGATIONS_PATH.length + 1)),
                acr_calls: acrCalls(calls),
            });
            expect(
                creates.map((call) => call.status),
                "ACR did not answer 409",
            ).toContain(409);
            expect(polls.length, "the store did not poll the submission status").toBeGreaterThan(1);
            expect(replays.length, "the store did not replay the final answer").toBeGreaterThan(0);
            expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("answer");
            expect(creates, "the store sent a second create").toHaveLength(1);
            await screenshots(page, testInfo, "in-progress-recovered");
        } finally {
            side?.stop();
        }
    });

    test("504 request deadline: ACR's budget runs out before an answer", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const { calls, surface } = await panel(page);
        // A budget ACR admits (at 10 s it refuses as budget_exhausted, run 1), which the long run
        // (30 s interpretation, 35 s synthesis) outlasts.
        await sideFirst(
            page,
            async () => undefined,
            (from) => ({ ...from, "x-acr-wait-budget-seconds": "25" }),
        );
        await ask(surface, question("long"));
        const end = await endState(surface, 90_000);
        await report(testInfo, "request-deadline-evidence", {
            state: end.state,
            words: end.words,
            acr_calls: acrCalls(calls),
        });
        expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("deadline");
        await expect(statusPanel(surface)).toContainText(
            "The investigation ran out of time before an answer. Ask again, or ask a narrower question.",
        );
        await noAnswer(surface);
        await screenshots(page, testInfo, "request-deadline");
    });

    test("model deadline: a synthesis out of time renders a degraded answer", async ({
        page,
    }, testInfo) => {
        test.setTimeout(170_000);
        const { calls, surface } = await panel(page);
        await ask(surface, question("late"));
        await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
            timeout: 140_000,
        });
        await expect(surface.getByTestId("answer-panel")).not.toBeEmpty();
        await report(testInfo, "degraded-evidence", { acr_calls: acrCalls(calls) });
        await screenshots(page, testInfo, "degraded-answer");
    });
});

test.describe("stack-wide windows (AC3, AC4)", () => {
    test.afterEach(async () => {
        await cancelRuns(started.request, started.submissions);
        started.request = undefined;
        started.submissions = [];
    });

    test("window stream_off: a 406 stream_unavailable shows its own state", async ({
        page,
    }, testInfo) => {
        const { calls, surface } = await panel(page);
        await ask(surface, question("stages"));
        const end = await endState(surface, 30_000);
        await report(testInfo, "stream-off-evidence", {
            state: end.state,
            words: end.words,
            acr_calls: acrCalls(calls),
        });
        expect(investigations(calls).map((call) => call.status)).toContain(406);
        expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe(
            "stream_unavailable",
        );
        await expect(statusPanel(surface)).toContainText(
            "Ask Dev cannot stream answers on this deployment right now. Contact your administrator.",
        );
        await screenshots(page, testInfo, "stream-unavailable");
    });

    test("window allowance: a 429 allowance_exhausted shows its state", async ({
        page,
    }, testInfo) => {
        const { calls, surface } = await panel(page);
        const created = page.waitForResponse(
            (response) =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname === INVESTIGATIONS_PATH,
        );
        await ask(surface, question("stages"));
        const retryAfter = (await created).headers()["retry-after"] ?? null;
        const end = await endState(surface, 30_000);
        await report(testInfo, "allowance-evidence", {
            state: end.state,
            words: end.words,
            retry_after: retryAfter,
            acr_calls: acrCalls(calls),
        });
        expect(retryAfter, "ACR sent no Retry-After").toMatch(/^\d+$/u);
        expect(investigations(calls).map((call) => call.status)).toContain(429);
        expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("limited");
        await expect(statusPanel(surface)).toContainText(
            "Your organization has used this month's Ask Dev allowance.",
        );
        await screenshots(page, testInfo, "allowance");
    });

    test("window org_limit: a 429 for the organization names the org and the time", async ({
        page,
    }, testInfo) => {
        // ACR checks the principal limit first, and a principal is a user on one surface. The org's
        // one slot (both limits 1) goes to the same admin on the device surface, through the
        // product's device flow (lead ruling 2026-11-02, option a). That credential is revoked
        // at the end, and the revoke is read back.
        test.setTimeout(200_000);
        const json = { "content-type": "application/json", accept: "application/json" };
        const start = await fetch(`${ACR}/api/v1/oauth/device_authorization`, {
            method: "POST",
            headers: { ...json, "x-acr-client-version": "0.1.0" },
            body: JSON.stringify({ schema_version: "device_authorization_request.v1" }),
        });
        expect(start.status, "ACR refused the device authorization").toBe(200);
        const grant = (await start.json()) as { device_code: string; user_code: string };
        const approval = await page.context().newPage();
        await approval.goto(`/acr/device?user_code=${encodeURIComponent(grant.user_code)}`);
        // Web's device page: the code comes filled, "Preview request", then "Confirm".
        const preview = approval.getByRole("button", { name: "Preview request" });
        await expect(preview).toBeEnabled({ timeout: 30_000 });
        await approval.waitForTimeout(2_000);
        await preview.click();
        const confirm = approval.getByRole("button", { name: "Confirm" });
        await expect(confirm).toBeEnabled({ timeout: 30_000 });
        await confirm.click();
        let device = "";
        await expect
            .poll(
                async () => {
                    const answer = await fetch(`${ACR}/api/v1/oauth/token`, {
                        method: "POST",
                        headers: { ...json, "x-acr-client-version": "0.1.0" },
                        body: JSON.stringify({
                            schema_version: "device_token_request.v1",
                            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                            device_code: grant.device_code,
                        }),
                    });
                    if (answer.status !== 200) return answer.status;
                    device = ((await answer.json()) as { access_token: string }).access_token;
                    return 200;
                },
                {
                    timeout: 60_000,
                    intervals: [5_000],
                    message: "the device credential never came",
                },
            )
            .toBe(200);
        await approval.close();
        const { calls, surface } = await panel(page);
        let side: Side | undefined;
        const sideSubmission = fresh("sub");
        let cancel = 0;
        let revoke = 0;
        let afterRevoke = 0;
        await sideFirst(page, async (request) => {
            side = await sideCreate(request, {
                submission: sideSubmission,
                thread: fresh("thread"),
                bearer: device,
            });
            expect(await side.accepted, "the run holding the slot was not accepted").toBe(true);
        });
        try {
            await ask(surface, question("stop"));
            const end = await endState(surface, 30_000);
            await report(testInfo, "org-limit-evidence", {
                state: end.state,
                words: end.words,
                side_request_id: side?.requestId,
                acr_calls: acrCalls(calls),
            });
            expect(investigations(calls).map((call) => call.status)).toContain(429);
            expect(end.state, `the page showed ${end.state}: "${end.words}"`).toBe("limited");
            await expect(statusPanel(surface)).toContainText(
                "Your organization already has as many questions running as Ask Dev allows. Try again shortly.",
            );
            await expect(statusPanel(surface)).toContainText(/\d/u);
            await screenshots(page, testInfo, "org-limit");
        } finally {
            side?.stop();
            const self = {
                ...json,
                authorization: `Bearer ${device}`,
                "x-acr-client-version": "0.1.0",
            };
            // The run lease keeps the run going after its stream closes: end it first.
            cancel = (
                await fetch(`${ACR}${INVESTIGATIONS_PATH}/submissions/${sideSubmission}/cancel`, {
                    method: "POST",
                    headers: self,
                })
            ).status;
            revoke = (
                await fetch(`${ACR}/api/v1/auth/credentials/self/revoke`, {
                    method: "POST",
                    headers: self,
                    body: JSON.stringify({ schema_version: "credential_revoke_request.v1" }),
                })
            ).status;
            afterRevoke = (
                await fetch(`${ACR}/api/v1/auth/credentials/self/revoke`, {
                    method: "POST",
                    headers: self,
                    body: JSON.stringify({ schema_version: "credential_revoke_request.v1" }),
                })
            ).status;
            await report(testInfo, "device-credential-revoke", {
                cancel,
                revoke,
                after_revoke: afterRevoke,
            });
        }
        expect(revoke, "the device credential's revoke").toBe(200);
        expect(afterRevoke, "the revoked device credential still answers").toBe(401);
    });
});

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

test.describe("the transport's terminals when the run has ended (AC2, run lease on)", () => {
    test("stalled, and the run ended: the turn shows its end, not an answer", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        await faultCase(
            page,
            testInfo,
            "hold-after-accepted",
            async (proxy, calls, surface, shown) => {
                await ask(surface, question("stop"));
                await expect
                    .poll(() => proxy.exchanges[0]?.at.accepted, { timeout: 20_000 })
                    .toBeDefined();
                const create = investigations(calls)[0]!;
                const submission = secretsOf(create).headers["x-acr-submission-id"]!;
                const cancel = await acrCallAs(
                    create,
                    "POST",
                    `${INVESTIGATIONS_PATH}/submissions/${submission}/cancel`,
                );
                const end = await endState(surface, 60_000);
                shown.end = end;
                await report(testInfo, "stalled-ended-evidence", {
                    cancel_status: cancel.status,
                    state: end.state,
                    words: end.words,
                    acr_calls: acrCalls(calls),
                });
                expect([202, 204], "ACR did not take the cancel").toContain(cancel.status);
                expect(end.state, `the page showed ${end.state}: "${end.words}"`).not.toBe(
                    "answer",
                );
                await screenshots(page, testInfo, `stalled-ended-${end.state}`);
            },
        );
    });

    test("an end of stream with no terminal, and the run ended: the attach ends the turn", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        await faultCase(
            page,
            testInfo,
            "cut-after-first-stage",
            async (proxy, calls, surface, shown) => {
                await ask(surface, question("stop"));
                await expect
                    .poll(() => proxy.exchanges[0]?.faulted, { timeout: 30_000 })
                    .toBe(true);
                const create = investigations(calls)[0]!;
                const submission = secretsOf(create).headers["x-acr-submission-id"]!;
                const statusPath = `${INVESTIGATIONS_PATH}/submissions/${submission}`;
                const cancel = await acrCallAs(create, "POST", `${statusPath}/cancel`);
                const end = await endState(surface, 60_000);
                shown.end = end;
                // With the run lease on, the store attaches to the run after a lost stream (run 5).
                const attaches = calls.filter(
                    (call) => call.method === "GET" && call.path === `${statusPath}/events`,
                );
                await report(testInfo, "cut-ended-evidence", {
                    cancel_status: cancel.status,
                    state: end.state,
                    words: end.words,
                    attaches: attaches.length,
                    acr_calls: acrCalls(calls),
                });
                expect([202, 204], "ACR did not take the cancel").toContain(cancel.status);
                expect(attaches.length, "the store did not attach to the run").toBeGreaterThan(0);
                expect(end.state, `the page showed ${end.state}: "${end.words}"`).not.toBe(
                    "answer",
                );
                await screenshots(page, testInfo, `cut-ended-${end.state}`);
            },
        );
    });
});
