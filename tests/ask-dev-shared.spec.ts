import { expect, test } from "@playwright/test";

import {
    ANSWER_STATUS_VALUES,
    DEV_ERROR_CODES,
    forbiddenEnumStrings,
    SCOPE_RESOLUTION_OUTCOME_VALUES,
} from "./fixtures/askDevContracts";
import { outcomeCase } from "./fixtures/askDevOutcomes";
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
// denied, failed — CHAOS-3294) is NOT consumed by this frontend, and
// CHAOS-3298's contract re-pin did not change that: ops' v2 frame stays
// server-internal and is projected back down to a v1 answer before it
// reaches the wire (api/dev/router.py's v2-to-v1 projector), so
// dev_answer.v1 is still the whole transport contract. The components here
// render the v1 status enum (complete/partial/degraded/insufficient_
// evidence/refused/error) because that is what the server actually sends.
// This spec exercises every outcome the app can reach today, plus the
// shared request-lifecycle/internal-state-isolation/evidence-hierarchy
// invariants that do not depend on v2. It intentionally does not fabricate
// v2-only outcomes against a UI that does not render them and a server that
// does not emit them — that adoption unblocks when the backend serves v2 on
// the wire, not when web re-pins.

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

// CHAOS-3219 W5. `safeCopy` guards five separate prose fields
// (direct_summary, claim text, conflict summary, warnings, follow-ups), and
// the launch thresholds require zero internal-enum/reason leakage. The
// default suite checked only the failed-run alert and the status/scope
// pills, so no browser-tier test ever drove a poisoned payload through the
// guarded fields at all.
test.describe("Ask Dev — internal-token guard over answer prose", () => {
    const WITHHELD_COPY = "This part of the answer could not be shown.";
    const POISONED_TOKENS = [
        "insufficient_evidence",
        "internal_error",
        "feature_not_enabled",
        "source_unavailable",
        "not_ready",
    ];
    const CLEAN_STRINGS = [
        "Coverage was computed from factual_completion.ts inputs.",
        "Should the cannot_ready helper be reviewed?",
        "Completion is computed by the prev1_state accessor.",
    ];

    test("withholds every prose field carrying an internal token, and leaves look-alike text alone", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("leaky_prose", "What is the current status?"),
        );

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();
        const answerText = await answer.innerText();

        // Not one of the five poisoned fields reaches the screen carrying
        // its token. Each field carries a DIFFERENT token, so a guard wired
        // to only one of them fails here rather than passing on the others.
        //
        // Matched at word boundaries, the same way the guard itself matches
        // (lib/dev/internalTokens.ts). A bare substring check would be
        // wrong in both directions: it reports a leak for the deliberate
        // `cannot_ready` control, which merely CONTAINS `not_ready`, and it
        // is the over-matching behaviour the guard exists to avoid. The
        // space-transformed form catches a renderer that prints
        // `token.replaceAll("_", " ")`; it stays lowercase so the sanctioned
        // capitalised labels ("Insufficient evidence") are not mistaken for
        // a leak.
        for (const token of POISONED_TOKENS) {
            expect(answerText, `"${token}" leaked into the rendered answer.`).not.toMatch(
                new RegExp(`\\b${token}\\b`, "u"),
            );
            expect(answerText, `"${token}" leaked in space-transformed form.`).not.toMatch(
                new RegExp(`\\b${token.replaceAll("_", " ")}\\b`, "u"),
            );
        }

        // Withholding is visible, not silent, AND it happened in EVERY
        // guarded region. Two weaker shapes were rejected on the way here:
        // scanning one aggregate string cannot tell "withheld" from "the
        // region was never rendered", and asserting a region merely exists
        // proves nothing about its guarded child (codex adversarial review
        // rounds 1 and 2). Each poisoned field is therefore located through
        // its own containing region.
        const WITHHELD_REGIONS = [
            { name: "claim text", locator: answer.getByLabel("What the evidence suggests") },
            { name: "conflict summary", locator: answer.getByLabel("Conflicting evidence") },
            { name: "warnings", locator: answer.getByLabel("Answer limitations") },
            { name: "follow-ups", locator: answer.getByLabel("Suggested follow-up questions") },
        ];
        for (const region of WITHHELD_REGIONS) {
            await expect(
                region.locator,
                `The ${region.name} region did not render at all.`,
            ).toBeVisible();
            await expect(
                region.locator,
                `The poisoned ${region.name} was not withheld.`,
            ).toContainText(WITHHELD_COPY);
        }

        // Exactly five, not "at least four". Five fields were poisoned, and
        // the four regions above account for four of them — so this pins the
        // fifth, the direct summary, without needing a brittle selector for
        // it. A leaking direct summary yields four and fails here even though
        // every region assertion above still passes.
        expect(
            await answer.getByText(WITHHELD_COPY).count(),
            "Each of the five poisoned prose fields must be withheld exactly once.",
        ).toBe(5);

        // The negative controls. These are the guard's three documented
        // false-positive shapes; `factual_completion` contains
        // `actual_completion`, `cannot_ready` contains `not_ready`, and
        // `prev1_state` contains the `ev1_` handle prefix. A guard widened
        // from word-boundary/shape matching to bare substring matching
        // still passes every assertion above and fails these.
        for (const clean of CLEAN_STRINGS) {
            expect(answerText, `"${clean}" is not a leak and must not be withheld.`).toContain(
                clean,
            );
        }
    });
});

// CHAOS-3219 W8. Group 4 states it plainly: no user text is placed in URLs
// or analytics payloads. Nothing in web asserted it. A question is the most
// sensitive string Ask Dev handles — it lands in browser history, in
// referrer headers, and in any third-party beacon that reads either.
test.describe("Ask Dev — question text containment", () => {
    test("a question never reaches the URL, history, or any outbound request but the Ask Dev message", async ({
        page,
    }) => {
        // Distinctive enough that a substring match cannot collide with
        // ordinary page copy, and URL-encodes recognisably.
        const SECRET_QUESTION = "Zephyrine quarterly burndown for Falcon Nine?";
        const ENCODED = encodeURIComponent(SECRET_QUESTION);
        // Percent-encoding is not the only way a question reaches a URL:
        // form encoding writes spaces as "+", and a partially-encoded value
        // matches neither the raw nor the fully-encoded form (codex
        // adversarial review round 2, MEDIUM). Decoding the candidate and
        // normalising "+" catches all three with one predicate.
        const containsQuestion = (value: string | null | undefined): boolean => {
            if (!value) return false;
            let decoded = value;
            try {
                decoded = decodeURIComponent(value.replaceAll("+", " "));
            } catch {
                // A malformed escape sequence cannot be decoded; the raw
                // comparison below still applies.
            }
            return [value, decoded].some(
                (candidate) =>
                    candidate.includes(SECRET_QUESTION) ||
                    candidate.includes(ENCODED) ||
                    candidate.includes(ENCODED.replaceAll("%20", "+")),
            );
        };

        const leaks: string[] = [];
        // Positive control for the detector itself. Everything else in this
        // test is an absence assertion, which a listener that never fired —
        // or that could not read post bodies — would satisfy perfectly. This
        // records the one carrier the question IS known to travel in, so a
        // blind detector fails loudly instead of reporting a clean run.
        const observedAskDevBodies: string[] = [];
        page.on("request", (request) => {
            const url = request.url();
            const path = new URL(url).pathname;
            if (path.startsWith("/api/v1/dev/")) {
                const askDevBody = request.postData();
                if (askDevBody) observedAskDevBodies.push(askDevBody);
            }
            // A URL is never an acceptable carrier, for ANY endpoint: it
            // reaches browser history, referrer headers, and server logs.
            if (containsQuestion(url)) {
                leaks.push(`URL: ${url}`);
            }
            // Request BODIES are a different question. The Ask Dev API is
            // where the question is supposed to go, and it goes to more than
            // one endpoint there: `/messages` carries the question itself,
            // and `POST /conversations` carries a question-derived title
            // (which is what the history sidebar lists). Both are the
            // product working. Group 4's prohibition is on URLs and
            // analytics payloads, so the body check covers every request
            // that is NOT the Ask Dev API — telemetry, error reporting, and
            // any third-party beacon included.
            if (path.startsWith("/api/v1/dev/")) return;
            if (containsQuestion(request.postData())) {
                leaks.push(`${request.method()} ${path} body`);
            }
        });

        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(page, SECRET_QUESTION);
        await expect(askDevAnswerArticle(page)).toBeVisible();

        // Surviving a surface change is part of the claim: carry the
        // conversation to /dev and back, which is where a naive
        // "resume by query param" implementation would put it.
        await page.getByRole("link", { name: "Ask Dev workspace" }).click();
        await expect(page).toHaveURL(/\/dev(\?|$)/u);
        await page.getByRole("link", { name: "Return to Ask Dev window" }).click();
        await expect(page).not.toHaveURL(/\/dev(\?|$)/u);

        expect(
            observedAskDevBodies.some((body) => body.includes(SECRET_QUESTION)),
            "The request detector never observed the question in the Ask Dev body it is known to travel in — the absence assertions below would be vacuous.",
        ).toBe(true);
        expect(leaks, "Question text escaped into a URL or an unrelated request.").toEqual([]);
        expect(containsQuestion(page.url()), "The question reached the address bar.").toBe(false);

        // Browser history, not just the current address bar: a pushState
        // that embedded the question would still be readable by anything
        // that reads location, and would survive a back navigation.
        const historyCandidates = await page.evaluate(() => [
            JSON.stringify(window.history.state ?? null),
            document.location.href,
        ]);
        for (const candidate of historyCandidates) {
            expect(
                containsQuestion(candidate),
                "Question text was written into history state or the location.",
            ).toBe(false);
        }
    });
});

// CHAOS-3219 W9. Group 2 requires app-shell entry on ordinary routes and an
// explicit exclusion on the platform-admin validation surface (group 6 keeps
// that surface separate from Ask Dev entirely). Neither half was asserted —
// no spec even checked that the launcher renders on an ordinary page.
test.describe("Ask Dev — route exclusions", () => {
    test("the launcher renders on an ordinary authenticated route", async ({ page }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await expect(askDevLauncher(page)).toBeVisible();
    });

    test("the ordinary window never renders on /superadmin/context-fabric/validation", async ({
        page,
    }) => {
        // Proven against the same session that just saw the launcher, so a
        // failure here is the route exclusion and not a lost session or a
        // capability gate (which would hide the launcher everywhere and make
        // this assertion pass for the wrong reason).
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await expect(askDevLauncher(page)).toBeVisible();

        await page.goto("/superadmin/context-fabric/validation", {
            waitUntil: "domcontentloaded",
        });
        // Prove we actually LANDED on the validation surface before asserting
        // absence. A redirect to the dashboard, an auth failure, or a route
        // error would satisfy all three negative assertions below without the
        // exclusion existing at all (codex adversarial review, MEDIUM).
        await expect(page).toHaveURL(/\/superadmin\/context-fabric\/validation(?:[?#]|$)/u);
        await expect(page.getByRole("heading", { name: /context fabric/iu }).first()).toBeVisible();

        await expect(askDevLauncher(page)).not.toBeVisible();
        await expect(page.getByRole("dialog", { name: "Ask Dev" })).not.toBeVisible();
        await expect(askDevComposer(page)).not.toBeVisible();
    });
});

// CHAOS-3219 W11. Citation ordinals and per-answer detail anchors had
// unit-tier coverage only. The one spec that exercised them on a rendered
// surface (tests/live/ask-dev-acceptance.spec.ts) runs in no workflow, which
// is how CHAOS-3435's positional assumption survived on main for a wave.
test.describe("Ask Dev — citation anchors", () => {
    test("a claim citation opens the detail panel scoped to its own answer id", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(page, scenarioQuestion("complete", "What completed?"));

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();

        // The anchor id is derived from the answer's own id, never from the
        // citation ordinal alone (CHAOS-3215 M6): position-only ids collide
        // across every answer in a transcript.
        const answerId = await answer.getAttribute("id");
        expect(answerId, "The answer article must carry its answer-scoped id.").toMatch(
            /^ask-dev-answer-/u,
        );
        const scopeSuffix = answerId!.replace(/^ask-dev-answer-/u, "");

        await answer.getByRole("button", { name: "Open evidence citation 1 for claim" }).click();
        await expect(page.locator(`[id="ask-dev-evidence-${scopeSuffix}-1"]`)).toBeVisible();

        await answer.getByRole("button", { name: "Open metric citation 1 for claim" }).click();
        await expect(
            page.locator(`[id="ask-dev-metric-${scopeSuffix}-1"] details`),
        ).toHaveAttribute("open", "");

        // The pre-CHAOS-3215 unscoped ids must not exist at all — a renderer
        // that emitted both would satisfy every assertion above.
        await expect(page.locator('[id="ask-dev-evidence-1"]')).toHaveCount(0);
        await expect(page.locator('[id="ask-dev-metric-1"]')).toHaveCount(0);
    });
});

// CHAOS-3219 W12. Two customer-visible defect classes whose regression cover
// was unit-tier only, both about the UI refusing to present a payload that
// contradicts itself.
test.describe("Ask Dev — self-contradiction presentation", () => {
    test("a no-match answer is presented as a no-match, never as a refusal (CHAOS-3367)", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("forbidden_or_not_found_scope", "How is project Zed doing?"),
        );

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();
        await expect(answer.getByText("No match found", { exact: true })).toBeVisible();
        // §12 prohibits labelling a no-match as a refusal, and "Exact match"
        // beside a not-found statement is the contradiction the client-side
        // guard exists to catch.
        await expect(answer.getByText("Refused", { exact: true })).not.toBeVisible();
        await expect(answer.getByText("Exact match", { exact: true })).not.toBeVisible();
        // No source plan ran for a subject that was never resolved, so the
        // coverage block must be suppressed rather than reporting zeros.
        await expect(answer.getByLabel("Evidence coverage")).toHaveCount(0);
    });

    test("a refused answer carrying material grounding withholds its narrative (CHAOS-3377)", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(
            page,
            scenarioQuestion("refused_with_grounding", "How is delivery trending?"),
        );

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();
        await expect(answer.getByText("Inconsistent result", { exact: true })).toBeVisible();
        // Relabelling this "Answered" while still showing the rejected prose
        // would invent an answer the server never produced.
        await expect(answer.getByText("Answered", { exact: true })).not.toBeVisible();
        await expect(answer).toContainText("This part of the answer could not be shown.");
        await expect(answer).not.toContainText("Delivery improved by twelve items this period.");
        // Structured grounding is unaffected by the withholding. CHAOS-3524:
        // evidence is now a folded-by-default accordion (chris's evidence-
        // layout ruling) — "Unfold all evidence" opens the lane and every
        // row in one click so the underlying "Open evidence" action is
        // reachable to assert on.
        await answer.getByRole("button", { name: "Unfold all evidence" }).click();
        await expect(
            answer.getByRole("button", { name: "Open evidence", exact: true }),
        ).toBeVisible();
    });
});

// CHAOS-3219 W14 (scope half). Four of the seven pinned
// ScopeResolutionOutcome values were "documented excluded" from any rendered
// assertion — a recorded gap, not coverage.
test.describe("Ask Dev — scope outcome vocabulary on screen", () => {
    const SCOPE_OUTCOMES = [
        { scenario: "scope_unresolved", raw: "unresolved", label: "Unresolved" },
        {
            scenario: "scope_organization_fallback",
            raw: "organization_fallback",
            label: "Organization-wide",
        },
        { scenario: "scope_filtered", raw: "filtered", label: "Filtered" },
        { scenario: "scope_inherited", raw: "inherited", label: "Inherited" },
    ] as const;

    for (const outcome of SCOPE_OUTCOMES) {
        test(`${outcome.raw}: renders its sanctioned label and never the raw enum`, async ({
            page,
        }) => {
            await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
            await openAskDevWindow(page);
            await submitAskDevQuestion(
                page,
                scenarioQuestion(outcome.scenario, "What is the current status?"),
            );

            const answer = askDevAnswerArticle(page);
            await expect(answer).toBeVisible();
            const scope = answer.getByLabel("Resolved answer scope");
            await expect(scope).toContainText(outcome.label);
            // An organization-wide resolution must also READ as
            // organization-wide. The secondary line is where a widening that
            // kept repository-scoped authorization data would surface as
            // "1 authorized repositories" beside an Organization-wide
            // outcome (codex adversarial review round 3).
            if (outcome.raw === "organization_fallback") {
                await expect(scope).toContainText("Organization");
                await expect(scope).not.toContainText("authorized repositories");
            }
            const scopeText = await scope.innerText();
            expect(scopeText, `The raw ${outcome.raw} outcome reached the screen.`).not.toMatch(
                new RegExp(`\\b${outcome.raw}\\b`, "u"),
            );
            expect(scopeText).not.toMatch(
                new RegExp(`\\b${outcome.raw.replaceAll("_", " ")}\\b`, "u"),
            );
        });
    }
});

// CHAOS-3219 W13. The existing hierarchy test compares exactly two things —
// the direct summary and the coverage block. TRD §16 fixes the whole reading
// order, and no default-tier payload had ever carried every section at once,
// so the order of the remaining six was asserted nowhere.
test.describe("Ask Dev — ordered answer sections", () => {
    test("every section renders in the contract's reading order", async ({ page }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await openAskDevWindow(page);
        await submitAskDevQuestion(page, scenarioQuestion("full_sections", "What is the status?"));

        const answer = askDevAnswerArticle(page);
        await expect(answer).toBeVisible();

        const EXPECTED_ORDER = [
            "Resolved answer scope",
            "Evidence coverage",
            "What the evidence suggests",
            "Conflicting evidence",
            "Metrics",
            "Evidence",
            "Answer limitations",
            "Suggested follow-up questions",
        ];

        // Read the accessible names of the answer's sections in DOM order.
        // Every expected section must be present AND in this relative order:
        // asserting presence alone would pass with the evidence block above
        // the answer, which is the hierarchy defect CHAOS-3291 fixed.
        const rendered = await answer.evaluate((node) =>
            [...node.querySelectorAll("section")].map((section) => {
                const label = section.getAttribute("aria-label");
                if (label) return label;
                const labelledBy = section.getAttribute("aria-labelledby");
                const heading = labelledBy ? document.getElementById(labelledBy) : null;
                return heading?.textContent?.trim() ?? "";
            }),
        );

        for (const expected of EXPECTED_ORDER) {
            expect(rendered, `The "${expected}" section did not render.`).toContain(expected);
        }
        const positions = EXPECTED_ORDER.map((name) => rendered.indexOf(name));
        expect(
            positions,
            `Sections rendered out of contract order: ${rendered.join(" -> ")}`,
        ).toEqual([...positions].sort((a, b) => a - b));
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

        // Located by text content, not a CSS class: CHAOS-3291 (#832)
        // reworked the direct-summary markup/styling as part of this exact
        // "answer-first hierarchy" fix, and a class-name-coupled selector
        // broke on that real change. Only the evidence section's aria-label
        // is a stable-by-contract selector.
        const order = await answer.evaluate((node, directSummaryText) => {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            let direct: Node | null = null;
            for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
                if (textNode.textContent?.includes(directSummaryText)) {
                    direct = textNode;
                    break;
                }
            }
            const evidenceSection = node.querySelector('[aria-label="Evidence coverage"]');
            if (!direct || !evidenceSection) return "missing";
            return direct.compareDocumentPosition(evidenceSection) &
                Node.DOCUMENT_POSITION_FOLLOWING
                ? "direct-first"
                : "evidence-first";
        }, outcomeCase("complete").directSummary);
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

        // CHAOS-3524: evidence is a folded-by-default accordion now — open
        // it before the "Open evidence" fetch action inside it is reachable.
        await page.getByRole("button", { name: "Unfold all evidence" }).click();
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
