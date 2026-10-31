import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11928: the conversation store and the composer in the real Ask Dev panel. The panel's
// test-mode transport (`conversation/testModeTransport.ts`) plays a scripted ACR stream from session
// storage and records every call there; no request leaves the browser for ACR.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
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
        await expect(panel.getByTestId("ask-dev-turn-status")).toHaveText("Investigating…");
        await expect(panel.getByRole("button", { name: "Send" })).toBeDisabled();
        await panel.screenshot({ path: testInfo.outputPath("composer-running-desktop.png") });
        await expect(panel.getByTestId("ask-dev-answer")).toBeVisible();

        await input.fill("Why is it behind?");
        await input.press("Enter");
        await expect(panel.getByTestId("ask-dev-answer")).toHaveCount(2);
        await page.screenshot({ path: testInfo.outputPath("conversation-desktop.png") });
        await panel.screenshot({ path: testInfo.outputPath("conversation-desktop-panel.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);

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
        await expect(panel.getByTestId("ask-dev-turn-status")).toHaveText(
            "The connection dropped. Checking whether the answer finished…",
        );
        await panel.screenshot({ path: testInfo.outputPath("recovering-desktop.png") });
        await expect(panel.getByTestId("ask-dev-answer")).toBeVisible({ timeout: 15_000 });

        const recorded = await calls(page);
        expect(recorded.filter((call) => call.kind === "investigate")).toHaveLength(1);
        const submission = recorded[0]!.submission_id;
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
        await expect(panel.getByTestId("ask-dev-turn-status")).toHaveText(
            "Canceled. If the answer had already finished, it is kept.",
        );
        await panel.screenshot({ path: testInfo.outputPath("canceled-desktop.png") });

        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        await expect(panel.getByTestId("ask-dev-turn-status")).toHaveText(
            "Canceled. If the answer had already finished, it is kept.",
        );
        expect((await calls(page)).filter((call) => call.kind === "investigate")).toHaveLength(1);
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
        await expect(sheet.getByTestId("ask-dev-answer")).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("conversation-mobile.png") });
        expect(await pageOverflow()).toBeLessThanOrEqual(Math.max(before, 0));
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        const composer = sheet.getByTestId("ask-dev-composer");
        expect(await composer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
    });
});
