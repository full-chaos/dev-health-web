import { randomUUID } from "node:crypto";

import {
    expect,
    request as requestContext,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Locator,
    type Page,
} from "@playwright/test";

import { questionFor, type QuestionCase } from "./questions";
import {
    ACR,
    INVESTIGATIONS_PATH,
    ORACLE,
    authorize,
    investigations,
    references,
    secretsOf,
    signIn,
    watchAcr,
    type AcrCall,
} from "./stack";

/**
 * CHAOS-11933: the cases that send a question. ACR's model calls go to acr's `modeloracle`
 * (`tests/fullstack/modeloracle/testdata/i48-service-plan.v1.json`), never to a real model.
 *
 * The first guard is here: nothing is sent unless the oracle answers, and the first question must
 * raise its call count. Any failure stops the file, because the mode is serial. The stack's own
 * guards (the org source off, the egress block) are the slot's, and its receipts tally is the proof.
 */

const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const question = (name: QuestionCase): string => questionFor(name, NONCE);

test.describe.configure({ mode: "serial" });

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
let session: Session;
let oracle: APIRequestContext;

test.beforeAll(async ({ browser, baseURL }) => {
    expect(ORACLE, "ASK_DEV_LIVE_ORACLE is not set: no question may be sent").not.toBe("");
    expect(NONCE, "ASK_DEV_LIVE_NONCE is not set: run make-plan.ts for this run").not.toBe("");
    oracle = await requestContext.newContext();
    expect((await oracle.get(`${ORACLE}/health`)).status(), "the oracle is not up").toBe(204);
    const context = await browser.newContext({ baseURL: baseURL!, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await signIn(page);
    session = await context.storageState();
    await context.close();
});

test.afterAll(async () => {
    await oracle?.dispose();
});

test.use({
    // Playwright reads a fixture's first argument, so it stays a destructuring pattern.
    storageState: async ({}, provide) => {
        await provide(session);
    },
});

// Each case makes one silent authorization, in its own tab: web allows one user 6 a minute.
test.afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
});

type OperationCounts = {
    readonly started: number;
    readonly answered: number;
    readonly failed: number;
    readonly cancelled: number;
};
type Calls = {
    readonly started: number;
    readonly in_flight: number;
    readonly by_question: Readonly<Record<string, Readonly<Record<string, OperationCounts>>>>;
};

/** The one result a stream or a replay names. */
function resultId(body: string): string {
    const found = [...body.matchAll(/"result_id"\s*:\s*"(result_[^"]+)"/gu)].map((m) => m[1]!);
    expect(found.length, "the answer names no result").toBeGreaterThan(0);
    return found.at(-1)!;
}

async function oracleCalls(): Promise<Calls> {
    const response = await oracle.get(`${ORACLE}/service/calls`);
    expect(response.status(), "the oracle's counts cannot be read").toBe(200);
    return (await response.json()) as Calls;
}

/** The surface a case asks from: the panel, authorized, with an empty composer. */
async function panel(page: Page): Promise<{ calls: AcrCall[]; surface: Locator }> {
    const calls = watchAcr(page);
    await authorize(page);
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const surface = page.getByTestId("ask-dev-panel");
    await expect(surface.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
    return { calls, surface };
}

async function ask(surface: Locator, question: string): Promise<void> {
    const input = surface.getByRole("textbox", { name: "Ask a question" });
    await input.fill(question);
    await input.press("Enter");
}

const stages = (surface: Locator) => surface.locator("li.chat__stage");

test("P1-1: a real question shows its stages, then a whole answer", async ({ page }) => {
    const { calls, surface } = await panel(page);
    const before = await oracleCalls();
    const sent = Date.now();
    await ask(surface, question("stages"));

    await expect(stages(surface).first()).toBeVisible({ timeout: 5_000 });
    const seen = new Set<string>();
    let firstStage = 0;
    const answer = surface.getByRole("article", { name: "Answer" });
    await expect
        .poll(
            async () => {
                const active = surface.locator('li.chat__stage[data-state="active"]');
                for (const stage of await active.all()) {
                    const name = await stage.getAttribute("data-stage").catch(() => null);
                    if (name !== null) {
                        if (seen.size === 0) firstStage = Date.now() - sent;
                        seen.add(name);
                    }
                }
                return answer.isVisible();
            },
            { timeout: 60_000, intervals: [100] },
        )
        .toBe(true);
    const ran = Date.now() - sent;

    expect([...seen].length, `stages seen: ${[...seen].join(", ")}`).toBeGreaterThanOrEqual(2);
    expect(firstStage, "the first stage came more than 2 s after submit").toBeLessThan(2_000);
    expect(ran, "the run took less than 5 s").toBeGreaterThan(5_000);

    await expect(surface.getByTestId("answer-panel")).toBeVisible();
    await expect(surface.getByTestId("answer-panel")).not.toBeEmpty();
    await expect(surface.getByRole("group", { name: "Coverage", exact: true })).toBeVisible();
    await expect(surface.getByTestId("completeness-panel")).toBeVisible();
    await expect(references(surface).first()).toBeAttached();
    expect(investigations(calls)).toHaveLength(1);
    expect(investigations(calls)[0]!.status).toBe(200);

    const after = await oracleCalls();
    expect(after.started, "the question did not reach the oracle: stop").toBeGreaterThan(
        before.started,
    );
    expect(after.by_question[question("stages")], "the oracle saw another question").toBeDefined();
});

test("P1-6: a double submit is one question", async ({ page }) => {
    const { calls, surface } = await panel(page);
    const input = surface.getByRole("textbox", { name: "Ask a question" });
    await input.fill(question("doubleSubmit"));
    await input.dblclick();
    await input.press("Enter");
    await input.press("Enter").catch(() => undefined);
    await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
        timeout: 60_000,
    });
    expect(investigations(calls)).toHaveLength(1);
});

test("P1-2: Stop mid-stream ends the run within 10 s, and saves nothing", async ({ page }) => {
    const { calls, surface } = await panel(page);
    await ask(surface, question("stop"));
    await expect(surface.locator('li.chat__stage[data-state="active"]')).toBeVisible({
        timeout: 10_000,
    });
    await page.waitForTimeout(1_000);
    const asked = Date.now();
    await surface.getByRole("button", { name: "Stop" }).click();
    await expect(surface.getByTestId("chat-progress")).toHaveCount(0, { timeout: 15_000 });
    expect(Date.now() - asked, "the stop took more than 10 s").toBeLessThan(10_000);
    await expect(surface.getByRole("article", { name: "Answer" })).toHaveCount(0);
    const cancels = calls.filter((call) => call.path.endsWith("/cancel"));
    expect(cancels.length).toBeGreaterThan(0);
    expect([202, 204]).toContain(cancels.at(-1)!.status);
});

test("reload mid-stream: the run goes on, and its answer comes back", async ({ page }) => {
    const { calls, surface } = await panel(page);
    await ask(surface, question("reload"));
    await expect(surface.locator('li.chat__stage[data-state="active"]')).toBeVisible({
        timeout: 10_000,
    });
    await page.reload({ waitUntil: "commit" });
    await page.getByRole("button", { name: "Open Ask Dev" }).click({ timeout: 30_000 });
    await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
        timeout: 90_000,
    });
    expect(investigations(calls)).toHaveLength(1);
});

test("P1-3: a lost response and a same-key retry give one result and one execution", async ({
    page,
}) => {
    const { calls, surface } = await panel(page);
    await ask(surface, question("retry"));
    await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
        timeout: 60_000,
    });
    const before = await oracleCalls();
    const created = investigations(calls)[0]!;
    expect(created.status).toBe(200);
    const create = secretsOf(created);
    const headers = {
        Authorization: `Bearer ${create.bearer}`,
        "X-ACR-Resource": ACR,
        "X-ACR-Client-Version": "0.1.0",
        "X-ACR-Submission-ID": create.headers["x-acr-submission-id"]!,
        ...(create.headers["x-acr-thread-id"] === undefined
            ? {}
            : { "X-ACR-Thread-ID": create.headers["x-acr-thread-id"] }),
        Accept: "text/event-stream",
        "Content-Type": "application/json",
    };
    const acr = await requestContext.newContext({ ignoreHTTPSErrors: true });
    const again = await acr.post(`${ACR}${INVESTIGATIONS_PATH}`, {
        headers,
        data: create.body,
    });
    expect(again.status()).toBe(200);
    // The browser keeps no stream body, so the first result comes from ACR's status route.
    const submission = headers["X-ACR-Submission-ID"];
    const status = await acr.get(`${ACR}${INVESTIGATIONS_PATH}/submissions/${submission}`, {
        headers: { ...headers, Accept: "application/json" },
    });
    expect(status.status()).toBe(200);
    expect(resultId(await again.text())).toBe(resultId(await status.text()));
    expect(
        (await oracleCalls()).by_question[question("retry")],
        "the retry ran the model again",
    ).toEqual(before.by_question[question("retry")]);

    const changed = JSON.parse(create.body!) as { question: string };
    changed.question = question("stages");
    const mismatch = await acr.post(`${ACR}${INVESTIGATIONS_PATH}`, { headers, data: changed });
    expect(mismatch.status()).toBe(409);
    expect(((await mismatch.json()) as { error: { code: string } }).error.code).toBe(
        "submission_mismatch",
    );
    await acr.dispose();
});

test("P1-5: a reused answer whose terminal is lost is recovered by status and replay", async ({
    page,
}) => {
    const { calls, surface } = await panel(page);
    await ask(surface, question("reuse"));
    await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
        timeout: 60_000,
    });
    const asked = (await oracleCalls()).by_question[question("reuse")];
    expect(asked?.interpret?.answered, "the first ask did not reach the oracle").toBe(1);

    // The same owner in a new conversation: a turn in the same one is a follow-up, and ACR does
    // not reuse those. The stream loses its terminal on the way to the browser.
    await page.route(`${ACR}${INVESTIGATIONS_PATH}`, async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        const response = await route.fetch();
        const whole = await response.text();
        const end = whole.indexOf("event: result");
        expect(end, "the stream carried no result to lose").toBeGreaterThan(0);
        return route.fulfill({ response, body: whole.slice(0, end) });
    });
    await surface.getByTestId("ask-dev-history-toggle").click();
    await surface.getByRole("button", { name: "New conversation" }).click();
    calls.length = 0;
    await ask(surface, question("reuse"));
    await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
        timeout: 60_000,
    });

    const paths = calls.map((call) => call.path);
    expect(investigations(calls)).toHaveLength(1);
    // With the run lease on, the recovery is an attach to the run's events; with it off, the
    // status route and a replay of the final id.
    expect(
        paths.some((path) => /\/submissions\/[^/]+\/events$|\/investigations\/result_/u.test(path)),
        "the answer came back by no recovery path",
    ).toBe(true);
    expect((await oracleCalls()).by_question[question("reuse")], "a model ran again").toEqual(
        asked,
    );
});

test("P1-11: a run over 60 s reaches its answer, through the ingress", async ({ page }) => {
    test.setTimeout(150_000);
    const { surface } = await panel(page);
    const sent = Date.now();
    await ask(surface, question("long"));
    await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
        timeout: 110_000,
    });
    expect(Date.now() - sent).toBeGreaterThan(60_000);
});

test("a synthesis that runs out of time gives a degraded answer, not an error", async ({
    page,
}) => {
    test.setTimeout(170_000);
    const { surface } = await panel(page);
    await ask(surface, question("late"));
    await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
        timeout: 140_000,
    });
    await expect(surface.getByTestId("answer-panel")).not.toBeEmpty();
    const late = (await oracleCalls()).by_question[question("late")];
    expect(late?.interpret?.answered).toBe(1);
    expect(late?.synthesize?.answered, "the oracle answered the synthesis").toBe(0);
    expect(late?.synthesize?.cancelled).toBeGreaterThan(0);
});

test("P1-10: a principal's third concurrent run is refused, naming the principal limit", async ({
    page,
}) => {
    const { calls, surface } = await panel(page);
    await ask(surface, question("ceiling"));
    await expect(surface.locator('li.chat__stage[data-state="active"]')).toBeVisible({
        timeout: 10_000,
    });
    const create = secretsOf(investigations(calls)[0]!);
    const acr = await requestContext.newContext({ ignoreHTTPSErrors: true });
    const another = (submission: string, thread: string) =>
        acr.post(`${ACR}${INVESTIGATIONS_PATH}`, {
            headers: {
                Authorization: `Bearer ${create.bearer}`,
                "X-ACR-Resource": ACR,
                "X-ACR-Client-Version": "0.1.0",
                "X-ACR-Submission-ID": submission,
                "X-ACR-Thread-ID": thread,
                Accept: "text/event-stream",
                "Content-Type": "application/json",
            },
            data: {
                ...(JSON.parse(create.body!) as Record<string, unknown>),
                request_id: `request_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
            },
            timeout: 60_000,
        });
    const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
    // The second run holds its slot until the test ends; only the third answers at once.
    const second = another(id("sub"), id("thread"));
    second.catch(() => undefined);
    await page.waitForTimeout(2_000);
    const third = await another(id("sub"), id("thread"));
    expect(third.status()).toBe(429);
    const refused = (await third.json()) as {
        error: { code: string; details?: { limit?: string } };
    };
    expect(refused.error.code).toBe("concurrency_limited");
    expect(refused.error.details?.limit).toBe("principal");
    expect(third.headers()["retry-after"]).toMatch(/^\d+$/u);

    await surface.getByRole("button", { name: "Stop" }).click();
    await expect(surface.getByTestId("chat-progress")).toHaveCount(0, { timeout: 15_000 });
    await acr.dispose();
});
