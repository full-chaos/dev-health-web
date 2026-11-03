import { readFileSync } from "node:fs";

import {
    expect,
    request as requestContext,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Locator,
    type Page,
} from "@playwright/test";

import { repositoryScopeFailures } from "./answer-scope";
import { latencyQuestionFor, pageQuestionFor, questionFor, type LatencyCase } from "./questions";
import {
    ACR,
    INVESTIGATIONS_PATH,
    ORACLE,
    authorize,
    expectAnswersSynthesized,
    investigations,
    secretsOf,
    signIn,
    watchAcr,
    watchPageLoad,
    watchResults,
    type AcrCall,
} from "./stack";

/**
 * CHAOS-11940: the Phase 2 exits on a deployed stack (plan §4). The questions go to acr's
 * `modeloracle`, never to a real model. P2-4 is CHAOS-3598's case on this harness; P2-6 is
 * CHAOS-11939's.
 *
 * "A repository page" is `/metrics` scoped to one repository (lead's ruling on CHAOS-11899): web has
 * no repository detail page. The question names no subject, so the page's hint is the only one.
 */

const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const REPOSITORY = process.env.ASK_DEV_LIVE_REPOSITORY ?? "full-chaos/dev-health-web";
const SOURCE = "ask_dev_page_context";
/** Outcomes that are not an answer: never an organization-level answer in the subject's place. */
const NOT_ANSWERED = /^(clarification_required|no_match)$/u;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const filterParam = (filter: unknown) => Buffer.from(JSON.stringify(filter)).toString("base64url");
const ONE_REPOSITORY = `/metrics?f=${filterParam({ what: { repos: [REPOSITORY] } })}`;

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

/**
 * A click on the launcher that opens nothing is a state a user sees (lead's ruling on #1740). The
 * open step retries it, so every firing is counted here and the run says how many. One firing is
 * recorded; a second in the same run fails it.
 */
const launcherRetries: string[] = [];
const MAX_LAUNCHER_RETRIES = 1;

test.afterAll(async () => {
    await oracle?.dispose();
    console.log(
        `launcher-retry: ${String(launcherRetries.length)} in this run${
            launcherRetries.length > 0 ? `: ${launcherRetries.join("; ")}` : ""
        }`,
    );
    expect(
        launcherRetries.length,
        `the launcher opened nothing on a first click more than once: ${launcherRetries.join("; ")}`,
    ).toBeLessThanOrEqual(MAX_LAUNCHER_RETRIES);
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

const composer = (surface: Locator) => surface.getByRole("textbox", { name: "Ask a question" });
const chips = (surface: Locator) => surface.getByTestId("ask-dev-context-chip");
const launcher = (page: Page) => page.getByRole("button", { name: "Open Ask Dev" });

/** The panel on a page, authorized. A page that never draws says what it was waiting for. */
async function panelOn(page: Page, path: string): Promise<{ calls: AcrCall[]; surface: Locator }> {
    const calls = watchAcr(page);
    await authorize(page);
    const waitingFor = watchPageLoad(page);
    await page.goto(path, { waitUntil: "commit" });
    await launcher(page)
        .click({ timeout: 30_000 })
        .catch(async (error: unknown) => {
            throw new Error(`the page did not draw: ${await waitingFor()}`, { cause: error });
        });
    const surface = page.getByTestId("ask-dev-panel");
    // On a busy stack a first click once opened nothing (CHAOS-3598 run p4a). It is clicked again
    // only while the launcher says it is closed, and every retry is recorded: a retry is a finding.
    let clicks = 1;
    await expect(async () => {
        if ((await launcher(page).getAttribute("aria-expanded")) !== "true") {
            clicks += 1;
            await launcher(page).click({ timeout: 10_000 });
        }
        await expect(composer(surface)).toBeEnabled({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    if (clicks > 1) {
        const firing = `${new Date().toISOString()} ${path}: the panel opened on click ${String(clicks)}`;
        launcherRetries.push(firing);
        test.info().annotations.push({ type: "launcher-retry", description: firing });
    }
    return { calls, surface };
}

async function ask(surface: Locator, question: string): Promise<void> {
    await composer(surface).fill(question);
    await composer(surface).press("Enter");
}

// Every assertion here is on a count or on a parsed body field, never on a recorded call: a failed
// assertion prints what it was given, and a call holds its query (codex r1 P2 on #1739).
const scopeOf = (call: AcrCall): unknown =>
    (JSON.parse(secretsOf(call).body ?? "{}") as { requested_scope?: unknown }).requested_scope;

async function axeViolations(page: Page, selector: string): Promise<string[]> {
    await page.evaluate(readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
    return page.evaluate(
        async ([target, tags]) => {
            const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
            const node = document.querySelector(target as string);
            if (!node) return ["target not found"];
            const result = await axe.run(node, {
                runOnly: { type: "tag", values: tags as string[] },
            });
            return result.violations.map((v) => `${v.id}: ${v.nodes.length}`);
        },
        [selector, AXE_TAGS] as const,
    );
}

test("P2-1: Expand mid-stream and after the answer, and back: one run, one POST", async ({
    page,
}) => {
    const results = await watchResults(page);
    const { calls, surface } = await panelOn(page, "/dashboard");
    await ask(surface, questionFor("expand", NONCE));
    await expect(surface.locator('li.chat__stage[data-state="active"]')).toBeVisible({
        timeout: 10_000,
    });

    await page.getByRole("button", { name: "Open full page" }).click();
    await expect(page).toHaveURL(/\/dev\?thread=/u);
    const thread = new URL(page.url()).searchParams.get("thread");
    const full = page.getByTestId("ask-dev-page");
    await expect(full.getByRole("article", { name: "Answer" })).toHaveCount(1, {
        timeout: 90_000,
    });

    await page.getByTestId("ask-dev-minimize").click();
    await expect(surface.getByRole("article", { name: "Answer" })).toHaveCount(1);
    await page.getByRole("button", { name: "Open full page" }).click();
    await expect(page).toHaveURL(/\/dev\?thread=/u);
    expect(new URL(page.url()).searchParams.get("thread"), "the thread changed").toBe(thread);
    await expect(full.getByRole("article", { name: "Answer" })).toHaveCount(1);
    expect(investigations(calls).length, "a move sent the question again").toBe(1);
    await expectAnswersSynthesized(results, "P2-1");
});

test("P2-2: a page's chip goes as a hint, and navigation changes only the proposal", async ({
    page,
}) => {
    const results = await watchResults(page);
    const { calls, surface } = await panelOn(page, ONE_REPOSITORY);
    await expect(chips(surface)).toHaveText([`Repository:${REPOSITORY}`]);
    expect(investigations(calls).length, "opening the panel sent a question").toBe(0);

    await ask(surface, pageQuestionFor("pageHint", NONCE));
    const answer = surface.getByRole("article", { name: "Answer" });
    await expect(answer).toHaveCount(1, { timeout: 90_000 });
    await expect(answer).toHaveAttribute("data-state", "partial");
    const sent = investigations(calls);
    expect(sent.length).toBe(1);
    expect(scopeOf(sent[0]!)).toEqual({
        subject_hints: [
            {
                kind: "repository",
                id: expect.stringMatching(/^repository:[0-9a-f-]{36}$/u) as string,
                label: REPOSITORY,
                source: SOURCE,
            },
        ],
    });

    await page.getByRole("link", { name: "Home" }).first().click();
    await expect(page).toHaveURL(/\/dashboard/u);
    await expect(chips(surface)).toHaveCount(0);
    await expect(answer).toHaveCount(1);
    expect(investigations(calls).length, "navigating sent a question").toBe(1);
    await expectAnswersSynthesized(results, "P2-2 hint");
});

test("P2-2: removing the chip changes the request", async ({ page }) => {
    const results = await watchResults(page);
    const { calls, surface } = await panelOn(page, ONE_REPOSITORY);
    await surface.getByRole("button", { name: `Remove Repository ${REPOSITORY}` }).click();
    await expect(chips(surface)).toHaveCount(0);

    await ask(surface, pageQuestionFor("chipRemoved", NONCE));
    const answer = surface.getByRole("article", { name: "Answer" });
    await expect(answer).toHaveCount(1, { timeout: 90_000 });
    await expect(answer).toHaveAttribute("data-state", NOT_ANSWERED);
    expect(investigations(calls).length).toBe(1);
    expect(scopeOf(investigations(calls)[0]!)).toBeUndefined();
    await expectAnswersSynthesized(results, "P2-2 chip removed");
});

test("P2-3: a tampered id gives a clarification or not-found, never the organization", async ({
    page,
}) => {
    const results = await watchResults(page);
    const { calls, surface } = await panelOn(page, ONE_REPOSITORY);
    await expect(chips(surface)).toHaveText([`Repository:${REPOSITORY}`]);
    // Another organization's id, with a name this one does not hold. With the page's own name left
    // on it, ACR's label match finds the page's repository: that is the same subject, not a widening.
    const forged = { id: "repository:00000000-0000-4000-8000-000000000000", label: "other/secret" };
    await page.route(`${ACR}${INVESTIGATIONS_PATH}`, async (route) => {
        const request = route.request();
        if (request.method() !== "POST") return route.continue();
        const body = request.postDataJSON() as {
            requested_scope: { subject_hints: object[] };
        };
        body.requested_scope.subject_hints = body.requested_scope.subject_hints.map((hint) => ({
            ...hint,
            ...forged,
        }));
        await route.continue({ postData: JSON.stringify(body) });
    });

    await ask(surface, pageQuestionFor("forgedId", NONCE));
    const answer = surface.getByRole("article", { name: "Answer" });
    await expect(answer).toHaveCount(1, { timeout: 90_000 });
    await expect(answer).toHaveAttribute("data-state", NOT_ANSWERED);
    expect(investigations(calls).length).toBe(1);
    await expectAnswersSynthesized(results, "P2-3");
});

// CHAOS-3598: the question chris saw answered as a readiness check at organization scope.
for (const [name, surface, replicate] of [
    ["latencyPage1", "page", 1],
    ["latencyPage2", "page", 2],
    ["latencyDev1", "dev", 1],
    ["latencyDev2", "dev", 2],
] as const satisfies readonly (readonly [LatencyCase, "page" | "dev", number])[]) {
    const where = surface === "page" ? "a repository page" : "/dev, with no hint";
    test(`P2-4: review latency from ${where}, replicate ${String(replicate)}`, async ({ page }) => {
        // CHAOS-12637: what the answer is about is read from the result it drew.
        const results = await watchResults(page);
        const { calls, surface: panel } =
            surface === "page"
                ? await panelOn(page, ONE_REPOSITORY)
                : await panelOn(page, "/dashboard");
        if (surface === "page") {
            await expect(chips(panel)).toHaveText([`Repository:${REPOSITORY}`]);
        } else {
            await page.getByRole("button", { name: "Open full page" }).click();
            await expect(page).toHaveURL(/\/dev/u);
        }
        const asking = surface === "page" ? panel : page.getByTestId("ask-dev-page");
        await expect(chips(asking)).toHaveCount(surface === "page" ? 1 : 0);
        await ask(asking, latencyQuestionFor(name, NONCE));
        const answer = asking.getByRole("article", { name: "Answer" });
        await expect(answer).toHaveCount(1, { timeout: 90_000 });
        expect(investigations(calls).length).toBe(1);
        if (surface === "page") {
            // (a) An investigation of the repository's own delivery facts, not the readiness
            // check chris saw ("Not ready: required work is still open"). Every answer draws the
            // "Readiness gaps" panel, so only the answer's own lead text is read for that.
            await expect(answer).not.toHaveAttribute("data-state", NOT_ANSWERED);
            await expect(answer).toContainText(REPOSITORY);
            await expect(answer).toContainText(/metrics ·/iu);
            await expect(answer.getByTestId("answer-panel")).not.toContainText(
                /not ready|required work/iu,
            );
            // (b) About the repository: the answer committed it, a claim is about it, and no claim
            // is about the organization. The text above can name the repository in an answer about
            // the whole organization (CHAOS-12637).
            await expect.poll(() => results.length, { timeout: 30_000 }).toBe(1);
            // The page's repository by id, from the chip's own hint in the request it sent: a
            // label alone does not name one repository (two can share a handle).
            const sentBody = JSON.parse(secretsOf(investigations(calls)[0]!).body ?? "{}") as {
                requested_scope?: { subject_hints?: { id?: string; label?: string }[] };
            };
            const hint = sentBody.requested_scope?.subject_hints?.find(
                (candidate) => candidate.label === REPOSITORY,
            );
            expect(hint?.id).toMatch(/^repository:/u);
            expect(
                repositoryScopeFailures(results[0], { label: REPOSITORY, canonicalId: hint!.id! }),
            ).toEqual([]);
        } else {
            // (c) A clarification or not-found, never an answer at organization scope.
            await expect(answer).toHaveAttribute("data-state", NOT_ANSWERED);
        }
        await expectAnswersSynthesized(results, `P2-4 ${where} ${String(replicate)}`);
    });
}

test.describe("P2-5: accessibility", () => {
    test("keyboard path: Control+J opens the panel, Escape closes it, focus returns", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        const { surface } = await panelOn(page, "/dashboard");
        await page.keyboard.press("Escape");
        await expect(surface).toHaveCount(0);
        await page
            .locator("main")
            .first()
            .click({ position: { x: 4, y: 4 } });
        await page.keyboard.press("Control+J");
        await expect(surface).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(surface).toHaveCount(0);
    });

    for (const width of [1280, 390]) {
        test(`one launcher at ${String(width)} wide`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 });
            await page.goto("/dashboard", { waitUntil: "commit" });
            await expect(launcher(page).first()).toBeVisible({ timeout: 30_000 });
            await expect(launcher(page)).toHaveCount(1);
        });
    }

    test("focus return across breakpoints", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 844 });
        const { surface } = await panelOn(page, "/dashboard");
        await expect(surface).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 });
        const sheet = page.getByTestId("ask-dev-sheet");
        await expect(sheet).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
        await expect(launcher(page)).toBeFocused();
    });

    test("the sheet contains focus, and axe finds nothing at WCAG 2.2 AA", async ({ page }) => {
        // `authorize` opens History in the desktop panel, so it runs before the phone width.
        await page.setViewportSize({ width: 1280, height: 900 });
        await authorize(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await launcher(page).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        await expect(composer(sheet)).toBeEnabled();
        for (let press = 0; press < 12; press += 1) await page.keyboard.press("Tab");
        expect(
            await sheet.evaluate((node) => node.contains(document.activeElement)),
            "Tab left the sheet",
        ).toBe(true);
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
    });

    test("the soft keyboard leaves the composer in view", async ({ page }) => {
        // `authorize` opens History in the desktop panel, so it runs before the phone width.
        await page.setViewportSize({ width: 1280, height: 900 });
        await authorize(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await launcher(page).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        await composer(sheet).focus();
        // A soft keyboard takes the lower half of the visual viewport.
        await page.setViewportSize({ width: 390, height: 420 });
        await expect(composer(sheet)).toBeInViewport();
    });

    test("an announcement region is there, and reduced motion stops the panel moving", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        const { surface } = await panelOn(page, "/dashboard");
        await expect(surface.locator("[aria-live]").first()).toBeAttached();
        const moves = await surface.evaluate((node) => {
            const { animationDuration, transitionDuration } = getComputedStyle(node);
            return [animationDuration, transitionDuration].some(
                (duration) => Number.parseFloat(duration) > 0.01,
            );
        });
        expect(moves, "the panel still moves").toBe(false);
    });

    test("axe finds nothing at WCAG 2.2 AA on the panel and on /dev", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await panelOn(page, ONE_REPOSITORY);
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        await page.getByRole("button", { name: "Open full page" }).click();
        await expect(composer(page.getByTestId("ask-dev-page"))).toBeEnabled();
        expect(await axeViolations(page, "[data-testid=ask-dev-page]")).toEqual([]);
    });
});
