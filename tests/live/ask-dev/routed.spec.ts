import {
    expect,
    request as requestContext,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Locator,
    type Page,
} from "@playwright/test";

import {
    ACR,
    INVESTIGATIONS_PATH,
    ORACLE,
    connect,
    investigations,
    references,
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

const QUESTION = {
    answered: "What is the status of full-chaos/dev-health-web?",
    hold: "Hold: what is the status of full-chaos/dev-health-web?",
    long: "Long: what is the status of full-chaos/dev-health-web?",
    again: "Again: what is the status of full-chaos/dev-health-web?",
    late: "Late: what is the status of full-chaos/dev-health-web?",
} as const;

test.describe.configure({ mode: "serial" });

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
let session: Session;
let oracle: APIRequestContext;

test.beforeAll(async ({ browser, baseURL }) => {
    expect(ORACLE, "ASK_DEV_LIVE_ORACLE is not set: no question may be sent").not.toBe("");
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

test.afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
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

/** The surface a case asks from: the panel, connected, with an empty composer. */
async function panel(page: Page): Promise<{ calls: AcrCall[]; surface: Locator }> {
    const calls = watchAcr(page);
    await connect(page);
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
    await ask(surface, QUESTION.answered);

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
    expect(after.by_question[QUESTION.answered], "the oracle saw another question").toBeDefined();
});

test("P1-6: a double submit is one question", async ({ page }) => {
    const { calls, surface } = await panel(page);
    const input = surface.getByRole("textbox", { name: "Ask a question" });
    await input.fill(QUESTION.answered);
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
    await ask(surface, QUESTION.hold);
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
    await ask(surface, QUESTION.answered);
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
    await ask(surface, QUESTION.again);
    await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
        timeout: 60_000,
    });
    const before = await oracleCalls();
    const create = investigations(calls)[0]!;
    expect(create.status).toBe(200);
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
    expect(resultId(await again.text())).toBe(resultId(await create.text!()));
    expect(
        (await oracleCalls()).by_question[QUESTION.again],
        "the retry ran the model again",
    ).toEqual(before.by_question[QUESTION.again]);

    const changed = JSON.parse(create.body!) as { question: string };
    changed.question = QUESTION.answered;
    const mismatch = await acr.post(`${ACR}${INVESTIGATIONS_PATH}`, { headers, data: changed });
    expect(mismatch.status()).toBe(409);
    expect(((await mismatch.json()) as { error: { code: string } }).error.code).toBe(
        "submission_mismatch",
    );
    await acr.dispose();
});

test("P1-11: a run over 60 s reaches its answer, through the ingress", async ({ page }) => {
    test.setTimeout(150_000);
    const { surface } = await panel(page);
    const sent = Date.now();
    await ask(surface, QUESTION.long);
    await expect(surface.getByRole("article", { name: "Answer" })).toBeVisible({
        timeout: 110_000,
    });
    expect(Date.now() - sent).toBeGreaterThan(60_000);
});

test("a model that runs out of time shows the deadline state", async ({ page }) => {
    test.setTimeout(150_000);
    const { surface } = await panel(page);
    await ask(surface, QUESTION.late);
    await expect(surface.getByText("A model step ran out of time")).toBeVisible({
        timeout: 120_000,
    });
    await expect(surface.getByRole("article", { name: "Answer" })).toHaveCount(0);
});
