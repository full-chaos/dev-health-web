import { expect, test } from "@playwright/test";

import { ASK_DEV_OUTCOME_TABLE } from "./fixtures/askDevOutcomes";
import { CLARIFICATION_CANDIDATE_REFS } from "./mocks/devScenario";
import {
    askDevAnswerArticle,
    askDevComposer,
    askDevTranscript,
    getAskDevRequestCounts,
    openAskDevWindow,
    resetAskDevMock,
    scenarioQuestion,
    submitAskDevQuestion,
} from "./helpers/askDev";

/**
 * Collapses whitespace and drops the rendered "As of <timestamp>" line so two
 * renderings of the SAME answer compare equal. The timestamp is formatted
 * from the payload and is identical across surfaces, but stripping it keeps
 * the comparison from becoming a clock test if that ever changes.
 */
function normalizeAnswerText(text: string): string {
    return text
        .replace(/As of [^\n]*/gu, "As of <timestamp>")
        .replace(/\s+/gu, " ")
        .trim();
}

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

    // CHAOS-3219 W6 + W7.
    //
    // W6: the outcome state matrix ran window-only. `/dev` had exactly one
    // default-tier outcome test and it was the entitlement-off negative, so
    // half of this row's "rendering" claim covered nothing.
    //
    // W7: continuity was proven for the `complete` scenario alone — 1 of 6
    // statuses — while group 4 requires that identical payloads render
    // equivalent semantics across both surfaces. A surface that dropped the
    // limitation caption, or showed a different status for the same answer,
    // passed every test that existed.
    //
    // Comparing normalized article text rather than a chosen field list is
    // deliberate: a projection would only ever compare what its author
    // thought to name, and the failure this guards against is a surface
    // silently omitting something nobody listed.
    for (const outcome of ASK_DEV_OUTCOME_TABLE) {
        test(`${outcome.key}: renders on /dev and resumes in the window with equivalent semantics`, async ({
            page,
            request,
        }) => {
            await page.goto("/dev", { waitUntil: "domcontentloaded" });
            const composer = askDevComposer(page);
            await composer.fill(
                scenarioQuestion(outcome.key, `A ${outcome.key} question for the workspace`),
            );
            await composer.press("Enter");

            const workspaceAnswer = askDevAnswerArticle(page);
            await expect(workspaceAnswer).toBeVisible();
            await expect(workspaceAnswer).toContainText(outcome.directSummary);
            if (outcome.captionContains) {
                await expect(workspaceAnswer).toContainText(outcome.captionContains);
            }
            const workspaceText = normalizeAnswerText(await workspaceAnswer.innerText());
            const workspaceAnswerId = await workspaceAnswer.getAttribute("id");
            const countsBefore = await getAskDevRequestCounts(request);

            await page.getByRole("link", { name: "Return to Ask Dev window" }).click();
            await expect(page).not.toHaveURL(/\/dev(\?|$)/);

            const windowAnswer = askDevAnswerArticle(page);
            await expect(windowAnswer).toBeVisible();
            await expect(windowAnswer).toContainText(outcome.directSummary);
            if (outcome.captionContains) {
                await expect(windowAnswer).toContainText(outcome.captionContains);
            }
            expect(
                normalizeAnswerText(await windowAnswer.innerText()),
                `The ${outcome.key} answer must read the same on both surfaces.`,
            ).toBe(workspaceText);

            // Matching text is not proof of one run. A surface transition
            // that started a SECOND conversation and rendered the same canned
            // answer satisfies every assertion above (codex adversarial
            // review round 2, HIGH), while the product contract requires at
            // most one canonical run across surfaces. Identity and the
            // request counters settle it.
            expect(
                await windowAnswer.getAttribute("id"),
                "The window rendered a different answer, not the same one resumed.",
            ).toBe(workspaceAnswerId);
            const countsAfter = await getAskDevRequestCounts(request);
            expect(countsAfter.messages, "Returning to the window re-ran the question.").toBe(
                countsBefore.messages,
            );
            expect(
                countsAfter.conversationsCreated,
                "Returning to the window started a second conversation.",
            ).toBe(countsBefore.conversationsCreated);
        });
    }

    // CHAOS-3219 W7, clarification arm. The equivalence loop above iterates
    // ASK_DEV_OUTCOME_TABLE, which does not contain `needs_clarification` —
    // so the one answer shape whose whole purpose is to ask the user for
    // something was covered on the window only, and a window/`/dev`
    // divergence in candidate rendering stayed invisible (codex adversarial
    // review round 2, MEDIUM). Candidates and the scope row are compared,
    // not just the answer text: the candidate list IS the content here.
    test("needs_clarification: candidates and scope render equivalently on both surfaces", async ({
        page,
        request,
    }) => {
        await page.goto("/dev", { waitUntil: "domcontentloaded" });
        const composer = askDevComposer(page);
        await composer.fill(
            scenarioQuestion("needs_clarification", "What is the status of dev-health?"),
        );
        await composer.press("Enter");

        const workspaceAnswer = askDevAnswerArticle(page);
        await expect(workspaceAnswer).toBeVisible();
        await expect(workspaceAnswer).toContainText("Possible scope matches");
        for (const candidate of CLARIFICATION_CANDIDATE_REFS) {
            await expect(workspaceAnswer).toContainText(candidate.display_label);
        }
        const workspaceText = normalizeAnswerText(await workspaceAnswer.innerText());
        const workspaceAnswerId = await workspaceAnswer.getAttribute("id");
        const countsBefore = await getAskDevRequestCounts(request);

        await page.getByRole("link", { name: "Return to Ask Dev window" }).click();
        await expect(page).not.toHaveURL(/\/dev(\?|$)/);

        const windowAnswer = askDevAnswerArticle(page);
        await expect(windowAnswer).toBeVisible();
        await expect(windowAnswer).toContainText("Possible scope matches");
        for (const candidate of CLARIFICATION_CANDIDATE_REFS) {
            await expect(windowAnswer).toContainText(candidate.display_label);
        }
        expect(
            normalizeAnswerText(await windowAnswer.innerText()),
            "The clarification answer must read the same on both surfaces.",
        ).toBe(workspaceText);
        expect(await windowAnswer.getAttribute("id")).toBe(workspaceAnswerId);
        const countsAfter = await getAskDevRequestCounts(request);
        expect(countsAfter.messages).toBe(countsBefore.messages);
        expect(countsAfter.conversationsCreated).toBe(countsBefore.conversationsCreated);
    });

    // CHAOS-3219 W10. Group 2 requires page navigation without silent
    // subject/scope mutation, and the launch thresholds require zero silent
    // organization widening. Proven only at the unit tier until now: no
    // browser-tier test navigated at all after committing a scope.
    test("navigating between ordinary routes does not mutate the committed scope, the transcript, or the run", async ({
        page,
        request,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("complete", "How many items completed this period?"),
        );
        await expect(askDevAnswerArticle(page)).toBeVisible();

        const committedRow = page.getByText(/^Committed scope:/u).first();
        const committedBefore = (await committedRow.innerText()).trim();
        const answerIdBefore = await askDevAnswerArticle(page).getAttribute("id");
        const countsBefore = await getAskDevRequestCounts(request);
        expect(
            committedBefore,
            "The scope must be committed before this test can prove it stays put.",
        ).not.toContain("Commits when you ask");

        // Client-side navigation, not page.goto: the requirement is about
        // moving around the app with the window open. A hard reload remounts
        // the provider and is a different claim (conversation restoration),
        // covered by the resume tests above.
        await page
            .getByRole("complementary")
            .getByRole("link", { name: "Plan", exact: true })
            .click();
        await expect(page).toHaveURL(/\/plan(?:[?#]|$)/u);

        await expect(askDevAnswerArticle(page)).toContainText("Twelve work items completed");
        await expect(
            askDevTranscript(page).getByText("How many items completed this period?"),
        ).toBeVisible();
        expect(
            (
                await page
                    .getByText(/^Committed scope:/u)
                    .first()
                    .innerText()
            ).trim(),
            "Navigating to another route silently re-scoped the conversation.",
        ).toBe(committedBefore);

        // Same answer carried across, not a re-run that happened to produce
        // identical canned text (codex adversarial review round 2, HIGH).
        expect(
            await askDevAnswerArticle(page).getAttribute("id"),
            "Navigation replaced the answer instead of carrying it across.",
        ).toBe(answerIdBefore);
        const countsAfter = await getAskDevRequestCounts(request);
        expect(countsAfter.messages, "Navigation re-ran the question.").toBe(countsBefore.messages);
        expect(countsAfter.conversationsCreated, "Navigation started a second conversation.").toBe(
            countsBefore.conversationsCreated,
        );
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
