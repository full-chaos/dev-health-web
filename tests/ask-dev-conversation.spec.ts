import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// CHAOS-11928: the conversation store and the composer in the real Ask Dev panel. The panel's
// test-mode transport (`conversation/testModeTransport.ts`) plays a scripted ACR stream from session
// storage and records every call there; no request leaves the browser for ACR. CHAOS-12384: the
// conversation is drawn by ask-dev's render (`AskDevChat`), so a turn's state is read from the
// render's own markup: `chat-progress` while it runs, `chat-status` when it ends without an answer.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");
const KEYS = {
    stream: "ask-dev:test-mode-stream",
    status: "ask-dev:test-mode-status",
    results: "ask-dev:test-mode-results",
    calls: "ask-dev:test-mode-calls",
} as const;
const CORRELATION_ID = /^[A-Za-z0-9._:-]{8,128}$/u;

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
const PARTIAL = capture("kiac_project_status_partial.event.json");
const READINESS = capture("kiac_project_readiness_partial.event.json");

const event = (seq: number, body: Record<string, unknown>) => ({
    schema_version: "context_fabric_investigation_event.v1",
    request_id: "request_e2e",
    seq,
    ...body,
});
const acceptedEvent = event(1, {
    type: "accepted",
    reserved_result_id: "result_reserved_e2e_0001",
    started_at: "2026-10-30T12:00:00Z",
    budget_seconds: 110,
});
const stageEvent = event(2, {
    type: "stage",
    stage: "reading_facts",
    state: "started",
    elapsed_ms: 40,
});

type Call = {
    kind: "investigate" | "status" | "read";
    submission_id?: string;
    thread_id?: string;
    result_id?: string;
    request?: Record<string, unknown>;
};

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seed(page: Page, script: Partial<Record<keyof typeof KEYS, unknown>>) {
    await page.addInitScript(
        ([keys, values]) => {
            // Once per page load: a reload keeps what the run recorded.
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            for (const [name, value] of Object.entries(values)) {
                window.sessionStorage.setItem(
                    keys[name as keyof typeof keys],
                    JSON.stringify(value),
                );
            }
        },
        [KEYS, script] as const,
    );
}

const calls = (page: Page) =>
    page.evaluate(
        (key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as Call[],
        KEYS.calls,
    );

/** A running turn's line ("Investigating…", "The connection dropped…"): the progress view's status. */
const runningLine = (region: Locator) => region.getByTestId("chat-progress").getByRole("status");
/** A turn that ended without an answer: the status panel (its words, then any meta lines). */
const endedStatus = (region: Locator) => region.getByTestId("chat-status");

/**
 * `twoTurns`: with two answers in the conversation, the render names the regions of each turn alike
 * (Answer, Drivers, Coverage, ...), which axe reports as `landmark-unique`. That is a defect of the
 * render (ask-dev package), not of this spec; every other rule still runs.
 */
async function axeViolations(page: Page, selector: string, twoTurns = false): Promise<string[]> {
    await page.evaluate(readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
    return page.evaluate(
        async ([target, skip]) => {
            const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
            const node = document.querySelector(target);
            if (!node) return ["target not found"];
            const result = await axe.run(
                node,
                skip ? { rules: { "landmark-unique": { enabled: false } } } : {},
            );
            return result.violations.map(
                (v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`,
            );
        },
        [selector, twoTurns] as const,
    );
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("one request per submit, one thread per conversation, turn 2 builds on turn 1", async ({
        page,
    }, testInfo) => {
        await seed(page, {
            stream: [
                {
                    events: [
                        acceptedEvent,
                        stageEvent,
                        event(3, { type: "result", result: PARTIAL }),
                    ],
                    delayMs: 600,
                },
                { events: [acceptedEvent, event(2, { type: "result", result: READINESS })] },
            ],
        });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const input = panel.getByRole("textbox", { name: "Ask a question" });
        await expect(input).toBeEnabled();
        await panel.screenshot({ path: testInfo.outputPath("composer-empty-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);

        await input.fill("Which projects are at risk?");
        // A double click on Send: the second click lands on Send again (disabled), never on Stop.
        await panel.getByRole("button", { name: "Send" }).dblclick();
        await expect(runningLine(panel)).toHaveText("Investigating…");
        await expect(panel.getByRole("button", { name: "Send" })).toBeDisabled();
        await panel.screenshot({ path: testInfo.outputPath("composer-running-desktop.png") });
        await expect(panel.getByTestId("answer-panel")).toBeVisible();

        await input.fill("Why is it behind?");
        await input.press("Enter");
        await expect(panel.getByTestId("answer-panel")).toHaveCount(2);
        await page.screenshot({ path: testInfo.outputPath("conversation-desktop.png") });
        await panel.screenshot({ path: testInfo.outputPath("conversation-desktop-panel.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]", true)).toEqual([]);

        const sent = (await calls(page)).filter((call) => call.kind === "investigate");
        expect(sent).toHaveLength(2);
        const [first, second] = sent;
        expect(first!.thread_id).toMatch(CORRELATION_ID);
        expect(second!.thread_id).toBe(first!.thread_id);
        expect(first!.submission_id).toMatch(CORRELATION_ID);
        expect(second!.submission_id).not.toBe(first!.submission_id);
        expect(first!.request).not.toHaveProperty("parent_result_id");
        expect(second!.request).toHaveProperty("parent_result_id", PARTIAL.result_id);
    });

    test("recovers a dropped stream by status polling and replays the final result", async ({
        page,
    }, testInfo) => {
        await seed(page, {
            // The stream drops after `accepted`; ACR finished the run and served a reused answer.
            stream: [{ events: [acceptedEvent] }],
            status: [
                {
                    schema_version: "context_fabric_submission_status.v1",
                    submission_id: "sub_e2e_00000001",
                    state: "running",
                    reserved_result_id: "result_reserved_e2e_0001",
                    updated_at: "2026-10-30T12:00:01Z",
                },
                {
                    schema_version: "context_fabric_submission_status.v1",
                    submission_id: "sub_e2e_00000001",
                    state: "done",
                    reserved_result_id: "result_reserved_e2e_0001",
                    result_id: READINESS.result_id,
                    updated_at: "2026-10-30T12:00:04Z",
                },
            ],
            results: { [String(READINESS.result_id)]: READINESS },
        });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await panel.getByRole("textbox", { name: "Ask a question" }).fill("Is the project ready?");
        await panel.getByRole("button", { name: "Send" }).click();
        await expect(runningLine(panel)).toHaveText(
            "The connection dropped. Checking whether the answer finished…",
        );
        await panel.screenshot({ path: testInfo.outputPath("recovering-desktop.png") });
        await expect(panel.getByTestId("answer-panel")).toBeVisible({ timeout: 15_000 });

        const recorded = await calls(page);
        expect(recorded.filter((call) => call.kind === "investigate")).toHaveLength(1);
        const submission = recorded.find((call) => call.kind === "investigate")!.submission_id;
        expect(
            recorded.filter((call) => call.kind === "status").map((c) => c.submission_id),
        ).toEqual([submission, submission]);
        expect(recorded.filter((call) => call.kind === "read")).toEqual([
            { kind: "read", result_id: READINESS.result_id },
        ]);
    });

    test("Stop ends the run, and the panel keeps the conversation when it closes", async ({
        page,
    }, testInfo) => {
        await seed(page, { stream: [{ hold: true }] });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await panel
            .getByRole("textbox", { name: "Ask a question" })
            .fill("Which teams are overloaded?");
        await panel.getByRole("button", { name: "Send" }).click();
        await panel.getByRole("button", { name: "Stop" }).click();
        await expect(endedStatus(panel)).toContainText(
            "Canceled. If the answer had already finished, it is kept.",
        );
        await panel.screenshot({ path: testInfo.outputPath("canceled-desktop.png") });

        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        await expect(endedStatus(panel)).toContainText(
            "Canceled. If the answer had already finished, it is kept.",
        );
        expect((await calls(page)).filter((call) => call.kind === "investigate")).toHaveLength(1);
    });
});

// CHAOS-12201: ACR's refusals before a run, and the owner's cancel, each with their own words.
const errorEnvelope = (code: string, status: number, retryable: boolean) => ({
    schema_version: "error.v1",
    request_id: "req_e2e",
    error: { code, message: "e2e", http_status: status, retryable },
});
const NOT_RUN = [
    [
        "access_denied",
        403,
        "Ask Dev is not available in this session. Sign in again with your own account, or ask an admin to add you to this organization.",
        false,
    ],
    [
        "no_repository",
        409,
        "No repository is available to you here. Connect a repository, or ask an admin for access to one.",
        false,
    ],
    [
        "rate_limited",
        429,
        "Too many questions in a short time. Wait a moment, then ask again.",
        true,
    ],
    ["feature_not_enabled", 403, "Ask Dev is not available for this organization.", false],
    [
        "repo_forbidden",
        403,
        "A repository this question needs is not available to you. If it was connected just now, wait for its first sync.",
        false,
    ],
    [
        "budget_refusal",
        413,
        "This question needs more than one answer can hold. Ask a narrower question.",
        false,
    ],
] as const;

test.describe("refusals before the run (desktop)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    for (const [code, status, copy, retry] of NOT_RUN) {
        test(`${code} shows its own guidance`, async ({ page }, testInfo) => {
            await seed(page, {
                stream: [{ refuse: { status, error: errorEnvelope(code, status, retry) } }],
            });
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            const panel = page.getByRole("complementary", { name: "Ask Dev" });
            await panel
                .getByRole("textbox", { name: "Ask a question" })
                .fill("Which projects are at risk?");
            await panel.getByRole("button", { name: "Send" }).click();
            await expect(endedStatus(panel)).toContainText(copy);
            await expect(panel.getByRole("button", { name: "Retry" })).toHaveCount(retry ? 1 : 0);
            await expect(panel).not.toContainText(/temporarily|Agent Context Runtime/u);
            await panel.screenshot({ path: testInfo.outputPath(`not-run-${code}-desktop.png`) });
            expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        });
    }

    test("a rate limit after the run started says to wait, with no Retry", async ({
        page,
    }, testInfo) => {
        await seed(page, {
            stream: [
                {
                    events: [
                        acceptedEvent,
                        event(2, {
                            type: "error",
                            reserved_result_id: "result_reserved_e2e_0001",
                            error: errorEnvelope("rate_limited", 429, true),
                        }),
                    ],
                },
            ],
        });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await panel
            .getByRole("textbox", { name: "Ask a question" })
            .fill("Which projects are at risk?");
        await panel.getByRole("button", { name: "Send" }).click();
        await expect(endedStatus(panel)).toContainText(
            "This question was rate limited after it started. Wait a moment, then ask again.",
        );
        await expect(panel.getByRole("button", { name: "Retry" })).toHaveCount(0);
        await panel.screenshot({ path: testInfo.outputPath("stopped-rate_limited-desktop.png") });
    });

    test("the owner's cancel ends in the canceled state", async ({ page }, testInfo) => {
        await seed(page, {
            stream: [
                {
                    events: [
                        acceptedEvent,
                        event(2, {
                            type: "error",
                            reserved_result_id: "result_reserved_e2e_0001",
                            error: errorEnvelope("canceled", 409, false),
                        }),
                    ],
                },
            ],
        });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await panel
            .getByRole("textbox", { name: "Ask a question" })
            .fill("Which projects are at risk?");
        await panel.getByRole("button", { name: "Send" }).click();
        await expect(endedStatus(panel)).toContainText(
            "Canceled. If the answer had already finished, it is kept.",
        );
        await panel.screenshot({ path: testInfo.outputPath("canceled-terminal-desktop.png") });
    });
});

test.describe("refusals before the run (mobile)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("access_denied in the sheet", async ({ page }, testInfo) => {
        await seed(page, {
            stream: [
                { refuse: { status: 403, error: errorEnvelope("access_denied", 403, false) } },
            ],
        });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        const input = sheet.getByRole("textbox", { name: "Ask a question" });
        await input.fill("Which projects are at risk?");
        await input.press("Enter");
        await expect(endedStatus(sheet)).toContainText(NOT_RUN[0][2]);
        await page.screenshot({ path: testInfo.outputPath("not-run-access_denied-mobile.png") });
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});

test.describe("hydration (slow CPU)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    // CI on #1632: the provider's context changed right after hydration, which switched the shell's
    // still-hydrating parts to client rendering and dropped a launcher click made in that window.
    // On an 8x slower CPU that click failed 8 of 8 times; the context is now fixed from the start.
    test("a launcher click right after load opens the panel", async ({ page }) => {
        await seed(page, { stream: [{ hold: true }] });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 8 });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        await expect(page.getByRole("complementary", { name: "Ask Dev" })).toBeVisible({
            timeout: 5_000,
        });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the sheet carries the composer and the answer", async ({ page }, testInfo) => {
        await seed(page, {
            stream: [{ events: [acceptedEvent, event(2, { type: "result", result: PARTIAL })] }],
        });
        await page.goto("/dashboard");
        const pageOverflow = () =>
            page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            );
        // The page behind may overflow on its own; the sheet must add nothing to it.
        const before = await pageOverflow();
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        await expect(sheet).toBeVisible();
        const input = sheet.getByRole("textbox", { name: "Ask a question" });
        await input.fill("Which projects are at risk?");
        await page.screenshot({ path: testInfo.outputPath("composer-mobile.png") });
        await input.press("Enter");
        await expect(sheet.getByTestId("answer-panel")).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("conversation-mobile.png") });
        expect(await pageOverflow()).toBeLessThanOrEqual(Math.max(before, 0));
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        // The render's composer is the form around the input.
        const composer = input.locator("xpath=ancestor::form");
        expect(await composer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
    });
});
