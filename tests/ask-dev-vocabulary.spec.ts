import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
    ANSWER_STATUS_VALUES,
    assertExhaustivePartition,
    assertKnownToSchema,
    SCOPE_RESOLUTION_OUTCOME_VALUES,
} from "./fixtures/askDevContracts";
import { ASK_DEV_OUTCOME_TABLE } from "./fixtures/askDevOutcomes";

/**
 * Extracts the top-level keys of one exported `Record<Enum, string>` object
 * literal from a TSX source file by name, via text parsing rather than a
 * module import.
 *
 * AskDevAnswer.tsx ("use client") transitively imports AskDevWindow.tsx,
 * which imports a PNG asset (fc-logo.png) — Next/Vite's bundler resolves
 * that fine, but this Playwright spec file is compiled by Playwright's own
 * standalone esbuild transform, which has no asset loader configured and
 * fails on the binary PNG content. Reading the real source text (as this
 * suite's fixme-tripwire test already does) reads the same live production
 * file without pulling its import graph through a transform that can't
 * handle it.
 */
function exportedLabelMapKeys(sourceText: string, exportName: string): readonly string[] {
    const start = sourceText.indexOf(`export const ${exportName}`);
    if (start === -1) throw new Error(`Could not find "export const ${exportName}" in source.`);
    const openBrace = sourceText.indexOf("{", start);
    const closeBrace = sourceText.indexOf("};", openBrace);
    if (openBrace === -1 || closeBrace === -1) {
        throw new Error(`Could not find the object literal body for "${exportName}".`);
    }
    const body = sourceText.slice(openBrace + 1, closeBrace);
    const keyPattern = /^\s*([a-z][a-z0-9_]*)\s*:/gmu;
    const keys: string[] = [];
    for (const match of body.matchAll(keyPattern)) keys.push(match[1]!);
    if (keys.length === 0)
        throw new Error(`Found no keys for "${exportName}" — parsing likely broke.`);
    return keys;
}

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

    // codex NO-SHIP finding (this test's prior form): membership-checking
    // only the 2 values the mock scenarios happen to use let a new
    // ScopeResolutionOutcome member, or a rename of an unreferenced member
    // like `filtered`→`narrowed`, pass silently — no add/remove/rename
    // guarantee actually held. Fixed with an exact partition: every pinned
    // value is either scenario-covered or on this documented exclusion
    // list, and the assertion fails until that partition is deliberately
    // updated to match.
    const SCENARIO_COVERED_SCOPE_OUTCOMES = [
        // Every ASK_DEV_OUTCOME_TABLE scenario (complete/partial/degraded/
        // insufficient_evidence/refused) carries the canonical fixture's own
        // unmodified resolved_scope, whose outcome is "exact".
        "exact",
        // needs_clarification mock scenario.
        "ambiguous",
        // forbidden_or_not_found_scope mock scenario — the exact value
        // CHAOS-3291 fixed the raw-render leak for.
        "forbidden_or_not_found",
    ] as const;
    const DOCUMENTED_EXCLUDED_SCOPE_OUTCOMES = [
        // Not yet exercised by a dedicated mock scenario. Tracked as a
        // coverage gap, not a security gap: neither is on the internal-enum
        // denylist (only forbidden_or_not_found and scope_forbidden are),
        // and both are otherwise-ordinary successful-resolution variants.
        "filtered",
        "inherited",
        "organization_fallback",
        // Not yet exercised; also not customer-sensitive in the same way
        // forbidden_or_not_found is (it doesn't collapse a
        // permission/existence distinction), just currently untested.
        "unresolved",
    ] as const;

    test("production sanctioned SCOPE_OUTCOME_LABELS keys exactly match the pinned ScopeResolutionOutcome enum", () => {
        // Cross-checks the independently pinned-schema-derived vocabulary
        // (askDevContracts.ts) against AskDevAnswer.tsx's own exported,
        // TypeScript-exhaustive `Record<DevAnswer["resolved_scope"]["outcome"], string>`
        // — a second, independent source of the same "what are all the real
        // values" question. A read of the real component's source text, not
        // an edit of it (see exportedLabelMapKeys's doc comment for why this
        // is a text read rather than a module import).
        const source = readFileSync(
            path.join(__dirname, "..", "src", "components", "ask-dev", "AskDevAnswer.tsx"),
            "utf8",
        );
        const labelKeys = exportedLabelMapKeys(source, "SCOPE_OUTCOME_LABELS");
        expect(labelKeys.slice().sort()).toEqual([...SCOPE_RESOLUTION_OUTCOME_VALUES].sort());
    });

    test("every pinned ScopeResolutionOutcome is exactly scenario-covered or documented-excluded", () => {
        assertExhaustivePartition(
            SCOPE_RESOLUTION_OUTCOME_VALUES,
            SCENARIO_COVERED_SCOPE_OUTCOMES,
            DOCUMENTED_EXCLUDED_SCOPE_OUTCOMES,
            "ScopeResolutionOutcome",
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
