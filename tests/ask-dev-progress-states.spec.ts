import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// CHAOS-11929 (I-S07): every panel state of plan §2.7.8 in the real Ask Dev panel, driven through
// the conversation store by the test-mode transport (`conversation/testModeTransport.ts`), which
// plays a scripted ACR stream from session storage. No request leaves the browser for ACR.
// CHAOS-12384: the turn is drawn by ask-dev's render. A running turn is its `chat-progress` view
// (a status line, the "Investigation steps" list, the elapsed time, Stop); a turn that ended
// without an answer is its `chat-status` panel (the words, then the retry-after and reference lines).
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const KEYS = {
    stream: "ask-dev:test-mode-stream",
    status: "ask-dev:test-mode-status",
    calls: "ask-dev:test-mode-calls",
} as const;
const QUESTION = "Which projects are at risk?";

const event = (seq: number, body: Record<string, unknown>) => ({
    schema_version: "context_fabric_investigation_event.v1",
    request_id: "request_e2e",
    seq,
    ...body,
});
const accepted = event(1, {
    type: "accepted",
    reserved_result_id: "result_reserved_e2e_0001",
    started_at: "2026-10-30T12:00:00Z",
    budget_seconds: 110,
});
const stage = (seq: number, name: string, state: "started" | "completed") =>
    event(seq, { type: "stage", stage: name, state, elapsed_ms: seq * 100 });
const acrError = (code: string, status: number, retryable: boolean, details?: object) => ({
    schema_version: "error.v1",
    request_id: "req_e2e_0000000001",
    error: {
        code,
        message: "scripted",
        http_status: status,
        retryable,
        ...(details ? { details } : {}),
    },
});
const errorTerminal = (code: string, details?: object) =>
    event(2, {
        type: "error",
        reserved_result_id: "result_reserved_e2e_0001",
        error: acrError(code, 504, false, details),
        stage: "synthesizing",
    });
const refuse = (
    status: number,
    code: string,
    retryable: boolean,
    { details, retryAfterSeconds }: { details?: object; retryAfterSeconds?: number } = {},
) => ({
    refuse: {
        status,
        error: acrError(code, status, retryable, details),
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
});

/** The answer views' own markers: none may show outside a validated result (checks 11, 12). */
const ANSWER_MARKERS = [
    "answer-panel",
    "coverage-panel",
    "completeness-panel",
    "drivers-panel",
    "fact-tiles",
    "ranking-row",
    "render-shape-legend",
    "ask-dev-refusal",
];

type State = {
    readonly name: string;
    readonly stream: unknown[];
    readonly statuses?: unknown[];
    readonly copy: string;
    /** Extra lines the state shows under its copy. */
    readonly retryAfter?: string;
    readonly reference?: string;
    readonly retry?: boolean;
    /** The run stays open: the test ends it (Stop) or captures it streaming. */
    readonly stop?: boolean;
};

const STATES: readonly State[] = [
    {
        name: "deadline-model",
        stream: [
            { events: [accepted, errorTerminal("upstream_unavailable", { deadline: "model" })] },
        ],
        copy: "A model step ran out of time, so the investigation stopped before an answer. Ask again, or ask a narrower question.",
    },
    {
        name: "deadline-request",
        stream: [
            { events: [accepted, errorTerminal("upstream_unavailable", { deadline: "request" })] },
        ],
        copy: "The investigation ran out of time before an answer. Ask again, or ask a narrower question.",
    },
    {
        name: "deadline-admission",
        stream: [{ events: [], then: "admission_timeout" }],
        copy: "Ask Dev did not start the investigation in time. Ask again.",
    },
    {
        name: "budget-exhausted",
        stream: [{ events: [], then: "budget_exhausted" }],
        copy: "Ask Dev ran out of time before the question could start. Ask again.",
    },
    {
        name: "limit-principal",
        stream: [
            refuse(429, "concurrency_limited", true, {
                details: { limit: "principal" },
                retryAfterSeconds: 30,
            }),
        ],
        copy: "You already have as many questions running as Ask Dev allows. Wait for one to finish, then try again.",
        retryAfter: "Try again in 30 seconds.",
        retry: true,
    },
    {
        name: "limit-org",
        stream: [
            refuse(429, "concurrency_limited", true, {
                details: { limit: "org" },
                retryAfterSeconds: 90,
            }),
        ],
        copy: "Your organization already has as many questions running as Ask Dev allows. Try again shortly.",
        retryAfter: "Try again in about 2 minutes.",
        retry: true,
    },
    {
        name: "allowance-exhausted",
        stream: [refuse(429, "allowance_exhausted", false, { retryAfterSeconds: 9 * 86_400 })],
        copy: "Your organization has used this month's Ask Dev allowance.",
        retryAfter: "Try again in about 9 days.",
    },
    {
        name: "stream-unavailable",
        stream: [refuse(406, "stream_unavailable", false)],
        copy: "Ask Dev cannot stream answers on this deployment right now. Contact your administrator.",
    },
    {
        name: "submission-mismatch",
        stream: [refuse(409, "submission_mismatch", false)],
        copy: "This question could not be sent again as it was first sent. Ask again.",
        reference: "Reference: req_e2e_0000000001",
    },
    {
        name: "submission-unsaved",
        stream: [refuse(409, "submission_unsaved", false)],
        copy: "The answer was shown but not saved — ask again",
    },
    {
        name: "submission-abandoned",
        stream: [refuse(409, "submission_abandoned", false)],
        copy: "An earlier run of this question ended without an answer. Ask again.",
    },
    {
        name: "canceled",
        stream: [{ events: [accepted], then: "hold" }],
        copy: "Canceled. If the answer had already finished, it is kept.",
        stop: true,
    },
    {
        name: "interrupted",
        // The stream ends after `accepted` with no terminal; the status read finds it abandoned.
        stream: [{ events: [accepted] }],
        statuses: [
            {
                schema_version: "context_fabric_submission_status.v1",
                submission_id: "sub_e2e_00000001",
                state: "abandoned",
                reserved_result_id: "result_reserved_e2e_0001",
                updated_at: "2026-10-30T12:00:04Z",
            },
        ],
        copy: "Interrupted — ask again",
    },
    {
        name: "stalled",
        stream: [{ events: [accepted, stage(2, "interpreting", "started")], then: "stalled" }],
        copy: "The answer stopped arriving. Ask again.",
    },
    {
        name: "other-error",
        stream: [{ events: [accepted, errorTerminal("internal_error")] }],
        copy: "The investigation did not finish. Ask again.",
        reference: "Reference: req_e2e_0000000001",
    },
];

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seed(
    page: Page,
    script: { stream: unknown[]; statuses?: unknown[] },
    theme: "dark" | "light" = "dark",
) {
    await page.addInitScript(
        ([keys, stream, statuses, mode]) => {
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            window.sessionStorage.setItem(keys.stream, stream);
            if (statuses !== "") window.sessionStorage.setItem(keys.status, statuses);
            window.localStorage.setItem("theme", mode);
        },
        [
            KEYS,
            JSON.stringify(script.stream),
            script.statuses ? JSON.stringify(script.statuses) : "",
            theme,
        ] as const,
    );
}

async function ask(page: Page, surface: "panel" | "sheet") {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const region =
        surface === "panel"
            ? page.getByRole("complementary", { name: "Ask Dev" })
            : page.getByTestId("ask-dev-sheet");
    const input = region.getByRole("textbox", { name: "Ask a question" });
    await expect(input).toBeEnabled();
    await input.fill(QUESTION);
    await input.press("Enter");
    return region;
}

/** A running turn's line, and the turn that ended without an answer (see the header). */
const runningLine = (region: Locator) => region.getByTestId("chat-progress").getByRole("status");
const endedStatus = (region: Locator) => region.getByTestId("chat-status");

async function expectNoAnswerContent(region: Locator) {
    for (const marker of ANSWER_MARKERS) {
        await expect(region.getByTestId(marker), marker).toHaveCount(0);
    }
    // The answer itself, and the offers popup of a clarification, are answer content too.
    await expect(region.getByRole("article", { name: "Answer" })).toHaveCount(0);
    await expect(region.getByRole("dialog")).toHaveCount(0);
    await expect(region.getByText(/no issues/iu)).toHaveCount(0);
}

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

    for (const theme of ["dark", "light"] as const) {
        test(`streaming: the stage checklist, the elapsed time and Stop, no answer (${theme})`, async ({
            page,
        }, testInfo) => {
            await seed(
                page,
                {
                    stream: [
                        {
                            events: [
                                accepted,
                                stage(2, "interpreting", "started"),
                                stage(3, "interpreting", "completed"),
                                stage(4, "reading_facts", "started"),
                            ],
                            then: "hold",
                        },
                    ],
                },
                theme,
            );
            const panel = await ask(page, "panel");
            const steps = panel.getByRole("list", { name: "Investigation steps" });
            await expect(steps.locator('[data-stage="reading_facts"]')).toHaveAttribute(
                "data-state",
                "active",
            );
            await expect(steps.locator("[data-state]")).toHaveText([
                "Reading the question: done",
                "Finding what the question is about: skipped",
                "Reading stored facts: in progress",
                "Drafting the answer: not started",
                "Checking the answer: not started",
            ]);
            await expect(panel.getByTestId("chat-elapsed-value")).toHaveText(/^0:0[1-9]$/u, {
                timeout: 5_000,
            });
            await expect(panel.getByRole("button", { name: "Stop" })).toBeVisible();
            await expectNoAnswerContent(panel);
            await panel.screenshot({
                path: testInfo.outputPath(`state-streaming-desktop-${theme}.png`),
            });
            expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        });
    }

    for (const state of STATES) {
        test(`${state.name}: its own copy, no answer content`, async ({ page }, testInfo) => {
            await seed(page, { stream: state.stream, statuses: state.statuses });
            const panel = await ask(page, "panel");
            if (state.stop) {
                await expect(runningLine(panel)).toHaveText("Investigating…");
                await panel.getByRole("button", { name: "Stop" }).click();
            }
            await expect(endedStatus(panel)).toContainText(state.copy, {
                timeout: 10_000,
            });
            await expect(panel.getByTestId("chat-progress")).toHaveCount(0);
            await expect(panel.getByRole("button", { name: "Stop" })).toHaveCount(0);
            if (state.retryAfter) {
                await expect(panel.getByTestId("chat-status-retry-after")).toHaveText(
                    state.retryAfter,
                );
            } else {
                await expect(panel.getByTestId("chat-status-retry-after")).toHaveCount(0);
            }
            if (state.reference) {
                await expect(panel.getByTestId("chat-status-reference")).toHaveText(
                    state.reference,
                );
            }
            await expect(panel.getByRole("button", { name: "Retry" })).toHaveCount(
                state.retry ? 1 : 0,
            );
            await expectNoAnswerContent(panel);
            await panel.screenshot({
                path: testInfo.outputPath(`state-${state.name}-desktop.png`),
            });
            const sent = await page.evaluate(
                (key) =>
                    (
                        JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as { kind: string }[]
                    ).filter((call) => call.kind === "investigate").length,
                KEYS.calls,
            );
            expect(sent).toBe(1);
        });
    }

    test("a retryable limit sends the same request again under its key", async ({ page }) => {
        await seed(page, {
            stream: [
                refuse(429, "concurrency_limited", true, {
                    details: { limit: "principal" },
                    retryAfterSeconds: 1,
                }),
                { events: [accepted], then: "hold" },
            ],
        });
        const panel = await ask(page, "panel");
        await panel.getByRole("button", { name: "Retry" }).click();
        await expect(panel.getByRole("list", { name: "Investigation steps" })).toBeVisible();
        const sent = await page.evaluate(
            (key) =>
                (
                    JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as {
                        kind: string;
                        submission_id: string;
                    }[]
                ).filter((call) => call.kind === "investigate"),
            KEYS.calls,
        );
        expect(sent).toHaveLength(2);
        expect(sent[1]!.submission_id).toBe(sent[0]!.submission_id);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const [name, stream, copy] of [
        [
            "streaming",
            [
                {
                    events: [
                        accepted,
                        stage(2, "interpreting", "started"),
                        stage(3, "interpreting", "completed"),
                        stage(4, "resolving_subjects", "started"),
                    ],
                    then: "hold",
                },
            ],
            "Investigating…",
        ],
        [
            "limit-principal",
            [
                refuse(429, "concurrency_limited", true, {
                    details: { limit: "principal" },
                    retryAfterSeconds: 30,
                }),
            ],
            "You already have as many questions running as Ask Dev allows. Wait for one to finish, then try again.",
        ],
        [
            "other-error",
            [{ events: [accepted, errorTerminal("internal_error")] }],
            "The investigation did not finish. Ask again.",
        ],
    ] as const) {
        test(`the sheet shows ${name} without sideways scroll`, async ({ page }, testInfo) => {
            await seed(page, { stream: [...stream] });
            await page.goto("/dashboard");
            const pageOverflow = () =>
                page.evaluate(
                    () =>
                        document.documentElement.scrollWidth - document.documentElement.clientWidth,
                );
            const before = await pageOverflow();
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            const sheet = page.getByTestId("ask-dev-sheet");
            const input = sheet.getByRole("textbox", { name: "Ask a question" });
            await expect(input).toBeEnabled();
            await input.fill(QUESTION);
            await input.press("Enter");
            await expect(
                name === "streaming" ? runningLine(sheet) : endedStatus(sheet),
            ).toContainText(copy);
            await expectNoAnswerContent(sheet);
            await page.screenshot({ path: testInfo.outputPath(`state-${name}-mobile.png`) });
            expect(await pageOverflow()).toBeLessThanOrEqual(Math.max(before, 0));
            expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
            expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        });
    }
});
