import { expect, test } from "@playwright/test";

import { ASK_DEV_OUTCOME_TABLE } from "./fixtures/askDevOutcomes";
import {
    askDevAnswerArticle,
    askDevFailedAlert,
    askDevLauncher,
    openAskDevWindow,
    resetAskDevMock,
    scenarioQuestion,
    setAskDevCapabilities,
    setAskDevEntitlement,
    submitAskDevQuestion,
} from "./helpers/askDev";

// CHAOS-3287: every public outcome the current dev_answer.v1 contract can
// actually produce gets a distinct, accessible rendering test here. See
// ask-dev-shared.spec.ts's file header for why this does not (yet) cover
// the dev_answer.v2 outcome taxonomy from CHAOS-3294/CHAOS-3298.
//
// The status/copy pairing for each scenario below is NOT hardcoded here —
// it's read from tests/fixtures/askDevOutcomes.ts, the same table
// tests/mocks/devScenario.ts uses to build the canned answer. CHAOS-3298
// only needs to re-point that one table at dev_answer.v2 shapes; this loop
// stays correct un-touched.

test.beforeEach(async ({ request }) => {
    await resetAskDevMock(request);
});

test.describe("Ask Dev — answer status outcomes", () => {
    for (const outcome of ASK_DEV_OUTCOME_TABLE) {
        test(`${outcome.key}: renders the direct answer and its expected limitation caption`, async ({
            page,
        }) => {
            await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
            await openAskDevWindow(page);
            await submitAskDevQuestion(
                page,
                scenarioQuestion(outcome.key, `Question for the ${outcome.key} scenario`),
            );

            const answer = askDevAnswerArticle(page);
            await expect(answer).toBeVisible();
            await expect(answer).toContainText(outcome.directSummary);

            if (outcome.captionContains) {
                await expect(answer).toContainText(outcome.captionContains);
            } else {
                // `complete` is the only status with no STATUS_EXPLANATIONS
                // entry (AskDevAnswer.tsx): assert none of the OTHER
                // scenarios' captions leaked in by mistake.
                for (const otherOutcome of ASK_DEV_OUTCOME_TABLE) {
                    if (otherOutcome.captionContains) {
                        await expect(
                            answer.getByText(otherOutcome.captionContains),
                        ).not.toBeVisible();
                    }
                }
            }

            if (outcome.emptyEvidence) {
                await expect(page.getByRole("button", { name: "Open evidence" })).not.toBeVisible();
            }

            // A refusal/insufficient-evidence answer is a completed answer,
            // not a stream failure: the role="alert" failed-run treatment
            // must never also appear alongside it.
            await expect(askDevFailedAlert(page)).not.toBeVisible();
        });
    }

    test("needs_clarification (ambiguous scope): presents candidates without evidence", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("needs_clarification", "What is the status of dev-health?"),
        );

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();
        await expect(answer).toContainText("More than one match was found");
        await expect(answer.getByText("Possible scope matches")).toBeVisible();
        const useScope = answer.getByRole("button", { name: "Use this scope" }).first();
        await expect(useScope).toBeVisible();
        await useScope.click();
    });

    test("a stream-level failure (source_unavailable) renders the alert treatment, not a silent blank", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("source_unavailable_error", "What is the deployment status?"),
        );

        await expect(askDevFailedAlert(page)).toBeVisible();
        await expect(askDevFailedAlert(page)).toContainText(
            "A required source is temporarily unavailable.",
        );
        await expect(askDevAnswerArticle(page)).not.toBeVisible();
    });
});

test.describe("Ask Dev — availability gating", () => {
    test("disabled capabilities hide the persistent window entirely", async ({ page, request }) => {
        await setAskDevCapabilities(request, "disabled");
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await expect(askDevLauncher(page)).not.toBeVisible();
    });

    test("org-level entitlement off (not just capabilities) hides /dev's workspace entirely", async ({
        page,
        request,
    }) => {
        // Distinct failure layer from the capabilities tests above: this is
        // the server-rendered org entitlement gate in (app)/dev/page.tsx
        // (getOrgEntitlements → features.ask_dev), which runs independently
        // of the client-side capabilities check.
        await setAskDevEntitlement(request, "ask-dev-disabled");
        await page.goto("/dev", { waitUntil: "domcontentloaded" });
        await expect(
            page.getByText("Ask Dev is not available for this organization"),
        ).toBeVisible();
        await expect(page.getByRole("region", { name: "Ask Dev workspace" })).not.toBeVisible();
    });

    test("not_ready capabilities surface the administrator-safe reason, not an internal code", async ({
        page,
        request,
    }) => {
        await setAskDevCapabilities(request, "not_ready");
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        // The composer never renders in the not_ready state, so this opens
        // the window directly rather than via openAskDevWindow (which waits
        // on the composer as its "opened" signal).
        await askDevLauncher(page).click();

        await expect(page.getByText("needs administrator attention")).toBeVisible();
        await expect(page.getByText("finish provider setup")).toBeVisible();
        const bodyText = await page.locator("body").innerText();
        expect(bodyText).not.toContain("missing_credentials");
    });
});
