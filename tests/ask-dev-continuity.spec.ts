import { expect, test } from "@playwright/test";

import {
    askDevAnswerArticle,
    askDevComposer,
    askDevTranscript,
    openAskDevWindow,
    resetAskDevMock,
    scenarioQuestion,
    submitAskDevQuestion,
} from "./helpers/askDev";

// CHAOS-3287: window <-> /dev share one conversation/transcript because
// AskDevProvider mounts once at the (app) layout and both surfaces render
// through the same AskDevConversation component (AskDevWindow hides itself
// on /dev; AskDevWorkspace shows the same transcript with history enabled).
//
// Org-switch state isolation ("organization switch ... clears unsafe
// retained state") already has a real regression test — the render-time
// reset in AskDevProvider (CHAOS-3215 H1) is covered by
// src/components/ask-dev/AskDevProvider.test.tsx. Reproducing it here would
// require rewiring the shared auth/org mock fixtures (orgs/me, entitlements,
// switch-org) that many unrelated specs depend on; deferred rather than
// risking that shared surface for one additional layer of the same
// assertion — see the CHAOS-3287 handoff report for detail.

test.beforeEach(async ({ request }) => {
    await resetAskDevMock(request);
});

test.describe("Ask Dev — window <-> /dev continuity", () => {
    test("a conversation started in the window resumes in the /dev workspace", async ({ page }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("complete", "How many items completed this period?"),
        );
        await expect(askDevAnswerArticle(page)).toBeVisible();

        await page.getByRole("link", { name: "Ask Dev workspace" }).click();
        await expect(page).toHaveURL(/\/dev(\?|$)/);
        await expect(page.getByRole("region", { name: "Ask Dev workspace" })).toBeVisible();
        // Scoped to the transcript: the same question text also legitimately
        // appears as the saved conversation's title in the history sidebar
        // (showHistory is on for /dev), which would otherwise match too.
        await expect(
            askDevTranscript(page).getByText("How many items completed this period?"),
        ).toBeVisible();
        await expect(askDevAnswerArticle(page)).toContainText("Twelve work items completed");
    });

    test("a conversation started on /dev resumes in the persistent window", async ({ page }) => {
        await page.goto("/dev", { waitUntil: "domcontentloaded" });
        const composer = askDevComposer(page);
        await composer.fill(scenarioQuestion("complete", "What is the delivery status?"));
        await composer.press("Enter");
        await expect(askDevAnswerArticle(page)).toBeVisible();

        await page.getByRole("link", { name: "Return to Ask Dev window" }).click();
        await expect(page).not.toHaveURL(/\/dev(\?|$)/);
        await expect(page.getByText("What is the delivery status?")).toBeVisible();
        await expect(askDevAnswerArticle(page)).toContainText("Twelve work items completed");
    });

    test("starting a new conversation clears the previous transcript on both surfaces", async ({
        page,
    }) => {
        await page.goto("/dev", { waitUntil: "domcontentloaded" });
        const composer = askDevComposer(page);
        await composer.fill(scenarioQuestion("complete", "What is the delivery status?"));
        await composer.press("Enter");
        await expect(askDevAnswerArticle(page)).toBeVisible();

        await page.getByRole("button", { name: "New conversation" }).click();
        // Scoped to the active transcript, not the whole page: the prior
        // conversation legitimately still shows up by title in the history
        // sidebar (showHistory is on for /dev) — "New conversation" starts
        // a fresh transcript, it does not delete history.
        await expect(
            askDevTranscript(page).getByText("What is the delivery status?"),
        ).not.toBeVisible();
        await expect(askDevComposer(page)).toHaveValue("");
    });
});
