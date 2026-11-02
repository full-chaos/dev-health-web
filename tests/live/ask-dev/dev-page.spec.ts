import {
    expect,
    request as requestContext,
    test,
    type BrowserContext,
    type Locator,
    type Page,
    type TestInfo,
} from "@playwright/test";

import { questionFor, type QuestionCase } from "./questions";
import {
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
 * CHAOS-12209 (I-18's live half): Expand and Minimize move the view, never the run, on the real
 * stack against real ACR, through the browser transport (no mock transport).
 *
 * - AC1: Expand while the stream is open shows the same running turn on `/dev`, then the answer from
 *   that same stream: one create. The run script counts ACR's submission lines for each create's
 *   `request_id`.
 * - AC2: Expand after the answer shows it again with no create.
 * - AC3: Minimize reopens the panel on the page it came from, with the same turns, and the next
 *   question sends the same thread id and a new submission id, read on the wire.
 * - AC4, as E6 (CHAOS-11956) now makes it: ACR holds this thread, so a reload restores it, on `/dev`
 *   and in the panel, with no create and no "not saved" notice. The notice for a conversation ACR
 *   never admitted is proven in test mode (`tests/ask-dev-full-page.spec.ts`).
 *
 * Phase 2's P2-1 (`phase2.spec.ts`) holds Expand and Minimize by the browser's create count; this
 * adds the wire headers, the reload, ACR's own count and the screenshots.
 */

const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const question = (name: QuestionCase): string => questionFor(name, NONCE);

/** The panel's words for a conversation a reload lost (CHAOS-11934). */
const NOT_SAVED = "This conversation was not saved yet.";

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

const answers = (surface: Locator) => surface.getByRole("article", { name: "Answer" });
const activeStage = (surface: Locator) => surface.locator('li.chat__stage[data-state="active"]');

/** One of the create's correlation headers: a prefixed 32-hex id. */
function headerOf(call: AcrCall, name: "x-acr-thread-id" | "x-acr-submission-id"): string {
    const value = secretsOf(call).headers[name];
    expect(value, `the create sent no ${name}`).toMatch(/^[a-z]+_[0-9a-f]{32}$/u);
    return value!;
}

/** What a call to ACR was: never its query, its headers or its body. */
const acrCalls = (calls: readonly AcrCall[]) =>
    calls.map(({ method, path, status }) => ({ method, path, status: status ?? null }));

/** The view at desktop and at mobile width, into this test's output folder. */
async function screenshots(page: Page, testInfo: TestInfo, name: string) {
    for (const [width, height, label] of [
        [1440, 900, "desktop"],
        [390, 844, "mobile"],
    ] as const) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(500);
        await page.screenshot({ path: testInfo.outputPath(`${name}-${label}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
}

test("Expand and Minimize move the view, never the run; a reload restores the thread", async ({
    page,
}, testInfo) => {
    test.setTimeout(300_000);
    const requestIds: (string | null)[] = [];
    page.on("response", (response) => {
        const url = new URL(response.url());
        if (response.request().method() === "POST" && url.pathname === INVESTIGATIONS_PATH) {
            requestIds.push(response.headers()["x-request-id"] ?? null);
        }
    });
    const { calls, surface } = await panel(page);
    const from = new URL(page.url()).pathname;
    const evidence: Record<string, unknown> = { from };
    try {
        // AC1: Expand while the stream is open.
        await ask(surface, question("devExpand"));
        await expect(activeStage(surface)).toBeVisible({ timeout: 15_000 });
        await page.getByRole("button", { name: "Open full page" }).click();
        await expect(page).toHaveURL(/\/dev\?thread=/u);
        const thread = new URL(page.url()).searchParams.get("thread");
        const full = page.getByTestId("ask-dev-page");
        await expect(full.getByText(question("devExpand"))).toBeVisible();
        // The same running turn: the stage that was active in the panel is active here.
        evidence.running_on_dev = await activeStage(full).count();
        await expect(answers(full)).toHaveCount(1, { timeout: 90_000 });
        evidence.creates_after_expand = investigations(calls).length;
        expect(investigations(calls), "Expand sent the question again").toHaveLength(1);
        expect(evidence.running_on_dev, "/dev did not show the running turn").toBe(1);
        const first = investigations(calls)[0]!;
        const threadId = headerOf(first, "x-acr-thread-id");
        const firstSubmission = headerOf(first, "x-acr-submission-id");
        expect(thread, "the page's thread is not the create's").toBe(threadId);
        await screenshots(page, testInfo, "dev-after-expand");

        // AC2: Minimize, then Expand again after the answer.
        await page.getByTestId("ask-dev-minimize").click();
        await expect(page).toHaveURL((url) => url.pathname === from);
        await expect(answers(surface)).toHaveCount(1);
        await page.getByRole("button", { name: "Open full page" }).click();
        await expect(page).toHaveURL(/\/dev\?thread=/u);
        expect(new URL(page.url()).searchParams.get("thread"), "the thread changed").toBe(threadId);
        await expect(answers(full)).toHaveCount(1);
        evidence.creates_after_second_expand = investigations(calls).length;
        expect(investigations(calls), "Expand after the answer sent a create").toHaveLength(1);

        // AC3: Minimize to the page it came from, with the same turns; the next question goes on
        // the same thread with a new submission.
        await page.getByTestId("ask-dev-minimize").click();
        await expect(page).toHaveURL((url) => url.pathname === from);
        await expect(surface.getByText(question("devExpand"))).toBeVisible();
        await expect(answers(surface)).toHaveCount(1);
        await screenshots(page, testInfo, "panel-after-minimize");
        await ask(surface, question("devFollowUp"));
        await expect(answers(surface)).toHaveCount(2, { timeout: 90_000 });
        expect(investigations(calls), "the follow-up sent other than one create").toHaveLength(2);
        const second = investigations(calls)[1]!;
        const secondSubmission = headerOf(second, "x-acr-submission-id");
        evidence.thread_id_same = headerOf(second, "x-acr-thread-id") === threadId;
        evidence.submission_id_new = secondSubmission !== firstSubmission;
        expect(evidence.thread_id_same, "the follow-up left the thread").toBe(true);
        expect(evidence.submission_id_new, "the follow-up reused the submission id").toBe(true);

        // AC4: a reload restores the thread, on /dev and in the panel, with no create.
        await page.goto(`/dev?thread=${threadId}`, { waitUntil: "commit" });
        await expect(answers(full)).toHaveCount(2, { timeout: 30_000 });
        await page.reload({ waitUntil: "commit" });
        await expect(answers(full)).toHaveCount(2, { timeout: 30_000 });
        evidence.not_saved_on_dev = await full.getByText(NOT_SAVED).count();
        await screenshots(page, testInfo, "dev-after-reload");
        await page.goto(from, { waitUntil: "commit" });
        await page.getByRole("button", { name: "Open Ask Dev" }).click({ timeout: 30_000 });
        await expect(answers(surface)).toHaveCount(2, { timeout: 30_000 });
        await page.reload({ waitUntil: "commit" });
        await page.getByRole("button", { name: "Open Ask Dev" }).click({ timeout: 30_000 });
        await expect(answers(surface)).toHaveCount(2, { timeout: 30_000 });
        evidence.not_saved_in_panel = await surface.getByText(NOT_SAVED).count();
        await screenshots(page, testInfo, "panel-after-reload");
        evidence.creates_at_end = investigations(calls).length;
        expect(investigations(calls), "a reload sent a create").toHaveLength(2);
        expect(
            [evidence.not_saved_on_dev, evidence.not_saved_in_panel],
            "a restored thread said it was not saved",
        ).toEqual([0, 0]);
    } finally {
        evidence.request_ids = requestIds;
        evidence.acr_calls = acrCalls(calls);
        await testInfo.attach("dev-page-evidence", {
            contentType: "application/json",
            body: JSON.stringify(evidence, null, 2),
        });
    }
});
