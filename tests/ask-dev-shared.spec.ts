import { expect, test } from "@playwright/test";

import {
    ANSWER_STATUS_VALUES,
    DEV_ERROR_CODES,
    forbiddenEnumStrings,
    SCOPE_RESOLUTION_OUTCOME_VALUES,
} from "./fixtures/askDevContracts";
import {
    askDevAnswerArticle,
    askDevComposer,
    askDevFailedAlert,
    askDevLauncher,
    askDevRunningStatus,
    askDevSubmit,
    getAskDevRequestCounts,
    openAskDevWindow,
    resetAskDevMock,
    scenarioQuestion,
    submitAskDevQuestion,
} from "./helpers/askDev";

// CHAOS-3287: deterministic Ask Dev coverage in the DEFAULT required
// Playwright suite (tests/*.spec.ts, not tests/live/**). Every scenario here
// runs against the real dev_answer.v1 contract/components — the mock server
// (tests/mocks/devScenario.ts) builds responses from the checked-in
// schema-validated canonical fixtures, and the browser's own client.ts
// re-validates every response against the pinned JSON Schema + semantic
// invariants, so an invalid mock payload fails the test the same way a bad
// real server response would.
//
// Wave 3.1's dev_answer.v2 public-outcome taxonomy (answered_with_gaps,
// needs_clarification, not_found, temporarily_unavailable, unsupported,
// denied, failed — CHAOS-3294) is NOT yet consumed by this frontend
// (CHAOS-3298 is still Backlog): the components here still render the prior
// dev_answer.v1 status enum (complete/partial/degraded/insufficient_
// evidence/refused/error). This spec exercises every outcome the app can
// actually reach today, plus the shared request-lifecycle/internal-state-
// isolation/evidence-hierarchy invariants that do not depend on v2. It
// intentionally does not fabricate v2-only outcomes against a UI that does
// not render them — see CHAOS-3298 for that follow-up adoption work.

test.beforeEach(async ({ request }) => {
    await resetAskDevMock(request);
});

test.describe("Ask Dev — shared request behavior", () => {
    test("opening the window makes no provider call until a question is submitted", async ({
        page,
        request,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        const counts = await getAskDevRequestCounts(request);
        expect(counts.conversationsCreated).toBe(0);
        expect(counts.messages).toBe(0);
    });

    test("submits the raw question text without inventing a client-side outcome", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        await submitAskDevQuestion(page, scenarioQuestion("complete", "How many items shipped?"));

        await expect(page.getByText("How many items shipped?")).toBeVisible();
        await expect(askDevAnswerArticle(page)).toBeVisible();
    });

    test("a duplicate double-submit under one running request creates exactly one run", async ({
        page,
        request,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        const composer = askDevComposer(page);
        await composer.fill(scenarioQuestion("complete", "How many items shipped this week?"));
        // Two rapid Enter presses mirror a real duplicate-click/duplicate-Enter:
        // the composer's onKeyDown submits on the first, and the button/composer
        // disable on `stream.phase === "running"` should absorb the second.
        await Promise.all([composer.press("Enter"), composer.press("Enter")]);

        await expect(askDevAnswerArticle(page)).toBeVisible();
        const counts = await getAskDevRequestCounts(request);
        expect(counts.messages).toBe(1);
    });

    test("cancelling a running investigation stops it safely without leaking the error code", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        await submitAskDevQuestion(
            page,
            scenarioQuestion("complete", "What changed in the last release?"),
        );
        await expect(askDevRunningStatus(page)).toBeVisible();
        await page.getByRole("button", { name: "Cancel" }).click();

        await expect(askDevFailedAlert(page)).toBeVisible();
        await expect(askDevFailedAlert(page)).toContainText("investigation was cancelled");
        await expect(page.locator("body")).not.toContainText('cancelled"', { useInnerText: false });
    });

    test("retry after a retryable failure sends a real second request and reaches a completed answer", async ({
        page,
        request,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        await submitAskDevQuestion(
            page,
            scenarioQuestion("source_unavailable_error", "Is the deployment pipeline healthy?"),
        );
        await expect(askDevFailedAlert(page)).toBeVisible();
        await expect(askDevFailedAlert(page)).toContainText(
            "A required source is temporarily unavailable.",
        );

        const beforeRetry = await getAskDevRequestCounts(request);

        // The mock (tests/mocks/devScenario.ts's RETRYABLE_ERROR_SCENARIOS
        // handling) resolves a retry of this scenario to a distinct,
        // successful "complete" answer — a real second attempt, not a
        // second delivery of the same canned failure. Retry sends
        // `retry_of_run_id`, which is how the mock tells attempt 2 apart
        // from attempt 1 for the identical question text.
        await page.getByRole("button", { name: "Retry" }).click();

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();
        await expect(answer).toContainText("Twelve work items completed");
        await expect(askDevFailedAlert(page)).not.toBeVisible();

        const afterRetry = await getAskDevRequestCounts(request);
        expect(afterRetry.messages).toBe(beforeRetry.messages + 1);
    });
});

test.describe("Ask Dev — internal-state isolation (denylist)", () => {
    // Every DevError.code from ops' contracts.py — the failed-run alert
    // must show only `safe_message`, never the machine code, for ANY of
    // them, not just the 2 this suite happens to trigger.
    const ALL_ERROR_CODE_STRINGS = forbiddenEnumStrings(DEV_ERROR_CODES);

    for (const [scenario, safeMessageFragment] of [
        ["scope_forbidden_error", "You don't have access to that scope."],
        ["source_unavailable_error", "A required source is temporarily unavailable."],
    ] as const) {
        test(`${scenario}: the failed-run alert shows only the safe message, no raw error code`, async ({
            page,
        }) => {
            await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
            await openAskDevWindow(page);

            await submitAskDevQuestion(page, scenarioQuestion(scenario, "Can I see project Zed?"));
            await expect(askDevFailedAlert(page)).toBeVisible();
            await expect(askDevFailedAlert(page)).toContainText(safeMessageFragment);

            // Scoped to the failed-run alert, not the whole page: the
            // question text typed into the composer literally echoes back
            // into the transcript (and scenario names like
            // "source_unavailable_error" contain banned substrings
            // themselves), which would otherwise self-trigger this
            // assertion regardless of what the app actually rendered.
            const alertText = await askDevFailedAlert(page).innerText();
            for (const forbidden of ALL_ERROR_CODE_STRINGS) {
                expect(alertText).not.toContain(forbidden);
            }
            expect(alertText).not.toContain("forbidden_or_not_found");
            expect(alertText).not.toContain("forbidden/not_found");
        });
    }

    // CHAOS-3291 owns the underlying fix (AskDevAnswer.tsx:311 renders
    // `answer.status.replaceAll("_", " ")` and :333 renders
    // `scopeResolution.outcome.replaceAll("_", " ")` directly). Web PR #832
    // (the sanctioned-copy-map fix) is enqueued in the merge queue —
    // sequencing this branch to land after it, so these are ordinary ACTIVE
    // tests, not `test.fixme`/`test.fail()`: a fixme never self-activates
    // (Playwright skips it unconditionally forever, so #832 merging
    // wouldn't change anything on its own), and with #832 already
    // sequenced ahead of this branch there is no gap period to bridge with
    // `test.fail()` either — by the time this lands, the fix is already
    // there to verify against.
    test("the answer status pill never leaks a raw or space-transformed AnswerStatus value (CHAOS-3291)", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("insufficient_evidence", "How risky is this repository?"),
        );

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();
        for (const forbidden of forbiddenEnumStrings(ANSWER_STATUS_VALUES)) {
            await expect(answer.getByText(forbidden, { exact: true })).not.toBeVisible();
        }
    });

    test("a forbidden-or-not-found scope resolution never renders the raw internal outcome (CHAOS-3291)", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("forbidden_or_not_found_scope", "Show me project Zed."),
        );

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();
        for (const forbidden of forbiddenEnumStrings(SCOPE_RESOLUTION_OUTCOME_VALUES)) {
            await expect(answer.getByText(forbidden, { exact: true })).not.toBeVisible();
        }
    });
});

test.describe("Ask Dev — evidence hierarchy", () => {
    test("the direct answer precedes the evidence section in reading order", async ({ page }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        await submitAskDevQuestion(
            page,
            scenarioQuestion("complete", "What is the current status?"),
        );
        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();

        const order = await answer.evaluate((node) => {
            const direct = node.querySelector("p.text-body");
            const evidenceSection = node.querySelector('[aria-label="Evidence coverage"]');
            if (!direct || !evidenceSection) return "missing";
            return direct.compareDocumentPosition(evidenceSection) &
                Node.DOCUMENT_POSITION_FOLLOWING
                ? "direct-first"
                : "evidence-first";
        });
        expect(order).toBe("direct-first");
    });

    test("evidence can be expanded to see its excerpt", async ({ page }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        await submitAskDevQuestion(
            page,
            scenarioQuestion("complete", "What is the current status?"),
        );
        await expect(askDevAnswerArticle(page)).toBeVisible();

        await page.getByRole("button", { name: "Open evidence", exact: true }).click();
        await expect(page.getByText("Evidence excerpt")).toBeVisible();
    });
});

test.describe("Ask Dev — accessibility", () => {
    test("Escape closes the window and returns focus to the launcher", async ({ page }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        await page.keyboard.press("Escape");
        await expect(askDevLauncher(page)).toBeFocused();
    });

    test("the mobile full-screen window exposes a modal dialog role", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        await expect(page.getByRole("dialog", { name: "Ask Dev" })).toBeVisible();
    });

    test("the submit control is keyboard reachable and labeled", async ({ page }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);

        await expect(askDevSubmit(page)).toBeVisible();
        // The submit button is disabled (and so skipped in tab order) until
        // the composer has a non-empty draft.
        await askDevComposer(page).fill("Draft text");
        await expect(askDevComposer(page)).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(askDevSubmit(page)).toBeFocused();
    });
});
