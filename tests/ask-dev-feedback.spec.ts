import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// CHAOS-11958: feedback on an Ask Dev answer ("Correct?" and "Useful?"). The test-mode transport
// (`conversation/testModeTransport.ts`) plays ACR's thread, result and feedback calls from session
// storage, stores each set as ACR does, and records every call there; no request leaves the browser
// for ACR. The live proofs are CHAOS-12234.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const KEYS = {
    stream: "ask-dev:test-mode-stream",
    results: "ask-dev:test-mode-results",
    calls: "ask-dev:test-mode-calls",
    threads: "ask-dev:test-mode-threads",
    list: "ask-dev:test-mode-thread-list",
    feedback: "ask-dev:test-mode-feedback",
    feedbackSets: "ask-dev:test-mode-feedback-sets",
} as const;
type Script = Partial<Record<keyof typeof KEYS, unknown>>;

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
const PARTIAL = capture("kiac_project_status_partial.event.json");
const PARTIAL_ID = String(PARTIAL.result_id);

const AT = "2026-10-30T12:00:00Z";
const LATER = "2026-10-30T12:05:00Z";
const THREAD_A = "thread_e2e_feedback_0001";
const thread = {
    schema_version: "context_fabric_thread.v1",
    thread_id: THREAD_A,
    retention_days: 30,
    turn_count: 1,
    created_at: AT,
    last_turn_at: LATER,
    expires_at: "2030-01-01T00:00:00Z",
    turns: [
        {
            submission_id: "sub_e2e_feedback_0001",
            state: "done",
            question: "Which projects are at risk this quarter?",
            result_id: PARTIAL_ID,
            admitted_at: AT,
            updated_at: LATER,
        },
    ],
};
const listPage = {
    schema_version: "context_fabric_thread_list.v1",
    threads: [
        {
            thread_id: THREAD_A,
            retention_days: 30,
            turn_count: 1,
            created_at: AT,
            last_turn_at: LATER,
            expires_at: "2030-01-01T00:00:00Z",
        },
    ],
};
const refusal = (status: number, code: string) => ({
    refuse: {
        status,
        error: {
            schema_version: "error.v1",
            request_id: "req_e2e",
            error: { code, message: "e2e", http_status: status, retryable: true },
        },
    },
});

type Call = { kind: string; result_id?: string; correct?: string; useful?: string };

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seed(page: Page, script: Script) {
    await page.addInitScript(
        ([keys, values]) => {
            // Once per tab: a reload keeps what the run recorded (and what a set stored).
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            window.localStorage.setItem("theme", "light");
            for (const [name, value] of Object.entries(values)) {
                window.sessionStorage.setItem(
                    keys[name as keyof typeof keys],
                    JSON.stringify(value),
                );
            }
        },
        [
            KEYS,
            {
                stream: [],
                threads: { [THREAD_A]: thread },
                results: { [PARTIAL_ID]: PARTIAL },
                list: [listPage],
                ...script,
            },
        ] as const,
    );
}

const feedbackCalls = async (page: Page) =>
    (
        await page.evaluate(
            (key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as Call[],
            KEYS.calls,
        )
    ).filter((call) => call.kind.startsWith("feedback"));

const sets = async (page: Page) =>
    (await feedbackCalls(page))
        .filter((call) => call.kind === "feedback_set")
        .map((call) => `${String(call.correct)}/${String(call.useful)}`);

const choice = (region: Locator, question: "Correct?" | "Useful?", value: "Yes" | "No") =>
    region.getByRole("group", { name: question }).getByRole("button", { name: value });

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

test.describe("answer feedback (CHAOS-11958)", () => {
    test.describe("desktop (1280px)", () => {
        test.use({ viewport: { width: 1280, height: 900 } });

        test("set, read back after a reload, and unset", async ({ page }, testInfo) => {
            await seed(page, {});
            await page.goto(`/dev?thread=${THREAD_A}`);
            const region = page.getByRole("group", { name: "Feedback on this answer" });
            await expect(choice(region, "Correct?", "Yes")).toBeEnabled();
            await expect(choice(region, "Correct?", "Yes")).toHaveAttribute(
                "aria-pressed",
                "false",
            );

            await choice(region, "Correct?", "Yes").click();
            await expect(choice(region, "Correct?", "Yes")).toHaveAttribute("aria-pressed", "true");
            await expect.poll(() => sets(page)).toEqual(["yes/unset"]);
            await choice(region, "Useful?", "No").click();
            await expect.poll(() => sets(page)).toEqual(["yes/unset", "yes/no"]);
            await expect(region).toHaveAttribute("aria-busy", "false");
            await page.screenshot({
                path: testInfo.outputPath("feedback-set-desktop.png"),
                animations: "disabled",
            });
            expect(await axeViolations(page, "[data-testid=ask-dev-feedback]")).toEqual([]);

            // A reload reads ACR's stored feedback back (no write).
            await page.reload();
            await expect(choice(region, "Correct?", "Yes")).toHaveAttribute("aria-pressed", "true");
            await expect(choice(region, "Useful?", "No")).toHaveAttribute("aria-pressed", "true");
            expect(await sets(page)).toEqual(["yes/unset", "yes/no"]);

            // Pressing the chosen value again clears it.
            await choice(region, "Correct?", "Yes").click();
            await expect(choice(region, "Correct?", "Yes")).toHaveAttribute(
                "aria-pressed",
                "false",
            );
            await expect.poll(() => sets(page)).toEqual(["yes/unset", "yes/no", "unset/no"]);
        });

        test("a failed write is rolled back and says it was not saved", async ({
            page,
        }, testInfo) => {
            await seed(page, { feedbackSets: [refusal(503, "unavailable")] });
            await page.goto(`/dev?thread=${THREAD_A}`);
            const region = page.getByRole("group", { name: "Feedback on this answer" });
            await expect(choice(region, "Useful?", "Yes")).toBeEnabled();
            await choice(region, "Useful?", "Yes").click();
            await expect(region.getByText("Feedback was not saved.")).toBeVisible();
            await expect(choice(region, "Useful?", "Yes")).toHaveAttribute("aria-pressed", "false");
            await page.screenshot({
                path: testInfo.outputPath("feedback-not-saved-desktop.png"),
                animations: "disabled",
            });
            expect(await axeViolations(page, "[data-testid=ask-dev-feedback]")).toEqual([]);
        });

        test("ACR's 404 hides the controls", async ({ page }) => {
            await seed(page, { feedback: { [PARTIAL_ID]: null } });
            await page.goto(`/dev?thread=${THREAD_A}`);
            await expect(page.getByTestId("answer-panel")).toBeVisible();
            await expect.poll(async () => (await feedbackCalls(page)).length).toBe(1);
            await expect(page.getByTestId("ask-dev-feedback")).toHaveCount(0);
        });
    });

    test.describe("mobile (390px)", () => {
        test.use({ viewport: { width: 390, height: 844 } });

        test("the sheet shows the controls of a restored answer, with no sideways scroll", async ({
            page,
        }, testInfo) => {
            await seed(page, {
                feedback: {
                    [PARTIAL_ID]: {
                        schema_version: "context_fabric_result_feedback.v1",
                        result_id: PARTIAL_ID,
                        correct: "yes",
                        useful: "unset",
                        updated_at: LATER,
                    },
                },
            });
            await page.goto(`/dev?thread=${THREAD_A}`);
            await expect(page.getByTestId("answer-panel")).toBeVisible();
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            const sheet = page.getByTestId("ask-dev-sheet");
            await expect(sheet.getByTestId("ask-dev-answer")).toBeVisible();
            const region = sheet.getByRole("group", { name: "Feedback on this answer" });
            await expect(choice(region, "Correct?", "Yes")).toHaveAttribute("aria-pressed", "true");
            await choice(region, "Useful?", "Yes").click();
            await expect.poll(() => sets(page)).toEqual(["yes/yes"]);
            await region.scrollIntoViewIfNeeded();
            await page.screenshot({
                path: testInfo.outputPath("feedback-mobile.png"),
                animations: "disabled",
            });
            expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
            expect(await axeViolations(page, "[data-testid=ask-dev-feedback]")).toEqual([]);
        });
    });
});
