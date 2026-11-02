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

import { pageQuestionFor, questionFor } from "./questions";
import {
    ACR,
    INVESTIGATIONS_PATH,
    ORACLE,
    authorize,
    investigations,
    secretsOf,
    signIn,
    watchAcr,
    watchPageLoad,
    type AcrCall,
} from "./stack";

/**
 * CHAOS-11940: the Phase 2 exits on a deployed stack (plan §4). The questions go to acr's
 * `modeloracle`, never to a real model. Exit P2-4 is CHAOS-3598's, and P2-6 is CHAOS-11939's.
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
    await expect(composer(surface)).toBeEnabled();
    return { calls, surface };
}

async function ask(surface: Locator, question: string): Promise<void> {
    await composer(surface).fill(question);
    await composer(surface).press("Enter");
}

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
    expect(investigations(calls), "a move sent the question again").toHaveLength(1);
});

test("P2-2: a page's chip goes as a hint, and navigation changes only the proposal", async ({
    page,
}) => {
    const { calls, surface } = await panelOn(page, ONE_REPOSITORY);
    await expect(chips(surface)).toHaveText([`Repository:${REPOSITORY}`]);
    expect(investigations(calls), "opening the panel sent a question").toHaveLength(0);

    await ask(surface, pageQuestionFor("pageHint", NONCE));
    const answer = surface.getByRole("article", { name: "Answer" });
    await expect(answer).toHaveCount(1, { timeout: 90_000 });
    await expect(answer).toHaveAttribute("data-state", "partial");
    const sent = investigations(calls);
    expect(sent).toHaveLength(1);
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
    expect(investigations(calls), "navigating sent a question").toHaveLength(1);
});

test("P2-2: removing the chip changes the request", async ({ page }) => {
    const { calls, surface } = await panelOn(page, ONE_REPOSITORY);
    await surface.getByRole("button", { name: `Remove Repository ${REPOSITORY}` }).click();
    await expect(chips(surface)).toHaveCount(0);

    await ask(surface, pageQuestionFor("chipRemoved", NONCE));
    const answer = surface.getByRole("article", { name: "Answer" });
    await expect(answer).toHaveCount(1, { timeout: 90_000 });
    await expect(answer).toHaveAttribute("data-state", NOT_ANSWERED);
    expect(investigations(calls)).toHaveLength(1);
    expect(scopeOf(investigations(calls)[0]!)).toBeUndefined();
});

test("P2-3: a tampered id gives a clarification or not-found, never the organization", async ({
    page,
}) => {
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
    expect(investigations(calls)).toHaveLength(1);
});

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
