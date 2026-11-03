import {
    expect,
    request as requestContext,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Locator,
    type Page,
    type Request,
} from "@playwright/test";

import { questionFor, type QuestionCase } from "./questions";
import {
    ACR,
    INVESTIGATIONS_PATH,
    ORACLE,
    OTHER_EMAIL,
    ask,
    authorize,
    expectAnswersSynthesized,
    panel,
    secretsOf,
    signIn,
    signInOther,
    watchAcr,
    watchResults,
    type AcrCall,
} from "./stack";

/**
 * CHAOS-12234: answer feedback, live, through the browser transport (the live half of CHAOS-11958).
 *
 * - AC-11: the panel and `/dev` set "Correct?" and "Useful?" on an answer, and a reload reads each
 *   back. A reused answer (its final `result_id` is another turn's) shows ONE feedback, in both
 *   surfaces.
 * - AC-3 (INV-1): another principal of the same organization, with the same grants, gets 404 on a
 *   read and on a set of the owner's feedback, and the owner's feedback is unchanged.
 * - No free text in telemetry: the browser's product telemetry during feedback use carries no
 *   feedback event and no question or answer text.
 *
 * Every read and set is checked twice: on the page (the pressed control) and at ACR (the stored
 * feedback, read with the page's own bearer). A control that shows a choice ACR did not store is red.
 */
const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const question = (name: QuestionCase): string => questionFor(name, NONCE);

const FEEDBACK_PATH = `${INVESTIGATIONS_PATH}/feedback/`;
const TELEMETRY_PATH = "/api/v1/product-telemetry/events";
const TELEMETRY_BINDING = "__askDevLiveTelemetry";

/**
 * Runs IN THE PAGE (`page.addInitScript`), before the app's scripts: wraps `navigator.sendBeacon`
 * and `fetch` so that a send to the telemetry path also hands its body text to `binding`. The send
 * itself goes on unchanged. A body that cannot be read as text is handed on as a marker, so the
 * case fails on it rather than skip it.
 */
function teeTelemetry({ path, binding }: { path: string; binding: string }): void {
    const hand = (data: unknown) => {
        const send = (window as unknown as Record<string, (body: string) => void>)[binding]!;
        if (typeof data === "string") send(data);
        else if (data instanceof Blob) void data.text().then(send);
        else send("[a telemetry body that is not text]");
    };
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
        if (String(url).includes(path)) hand(data);
        return beacon(url, data);
    };
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes(path)) hand(init?.body);
        return original(input, init);
    };
}

type Flag = "yes" | "no" | "unset";
type Stored = { readonly correct: Flag; readonly useful: Flag };

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

// Each case makes at least one silent authorization: web allows one user 6 a minute.
test.afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
});

/** The feedback groups of a surface's conversation, one per answered turn, in turn order. */
const feedbackGroups = (surface: Locator) =>
    surface.getByRole("group", { name: "Feedback on this answer" });

const control = (group: Locator, which: "correct" | "useful", value: "yes" | "no") =>
    group.getByTestId(`ask-dev-feedback-${which}-${value}`);

/** What the page shows for one question: the pressed value, or "unset". */
async function shown(group: Locator, which: "correct" | "useful"): Promise<Flag> {
    for (const value of ["yes", "no"] as const) {
        if ((await control(group, which, value).getAttribute("aria-pressed")) === "true") {
            return value;
        }
    }
    return "unset";
}

async function expectShown(group: Locator, want: Stored, label: string): Promise<void> {
    // Enabled first: the controls are disabled until the first read of this result answers.
    await expect(control(group, "correct", "yes"), `${label}: the read never answered`).toBeEnabled(
        { timeout: 30_000 },
    );
    await expect
        .poll(
            async () => ({
                correct: await shown(group, "correct"),
                useful: await shown(group, "useful"),
            }),
            {
                message: `${label}: the page shows other feedback`,
                timeout: 15_000,
            },
        )
        .toEqual(want);
}

/** The result ids the page read or set feedback on, in the order of its calls. */
const feedbackIds = (calls: readonly AcrCall[], method?: "GET" | "POST"): string[] =>
    calls
        .filter(
            (call) =>
                call.path.startsWith(FEEDBACK_PATH) &&
                (method === undefined || call.method === method),
        )
        .map((call) => decodeURIComponent(call.path.slice(FEEDBACK_PATH.length)));

/** Chooses one value and waits for ACR to take the set (200). */
async function choose(
    page: Page,
    calls: readonly AcrCall[],
    group: Locator,
    which: "correct" | "useful",
    value: "yes" | "no",
): Promise<void> {
    const before = feedbackIds(calls, "POST").length;
    const set = page.waitForResponse(
        (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname.startsWith(FEEDBACK_PATH),
    );
    await control(group, which, value).click();
    expect((await set).status(), `ACR did not take the ${which}=${value} set`).toBe(200);
    expect(feedbackIds(calls, "POST").length).toBe(before + 1);
}

/** A call to ACR with the headers of one of this page's own recorded calls (its bearer). */
async function acrAs(
    api: APIRequestContext,
    like: AcrCall,
    method: "GET" | "POST",
    resultId: string,
    body?: Stored,
) {
    const { headers } = secretsOf(like);
    const keep = Object.fromEntries(
        Object.entries(headers).filter(([name]) =>
            ["authorization", "x-acr-resource", "x-acr-client-version"].includes(
                name.toLowerCase(),
            ),
        ),
    );
    expect(keep.authorization, "the recorded call carried no bearer").toBeDefined();
    const url = `${ACR}${FEEDBACK_PATH}${encodeURIComponent(resultId)}`;
    return method === "GET"
        ? api.get(url, { headers: keep })
        : api.post(url, {
              headers: { ...keep, "content-type": "application/json" },
              data: { schema_version: "context_fabric_result_feedback_request.v1", ...body },
          });
}

/** The owner's stored feedback on a result, read at ACR with the page's own bearer. */
async function storedAt(api: APIRequestContext, like: AcrCall, resultId: string): Promise<Stored> {
    const response = await acrAs(api, like, "GET", resultId);
    expect(response.status(), "ACR did not serve the owner's feedback").toBe(200);
    const body = (await response.json()) as Stored;
    return { correct: body.correct, useful: body.useful };
}

/** A call this page made with a bearer that ACR took (200): a live, working authorization. */
const withBearer = (calls: readonly AcrCall[]): AcrCall => {
    const call = calls.findLast((item) => item.hasBearer && item.status === 200);
    expect(call, "the page made no ACR call that ACR took with a bearer").toBeDefined();
    return call!;
};

/**
 * The signed-in user's active organization and role, from web's own session. Only those two fields
 * leave the page: the session also holds tokens.
 */
const orgOf = (page: Page): Promise<{ org: string | null; role: string | null }> =>
    page.evaluate(async () => {
        const session = (await (await fetch("/api/auth/session")).json()) as {
            user?: { org_id?: string; role?: string };
        } | null;
        return { org: session?.user?.org_id ?? null, role: session?.user?.role ?? null };
    });

async function answered(surface: Locator, count: number): Promise<void> {
    await expect(surface.getByRole("article", { name: "Answer" })).toHaveCount(count, {
        timeout: 90_000,
    });
}

test("AC-11 panel: correct and useful are set on an answer, and a reload reads both back", async ({
    page,
}, testInfo) => {
    test.setTimeout(240_000);
    const results = await watchResults(page);
    const { calls, surface } = await panel(page);
    await ask(surface, question("fbPanel"));
    await answered(surface, 1);
    await expectAnswersSynthesized(results, "fbPanel");
    const group = feedbackGroups(surface).first();
    await expectShown(group, { correct: "unset", useful: "unset" }, "before any choice");
    const [resultId] = feedbackIds(calls, "GET");
    expect(resultId, "the page never read this answer's feedback").toMatch(/^result_/u);

    await choose(page, calls, group, "correct", "yes");
    await choose(page, calls, group, "useful", "no");
    await expectShown(group, { correct: "yes", useful: "no" }, "after the choices");
    const api = await requestContext.newContext({ ignoreHTTPSErrors: true });
    try {
        expect(await storedAt(api, withBearer(calls), resultId!)).toEqual({
            correct: "yes",
            useful: "no",
        });

        // The reload reads it back: a new read of the same result, and the same pressed controls.
        const readsBefore = feedbackIds(calls, "GET").length;
        await page.reload({ waitUntil: "commit" });
        await page.getByRole("button", { name: "Open Ask Dev" }).click({ timeout: 30_000 });
        await answered(surface, 1);
        await expectShown(
            feedbackGroups(surface).first(),
            { correct: "yes", useful: "no" },
            "after the reload",
        );
        expect(
            feedbackIds(calls, "GET").slice(readsBefore),
            "the reload did not read it back",
        ).toContain(resultId);
        await testInfo.attach("feedback-panel", {
            body: JSON.stringify({ result_id: resultId, sets: feedbackIds(calls, "POST") }),
            contentType: "application/json",
        });
    } finally {
        await api.dispose();
    }
});

test("AC-11 /dev: correct and useful are set on the full page, and a reload reads both back", async ({
    page,
}) => {
    test.setTimeout(240_000);
    const results = await watchResults(page);
    const { calls, surface } = await panel(page);
    await ask(surface, question("fbDev"));
    await answered(surface, 1);
    await expectAnswersSynthesized(results, "fbDev");
    await page.getByRole("button", { name: "Open full page" }).click();
    await expect(page).toHaveURL(/\/dev\?thread=/u);
    const full = page.getByTestId("ask-dev-page");
    await answered(full, 1);
    const group = feedbackGroups(full).first();
    await expectShown(group, { correct: "unset", useful: "unset" }, "/dev before any choice");
    await choose(page, calls, group, "correct", "no");
    await choose(page, calls, group, "useful", "yes");
    const [resultId] = feedbackIds(calls, "POST");

    const api = await requestContext.newContext({ ignoreHTTPSErrors: true });
    try {
        expect(await storedAt(api, withBearer(calls), resultId!)).toEqual({
            correct: "no",
            useful: "yes",
        });
        await page.reload({ waitUntil: "commit" });
        await answered(full, 1);
        await expectShown(
            feedbackGroups(full).first(),
            { correct: "no", useful: "yes" },
            "/dev after the reload",
        );
    } finally {
        await api.dispose();
    }
});

test("AC-11 reused answer: two turns with one final result_id show one feedback, in both surfaces", async ({
    page,
}) => {
    test.setTimeout(300_000);
    const results = await watchResults(page);
    const { calls, surface } = await panel(page);
    await ask(surface, question("fbReuse"));
    await answered(surface, 1);
    await expectAnswersSynthesized(results, "fbReuse, first");
    await choose(page, calls, feedbackGroups(surface).first(), "correct", "yes");
    const [first] = feedbackIds(calls, "POST");
    const firstThread = await threadOfPanel(page);

    // The same owner in a new conversation: ACR reuses the stored answer for the same question.
    await surface.getByTestId("ask-dev-history-toggle").click();
    await surface.getByRole("button", { name: "New conversation" }).click();
    const drawn = results.length;
    await ask(surface, question("fbReuse"));
    await answered(surface, 1);
    await expect
        .poll(() => results.length, { message: "the reused turn drew no result" })
        .toBeGreaterThan(drawn);
    // A reused answer: the second turn's final result is the first turn's.
    const reused = (results.at(-1) as { result_id?: string }).result_id;
    expect(reused, "ACR did not reuse the stored answer: the case tests nothing").toBe(first);

    // One feedback: the reused turn shows the first turn's choice, and a set on it is the same one.
    const group = feedbackGroups(surface).first();
    await expectShown(group, { correct: "yes", useful: "unset" }, "the reused turn");
    await choose(page, calls, group, "useful", "no");
    expect(new Set(feedbackIds(calls, "POST")), "the turns set feedback on two results").toEqual(
        new Set([first]),
    );

    // Both surfaces: the FIRST conversation on /dev shows the choice made on the reused turn.
    await page.goto(`/dev?thread=${firstThread}`, { waitUntil: "commit" });
    const full = page.getByTestId("ask-dev-page");
    await answered(full, 1);
    await expectShown(
        feedbackGroups(full).first(),
        { correct: "yes", useful: "no" },
        "/dev, first conversation",
    );
    const api = await requestContext.newContext({ ignoreHTTPSErrors: true });
    try {
        expect(await storedAt(api, withBearer(calls), first!)).toEqual({
            correct: "yes",
            useful: "no",
        });
    } finally {
        await api.dispose();
    }
});

/** The thread the panel's conversation is on: the full page names it in its URL. */
async function threadOfPanel(page: Page): Promise<string> {
    const back = page.url();
    await page.getByRole("button", { name: "Open full page" }).click();
    await expect(page).toHaveURL(/\/dev\?thread=/u);
    const thread = new URL(page.url()).searchParams.get("thread");
    expect(thread, "the full page names no thread").not.toBeNull();
    await page.getByTestId("ask-dev-minimize").click();
    await expect(page).toHaveURL((url) => url.href.startsWith(new URL(back).origin));
    return thread!;
}

test("AC-3 (INV-1): another principal of the organization can neither read nor set the owner's feedback", async ({
    page,
    browser,
    baseURL,
}, testInfo) => {
    test.setTimeout(420_000);
    expect(
        OTHER_EMAIL,
        "ASK_DEV_LIVE_OTHER_EMAIL is not set: AC-3 needs a second principal",
    ).not.toBe("");
    const results = await watchResults(page);
    const { calls, surface } = await panel(page);
    await ask(surface, question("fbGuard"));
    await answered(surface, 1);
    await expectAnswersSynthesized(results, "fbGuard");
    const group = feedbackGroups(surface).first();
    await choose(page, calls, group, "correct", "yes");
    await choose(page, calls, group, "useful", "yes");
    const [resultId] = feedbackIds(calls, "POST");
    const owner = withBearer(calls);

    // The other principal, signed in and authorized in a context of its own.
    // An empty session on purpose: a context made in a test takes the test's `use` options, so it
    // would hold the owner's storageState and land signed in as the owner (askdev-1, 2026-11-03).
    const context = await browser.newContext({
        baseURL: baseURL!,
        ignoreHTTPSErrors: true,
        storageState: { cookies: [], origins: [] },
    });
    const api = await requestContext.newContext({ ignoreHTTPSErrors: true });
    try {
        const other = await context.newPage();
        const otherCalls = watchAcr(other);
        const otherResults = await watchResults(other);
        await signInOther(other);
        await authorize(other);

        // The positive control (lead ruling): the second principal reads and sets feedback on its
        // OWN result. Without it, a 404 on the owner's result could mean it can read nothing at all.
        await other.getByRole("button", { name: "Open Ask Dev" }).click();
        const otherSurface = other.getByTestId("ask-dev-panel");
        await expect(otherSurface.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
        await ask(otherSurface, question("fbPeer"));
        await answered(otherSurface, 1);
        await expectAnswersSynthesized(otherResults, "fbPeer");
        const otherGroup = feedbackGroups(otherSurface).first();
        await expectShown(
            otherGroup,
            { correct: "unset", useful: "unset" },
            "the peer's own answer",
        );
        await choose(other, otherCalls, otherGroup, "correct", "yes");
        const [ownResult] = feedbackIds(otherCalls, "POST");
        expect(ownResult, "the peer's own result is the owner's").not.toBe(resultId);
        const theirs = withBearer(otherCalls);
        expect(
            await storedAt(api, theirs, ownResult!),
            "the peer cannot read its own feedback",
        ).toEqual({
            correct: "yes",
            useful: "unset",
        });
        const ownSet = await acrAs(api, theirs, "POST", ownResult!, {
            correct: "yes",
            useful: "yes",
        });
        expect(ownSet.status(), "the peer cannot set its own feedback").toBe(200);

        expect(secretsOf(theirs).bearer, "the two principals hold one bearer").not.toBe(
            secretsOf(owner).bearer,
        );
        // The precondition, measured (codex r1 P3): the other principal is in the owner's
        // organization. Another org would give 404 for a reason that is not the guard.
        const ownerOrg = await orgOf(page);
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

        const read = await acrAs(api, theirs, "GET", resultId!);
        expect(read.status(), "another principal read the owner's feedback").toBe(404);
        const set = await acrAs(api, theirs, "POST", resultId!, { correct: "no", useful: "no" });
        expect(set.status(), "another principal set the owner's feedback").toBe(404);
        expect(await storedAt(api, owner, resultId!), "the owner's feedback changed").toEqual({
            correct: "yes",
            useful: "yes",
        });
        // Discriminating: the owner's own read of the same result is 200, so the 404s are the guard.
    } finally {
        await api.dispose();
        await context.close();
    }
});

test("no free text in telemetry: feedback use sends no feedback event and no question or answer text", async ({
    page,
}, testInfo) => {
    test.setTimeout(240_000);
    // Every request the page sends, on any path and origin but ACR's (codex r1 P3): a request of
    // the feedback use (`inUse`) on another path is read too.
    const sent: { inUse: boolean; body: string }[] = [];
    let inUse = false;
    page.on("request", (request: Request) => {
        if (new URL(request.url()).origin === ACR) return;
        sent.push({ inUse, body: request.postData() ?? "" });
    });
    // The telemetry bodies, read in the page: the sink sends a Blob by sendBeacon, and Playwright
    // does not see a beacon's Blob body (askdev-1, 2026-11-03: every captured body was empty).
    const telemetry: string[] = [];
    await page.exposeBinding(TELEMETRY_BINDING, (_source, body: string) => {
        telemetry.push(body);
    });
    await page.addInitScript(teeTelemetry, { path: TELEMETRY_PATH, binding: TELEMETRY_BINDING });
    const results = await watchResults(page);
    const { calls, surface } = await panel(page);
    await ask(surface, question("fbTelemetry"));
    await answered(surface, 1);
    await expectAnswersSynthesized(results, "fbTelemetry");
    const mark = telemetry.length;
    inUse = true;
    const group = feedbackGroups(surface).first();
    await choose(page, calls, group, "correct", "yes");
    await choose(page, calls, group, "useful", "no");
    await choose(page, calls, group, "useful", "no");
    // The page turns hidden: the provider flushes the queue, and the page is still there to tee it.
    await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
    });
    const eventsOf = (body: string): unknown[] => {
        const parsed = JSON.parse(body) as { events?: unknown };
        expect(Array.isArray(parsed.events), "a telemetry body is not the sink's JSON").toBe(true);
        return parsed.events as unknown[];
    };
    const used = () => telemetry.slice(mark);
    // Discriminating: telemetry with events was really sent during the use, so the checks read it.
    await expect
        .poll(() => used().reduce((count, body) => count + eventsOf(body).length, 0), {
            message:
                "no product telemetry event was sent during the feedback use: nothing measured",
            timeout: 30_000,
        })
        .toBeGreaterThan(0);
    inUse = false;

    const answer = results[0] as { deterministic_answer?: string; direct_judgment?: string };
    const texts = [
        question("fbTelemetry"),
        NONCE,
        answer.deterministic_answer,
        answer.direct_judgment,
    ].filter((text): text is string => typeof text === "string" && text.length >= 6);
    expect(texts.length, "no question or answer text to look for").toBeGreaterThanOrEqual(2);
    const events = used().flatMap((body) => eventsOf(body));
    await testInfo.attach("telemetry", {
        body: JSON.stringify({
            requests: used().length,
            events: events.length,
            names: events.map((event) => (event as { name?: unknown }).name ?? null),
        }),
        contentType: "application/json",
    });
    const all = JSON.stringify(events);
    expect(/feedback/iu.test(all), "a telemetry event names feedback").toBe(false);
    // Any request of the window, telemetry or not, on any path: no question or answer text.
    const bodies = sent
        .filter((item) => item.inUse)
        .map((item) => item.body)
        .join("\n");
    for (const text of texts) {
        expect(all.includes(text), "telemetry carried question or answer text").toBe(false);
        expect(bodies.includes(text), "a request of the feedback use carried its text").toBe(false);
    }
});
