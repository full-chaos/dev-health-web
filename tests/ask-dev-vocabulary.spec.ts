import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
    ANSWER_STATUS_VALUES,
    assertKnownToSchema,
    SCOPE_RESOLUTION_OUTCOME_VALUES,
} from "./fixtures/askDevContracts";
import { ASK_DEV_OUTCOME_TABLE } from "./fixtures/askDevOutcomes";

// CHAOS-3287 (codex NO-SHIP fix #1, finding: "outcome coverage is a
// self-oracle"): tests/fixtures/askDevOutcomes.ts is used to BOTH build the
// mock's canned answer AND assert on the rendered result, so a wrong value
// in that table would silently agree with itself. This file is the
// independent check: it does not read the outcome table's *content* as
// ground truth, only its *shape*, and cross-references that shape against
// the pinned JSON Schema enums (tests/fixtures/askDevContracts.ts, which
// itself extracts those enums from the schema files at runtime rather than
// hand-transcribing them — see that file's header for the drift this
// caught). A schema regeneration that adds, removes, or renames an
// AnswerStatus/ScopeResolutionOutcome member fails this suite immediately.
//
// No page/server interaction here — pure data assertions, safe to run
// standalone.

test.describe("Ask Dev — outcome table vs. pinned contract vocabulary", () => {
    test("every ASK_DEV_OUTCOME_TABLE status is a real, pinned AnswerStatus value", () => {
        assertKnownToSchema(
            ASK_DEV_OUTCOME_TABLE.map((entry) => entry.status),
            ANSWER_STATUS_VALUES,
            "ASK_DEV_OUTCOME_TABLE status values",
        );
    });

    test("the outcome table covers every pinned AnswerStatus except `error` (handled outside AskDevAnswer)", () => {
        // `error` is deliberately excluded: AskDevConversation.tsx routes any
        // transcript entry whose answer.status === "error" through the same
        // failed/alert treatment as a live run failure — it never reaches
        // AskDevAnswer/STATUS_EXPLANATIONS, so it has no "outcome case" of
        // its own to add to this table. If that routing ever changes, this
        // assertion is exactly what should catch the resulting gap.
        const tableStatuses = new Set(ASK_DEV_OUTCOME_TABLE.map((entry) => entry.status));
        const expected = new Set(ANSWER_STATUS_VALUES.filter((value) => value !== "error"));

        const missing = [...expected].filter((value) => !tableStatuses.has(value));
        const unexpected = [...tableStatuses].filter((value) => !expected.has(value));
        expect(
            missing,
            `Pinned AnswerStatus values missing from the outcome table: ${missing.join(", ")}`,
        ).toEqual([]);
        expect(
            unexpected,
            `Outcome table has status values beyond the pinned enum (or wrongly includes "error"): ${unexpected.join(", ")}`,
        ).toEqual([]);
    });

    test("the scope-resolution scenarios (ambiguous, forbidden_or_not_found) are real, pinned outcomes", () => {
        assertKnownToSchema(
            ["ambiguous", "forbidden_or_not_found"],
            SCOPE_RESOLUTION_OUTCOME_VALUES,
            "needs_clarification/forbidden_or_not_found_scope mock scenario outcomes",
        );
    });
});

// CHAOS-3287 (codex NO-SHIP fix #2, finding: "test.fixme never
// self-activates"): a tripwire so CHAOS-3291's two known-leak assertions
// can never quietly regress back to a silently-skipped fixme after being
// converted to active/test.fail() tests.
test.describe("Ask Dev — no lingering CHAOS-3291 fixme", () => {
    test("no ask-dev spec file contains a test.fixme reference to CHAOS-3291", () => {
        const specDir = __dirname;
        // Deliberately excludes this file itself: ask-dev-vocabulary.spec.ts
        // is the checker, not a subject, and its own error message below
        // necessarily contains the literal pattern being searched for.
        const specFiles = [
            "ask-dev-shared.spec.ts",
            "ask-dev-outcomes.spec.ts",
            "ask-dev-continuity.spec.ts",
        ];
        // Matches only the actual invocation (`test.fixme(` / `test.fixme(title, ...)`
        // / the in-body modifier form), not explanatory prose about test.fixme.
        const FIXME_CALL_PATTERN = /\btest\.fixme\s*\(/u;
        for (const fileName of specFiles) {
            const contents = readFileSync(path.join(specDir, fileName), "utf8");
            expect(
                FIXME_CALL_PATTERN.test(contents),
                `${fileName} calls test.fixme() — CHAOS-3291's leak checks must be active tests ` +
                    "(or test.fail() while #832 is unmerged), never silently skipped.",
            ).toBe(false);
        }
    });
});
