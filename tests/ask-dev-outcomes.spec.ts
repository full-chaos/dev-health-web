import { expect, test } from "@playwright/test";

import { ASK_DEV_OUTCOME_TABLE } from "./fixtures/askDevOutcomes";
import {
    askDevAnswerArticle,
    askDevFailedAlert,
    askDevLauncher,
    getAskDevRequestCounts,
    openAskDevWindow,
    resetAskDevMock,
    scenarioQuestion,
    setAskDevCapabilities,
    setAskDevEntitlement,
    submitAskDevQuestion,
} from "./helpers/askDev";
import {
    CLARIFICATION_CANDIDATE_REFS,
    CLARIFICATION_COPY,
    NO_ANSWER_OUTCOMES,
    NOT_READY_READINESS_VALUES,
    PINNED_NO_ANSWER_OUTCOME_KEYS,
} from "./mocks/devScenario";

// CHAOS-3287: every public outcome the current dev_answer.v1 contract can
// actually produce gets a distinct, accessible rendering test here. See
// ask-dev-shared.spec.ts's file header for why this does not (yet) cover
// the dev_answer.v2 outcome taxonomy from CHAOS-3294/CHAOS-3298.
//
// The status/copy pairing for each scenario below is NOT hardcoded here —
// it's read from tests/fixtures/askDevOutcomes.ts, the same table
// tests/mocks/devScenario.ts uses to build the canned answer. Whoever
// eventually points that one table at dev_answer.v2 shapes leaves this loop
// correct un-touched.

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

    // CHAOS-3219 W2. `needs_clarification` is one of the v2 contract's
    // EMPTY_CONTENT_OUTCOMES and projects to v1 as `insufficient_evidence`
    // with an `ambiguous` scope row and no content (ops
    // contracts_v2/compat.py). Before this test the mock served the
    // canonical fixture's `status: "complete"` here, so the suite asserted a
    // payload production cannot emit — coverage that could not fail for the
    // reason it claimed to exist.
    test("needs_clarification (ambiguous scope): renders the clarification status the backend actually projects, with candidates and no content", async ({
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
        await expect(answer).toContainText(CLARIFICATION_COPY.ambiguous);

        // The projected status, not the fixture's. `Complete` beside a
        // request for clarification is the exact contradiction W2 closes.
        await expect(answer.getByText("Insufficient evidence", { exact: true })).toBeVisible();
        await expect(answer.getByText("Complete", { exact: true })).not.toBeVisible();
        await expect(answer).toContainText("isn't enough evidence");

        // Ambiguity is NOT a no-match: several authorized entities did
        // match. Rendering "Closest matches" here would assert the opposite
        // (AskDevAnswer.tsx's `noMatch` branch) and is the misclassification
        // this pair of assertions pins.
        await expect(answer.getByText("Possible scope matches")).toBeVisible();
        await expect(answer.getByText("Closest matches")).not.toBeVisible();
        for (const candidate of CLARIFICATION_CANDIDATE_REFS) {
            await expect(answer).toContainText(candidate.display_label);
        }
        await expect(answer).toContainText(
            "Choose or remove the proposed context before asking the next question.",
        );

        // No source plan ran for a subject that was never committed, so the
        // answer carries no claims, metrics or evidence to expand.
        await expect(page.getByRole("button", { name: "Open evidence" })).not.toBeVisible();
        await expect(askDevFailedAlert(page)).not.toBeVisible();
    });

    // CHAOS-3219 W3. The prior revision clicked this button and asserted
    // nothing, so the entire effect of candidate selection — the whole point
    // of a clarification turn — was unverified.
    test("needs_clarification: choosing a candidate commits it as proposed context and does not auto-submit", async ({
        page,
        request,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("needs_clarification", "What is the status of dev-health?"),
        );

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();
        const countsBefore = await getAskDevRequestCounts(request);
        // CHAOS-3524: the persistent "Committed scope:" bar this test used
        // to read directly is gone (display-only removal — see
        // AskDevConversation.tsx). The answer id is the load-bearing proof
        // that the committed run wasn't silently touched: committing only
        // ever happens by submitting a new question or opening a different
        // conversation, neither of which happens between here and the
        // check below, so an unchanged answer id is strictly stronger than
        // an unchanged label string would have been.
        const answerIdBefore = await answer.getAttribute("id");

        const chosen = CLARIFICATION_CANDIDATE_REFS[0];
        await answer
            .getByRole("listitem")
            .filter({ hasText: chosen.display_label })
            .getByRole("button", { name: "Use this scope" })
            .click();

        // The choice becomes visible PROPOSED context — and only proposed.
        // Committing is the user's next act, so the committed answer must
        // not move underneath them (CHAOS-3219 group 2: proposed and
        // committed subjects are both visible, and scope never mutates
        // silently). CHAOS-3524: the proposal now surfaces as the "Scoped
        // to ..." chip above the composer instead of the removed bar.
        await expect(page.getByText("Scoped to")).toContainText(chosen.display_label);
        expect(
            await answer.getAttribute("id"),
            "Selecting a candidate proposes a scope; it must not silently re-commit one.",
        ).toBe(answerIdBefore);

        // Group 5 is explicit that an approved action never auto-submits:
        // selecting a candidate must not execute a run by itself.
        const countsAfterSelect = await getAskDevRequestCounts(request);
        expect(
            countsAfterSelect.messages,
            "Selecting a clarification candidate must not execute a run.",
        ).toBe(countsBefore.messages);
        expect(
            countsAfterSelect.conversationsCreated,
            "Selecting a clarification candidate must not create a conversation.",
        ).toBe(countsBefore.conversationsCreated);

        // The user still drives the next turn, and it is one run — and that
        // run must actually CARRY the chosen subject. Displayed state is not
        // proof of what went on the wire: a defect that renders the chosen
        // candidate while submitting the old or an organization-wide scope
        // passes every assertion above (codex adversarial review, HIGH).
        await submitAskDevQuestion(page, "And how is delivery trending?");
        await expect(askDevAnswerArticle(page).nth(1)).toBeVisible();
        const countsAfterAsk = await getAskDevRequestCounts(request);
        expect(countsAfterAsk.messages).toBe(countsBefore.messages + 1);
        expect(countsAfterAsk.conversationsCreated).toBe(countsBefore.conversationsCreated);

        const submitted = countsAfterAsk.lastMessageScope as {
            direct_scope?: string;
            repositories?: string[];
            entity_refs?: { entity_id?: string }[];
        } | null;
        expect(submitted, "The message request carried no scope at all.").not.toBeNull();
        const submittedIds = [
            ...(submitted?.repositories ?? []),
            ...(submitted?.entity_refs ?? []).map((ref) => ref.entity_id),
        ];
        expect(submittedIds, "The chosen candidate was displayed but not submitted.").toContain(
            chosen.entity_id,
        );
        expect(
            submitted?.direct_scope,
            "Choosing a specific repository must not widen the submitted scope to the organization.",
        ).not.toBe("organization");
    });

    // CHAOS-3219 W4. The coverage block is the only place the UI explains
    // WHY an answer was downgraded. Each required-source failure state must
    // reach the screen, and a satisfied answer must claim no failure it does
    // not have.
    const COVERAGE_MATRIX = [
        {
            scenario: "complete",
            question: "How much work completed?",
            expected: "Coverage: 1 of 1 sources",
            absent: [
                "required sources unavailable",
                "required sources degraded",
                "required sources stale",
            ],
        },
        {
            scenario: "partial",
            question: "How much work completed?",
            expected: "1 required sources unavailable",
            absent: ["required sources degraded", "required sources stale"],
        },
        {
            scenario: "degraded",
            question: "How much work completed?",
            expected: "1 required sources stale",
            absent: ["required sources unavailable", "required sources degraded"],
        },
        {
            scenario: "degraded_sources_only",
            question: "How much work completed?",
            expected: "1 required sources degraded",
            absent: ["required sources unavailable", "required sources stale"],
        },
    ] as const;

    for (const row of COVERAGE_MATRIX) {
        test(`${row.scenario}: the coverage block names the required-source states this answer actually has`, async ({
            page,
        }) => {
            await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
            await openAskDevWindow(page);
            await submitAskDevQuestion(page, scenarioQuestion(row.scenario, row.question));

            const answer = askDevAnswerArticle(page);
            await expect(answer).toBeVisible();
            const coverage = answer.getByLabel("Evidence coverage");
            await expect(coverage).toBeVisible();
            await expect(coverage).toContainText(row.expected);
            for (const absent of row.absent) {
                await expect(coverage).not.toContainText(absent);
            }
        });
    }

    // Codex round-2 finding 2: the loop below iterates NO_ANSWER_OUTCOMES (a
    // hand-maintained table), never the pinned artifact's own keys directly
    // -- so a 7th outcome ops adds gets no test until someone remembers to
    // add a row, and a row deleted from the table silently deletes its test,
    // with nothing here to fail either way. This asserts the two sets are
    // exactly equal, both directions, so either drift fails loudly.
    test("NO_ANSWER_OUTCOMES covers exactly the outcomes the pinned artifact publishes", () => {
        const tableKeys = [...new Set(NO_ANSWER_OUTCOMES.map((entry) => entry.outcome))].sort();
        const artifactKeys = [...PINNED_NO_ANSWER_OUTCOME_KEYS];
        const missingFromTable = artifactKeys.filter((key) => !tableKeys.includes(key));
        const extraInTable = tableKeys.filter((key) => !artifactKeys.includes(key));
        expect(
            missingFromTable,
            "the pinned artifact publishes outcome(s) with no NO_ANSWER_OUTCOMES entry -- add a " +
                "row so this outcome actually gets an e2e test",
        ).toEqual([]);
        expect(
            extraInTable,
            "NO_ANSWER_OUTCOMES has an entry with no matching artifact outcome -- remove the " +
                "stale row",
        ).toEqual([]);
    });

    // CHAOS-3219 W1 / CHAOS-3471. Six of the eight dev_answer.v2 public
    // outcomes never become an answer at all: the projector turns each into
    // a DevError carrying server-owned canonical copy, published as the
    // pinned no_answer_vocabulary.v1.json artifact (ops
    // contracts_v2/compat.py's no_answer_error_projection). Those sentences
    // are therefore the ENTIRE user-visible artifact of those outcomes, and
    // until CHAOS-3219 W1 the default suite emitted 2 of 24 DevErrorCodes
    // and asserted none of them.
    for (const outcome of NO_ANSWER_OUTCOMES) {
        test(`${outcome.outcome}: renders the canonical no-answer copy and the correct retry affordance`, async ({
            page,
        }) => {
            await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
            await openAskDevWindow(page);
            await submitAskDevQuestion(
                page,
                scenarioQuestion(outcome.scenario, `A question that ends in ${outcome.outcome}`),
            );

            const alert = askDevFailedAlert(page);
            await expect(alert).toBeVisible();
            await expect(alert).toContainText(outcome.safeMessage);

            // A no-answer outcome is not an answer: the answer article must
            // not also render (a "blank answer" is its own launch-threshold
            // failure).
            await expect(askDevAnswerArticle(page)).not.toBeVisible();

            // Only the retryable outcome offers a retry. Offering it on a
            // terminal outcome invites a pointless second run; withholding
            // it on the retryable one strands a recoverable failure.
            const retry = alert.getByRole("button", { name: "Retry" });
            if (outcome.retryable) {
                await expect(retry).toBeVisible();
            } else {
                await expect(retry).not.toBeVisible();
            }

            // The copy is outcome-specific, not one fixed apology reused for
            // everything — a renderer that printed a constant would satisfy
            // the assertion above and fail this one.
            for (const other of NO_ANSWER_OUTCOMES) {
                if (other.outcome === outcome.outcome) continue;
                await expect(alert).not.toContainText(other.safeMessage);
            }

            // The raw code behind the outcome never reaches the alert.
            const alertText = await alert.innerText();
            expect(alertText).not.toContain(outcome.code);
            expect(alertText).not.toContain(outcome.code.replaceAll("_", " "));
        });
    }

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

    // CHAOS-3219 W14. Only 3 of the 5 pinned DevCapabilitiesReadiness values
    // were ever served by the mock. `unsupported_model` and `degraded` are
    // real enum members an administrator can land on, and neither had any
    // assertion that its copy stays administrator-safe.
    for (const readiness of NOT_READY_READINESS_VALUES) {
        test(`readiness ${readiness}: surfaces an administrator-safe explanation, never the raw enum`, async ({
            page,
            request,
        }) => {
            await setAskDevCapabilities(request, readiness);
            await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
            await askDevLauncher(page).click();

            await expect(page.getByText("needs administrator attention")).toBeVisible();
            const bodyText = await page.locator("body").innerText();
            expect(bodyText, `The raw ${readiness} enum reached the page.`).not.toContain(
                readiness,
            );
            expect(bodyText).not.toContain(readiness.replaceAll("_", " "));
        });
    }

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
