import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// CHAOS-11934: the Ask Dev full page `/dev`. Expand (panel → page) and Minimize (page → panel) move
// the view, never the run: the panel's test-mode transport (`conversation/testModeTransport.ts`)
// plays a scripted ACR stream from session storage and records every call there, so the suite counts
// the investigation calls. No request leaves the browser for ACR.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const KEYS = {
    stream: "ask-dev:test-mode-stream",
    calls: "ask-dev:test-mode-calls",
} as const;
const QUESTION = "Which projects are at risk?";
const NOT_SAVED = "This conversation was not saved yet.";
/**
 * CHAOS-11956 (E6 design v5 §4.1): bare `/dev` keeps the store's conversation and names it in the
 * URL, so Expand ends on `/dev?thread=<id>`.
 */
const NAMED_FULL_PAGE = /\/dev\?thread=thread_[0-9a-f]{32}$/u;

const PARTIAL = (
    JSON.parse(readFileSync(join(CAPTURES, "kiac_project_status_partial.event.json"), "utf8")) as {
        result: Record<string, unknown>;
    }
).result;

const event = (seq: number, body: Record<string, unknown>) => ({
    schema_version: "context_fabric_investigation_event.v1",
    request_id: "request_e2e",
    seq,
    ...body,
});
const accepted = event(1, {
    type: "accepted",
    reserved_result_id: "result_reserved_e2e_0001",
    started_at: "2026-10-31T12:00:00Z",
    budget_seconds: 110,
});
const stage = (seq: number, name: string, state: "started" | "completed") =>
    event(seq, { type: "stage", stage: name, state, elapsed_ms: seq * 100 });
/** A run long enough to expand in the middle of: one event every `delayMs`. */
const slowRun = (delayMs: number) => ({
    events: [
        accepted,
        stage(2, "interpreting", "started"),
        stage(3, "interpreting", "completed"),
        stage(4, "reading_facts", "started"),
        event(5, { type: "result", result: PARTIAL }),
    ],
    delayMs,
});
const quickRun = { events: [accepted, event(2, { type: "result", result: PARTIAL })] };
/** ACR's rate limit before admission: nothing ran, and no thread exists. */
const rateLimited = {
    schema_version: "error.v1",
    request_id: "request_e2e_refused",
    error: {
        code: "rate_limited",
        message: "Too many requests.",
        http_status: 429,
        retryable: true,
    },
};

type Call = { kind: string; submission_id?: string; thread_id?: string };

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seed(page: Page, stream: unknown[], theme: "dark" | "light" = "dark") {
    await page.addInitScript(
        ([key, value, mode]) => {
            // Once per tab: a reload keeps what the run recorded.
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            window.sessionStorage.setItem(key, value);
            window.localStorage.setItem("theme", mode);
        },
        [KEYS.stream, JSON.stringify(stream), theme] as const,
    );
}

const investigations = async (page: Page) =>
    (
        await page.evaluate(
            (key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as Call[],
            KEYS.calls,
        )
    ).filter((call) => call.kind === "investigate");

async function axeViolations(page: Page, selector: string): Promise<string[]> {
    await page.evaluate(readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
    return page.evaluate(async (target) => {
        const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
        const node = document.querySelector(target);
        if (!node) return ["target not found"];
        const result = await axe.run(node);
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
    }, selector);
}

async function askInPanel(page: Page, path = "/dashboard"): Promise<Locator> {
    await page.goto(path);
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const panel = page.getByRole("complementary", { name: "Ask Dev" });
    const input = panel.getByRole("textbox", { name: "Ask a question" });
    await expect(input).toBeEnabled();
    await input.fill(QUESTION);
    await input.press("Enter");
    return panel;
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("expand mid-stream: the run goes on on /dev and answers there, with no new request", async ({
        page,
    }, testInfo) => {
        await seed(page, [slowRun(1_500)]);
        const panel = await askInPanel(page);
        await expect(panel.getByTestId("ask-dev-stages")).toBeVisible();

        await panel.getByRole("button", { name: "Open full page" }).click();
        await expect(page).toHaveURL(NAMED_FULL_PAGE);
        await expect(panel).toBeHidden();
        const conversation = page.getByTestId("ask-dev-page-conversation");
        await expect(conversation.getByText(QUESTION)).toBeVisible();
        await expect(conversation.getByTestId("ask-dev-stages")).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("full-page-streaming-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-page]")).toEqual([]);

        await expect(conversation.getByTestId("ask-dev-answer")).toBeVisible({ timeout: 15_000 });
        await page.screenshot({ path: testInfo.outputPath("full-page-answer-desktop.png") });
        expect(await investigations(page)).toHaveLength(1);
    });

    test("expand after the answer, then minimize: the panel reopens on the same thread", async ({
        page,
    }, testInfo) => {
        await seed(page, [quickRun, quickRun], "light");
        const panel = await askInPanel(page, "/metrics?tab=flow");
        await expect(panel.getByTestId("ask-dev-answer")).toBeVisible();

        await panel.getByRole("button", { name: "Open full page" }).click();
        await expect(page).toHaveURL(NAMED_FULL_PAGE);
        await expect(
            page.getByTestId("ask-dev-page-conversation").getByTestId("ask-dev-answer"),
        ).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("full-page-light-desktop.png") });

        await page.getByRole("button", { name: "Minimize to panel" }).click();
        // The flow page keeps its own filter param (`f`) in the URL: Minimize returns to that URL.
        await expect(page).toHaveURL(/\/metrics\?tab=flow(?:&|$)/u);
        await expect(panel).toBeVisible();
        await expect(panel.getByTestId("ask-dev-answer")).toBeVisible();
        await panel.screenshot({ path: testInfo.outputPath("minimized-panel-desktop.png") });
        expect(await investigations(page)).toHaveLength(1);

        const input = panel.getByRole("textbox", { name: "Ask a question" });
        await input.fill("Why is it behind?");
        await input.press("Enter");
        await expect(panel.getByTestId("ask-dev-answer")).toHaveCount(2);
        const [first, second] = await investigations(page);
        expect(second!.thread_id).toBe(first!.thread_id);
        expect(second!.submission_id).not.toBe(first!.submission_id);
    });

    // CHAOS-11956: a reload now restores a conversation ACR admitted (tests/ask-dev-history.spec.ts).
    // The notice stays for a first question ACR refused before admission: there is no thread to
    // restore, so the reload started a new conversation.
    test("a reload after a question ACR never admitted says it was not saved, and sends nothing", async ({
        page,
    }, testInfo) => {
        await seed(page, [{ refuse: { status: 429, error: rateLimited } }]);
        const panel = await askInPanel(page);
        await expect(panel.getByTestId("ask-dev-turn")).toHaveAttribute("data-status", "not_run");
        await panel.getByRole("button", { name: "Open full page" }).click();
        await expect(page).toHaveURL(/\/dev$/u);

        await page.reload();
        const notice = page
            .getByTestId("ask-dev-page-conversation")
            .getByTestId("ask-dev-not-saved");
        await expect(notice).toContainText(NOT_SAVED);
        await expect(page.getByTestId("ask-dev-answer")).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath("full-page-not-saved-desktop.png") });
        expect(await investigations(page)).toHaveLength(1);
        expect(await axeViolations(page, "[data-testid=ask-dev-page]")).toEqual([]);
    });

    test("/dev has no panel launcher: the page is the surface", async ({ page }) => {
        await seed(page, [quickRun]);
        await page.goto("/dev");
        await expect(page.getByTestId("ask-dev-page")).toBeVisible();
        await expect(page.getByRole("button", { name: "Open Ask Dev" })).toHaveCount(0);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the sheet opens the full page, and Minimize brings the sheet back", async ({
        page,
    }, testInfo) => {
        await seed(page, [quickRun]);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        const input = sheet.getByRole("textbox", { name: "Ask a question" });
        await expect(input).toBeEnabled();
        await input.fill(QUESTION);
        await input.press("Enter");
        await expect(sheet.getByTestId("ask-dev-answer")).toBeVisible();

        await sheet.getByRole("button", { name: "Open full page" }).click();
        await expect(page).toHaveURL(NAMED_FULL_PAGE);
        const conversation = page.getByTestId("ask-dev-page-conversation");
        await expect(conversation.getByTestId("ask-dev-answer")).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("full-page-mobile.png") });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            ),
        ).toBe(true);
        expect(await axeViolations(page, "[data-testid=ask-dev-page]")).toEqual([]);

        await page.getByRole("button", { name: "Minimize to panel" }).click();
        // The dashboard keeps its own filter param (`f`) in the URL: Minimize returns to that URL.
        await expect(page).toHaveURL(/\/dashboard(?:\?|$)/u);
        await expect(sheet.getByTestId("ask-dev-answer")).toBeVisible();
        expect(await investigations(page)).toHaveLength(1);
    });
});
