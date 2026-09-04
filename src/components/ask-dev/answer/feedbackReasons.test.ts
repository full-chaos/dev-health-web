/**
 * The feedback vocabulary against the pinned contract.
 *
 * `FEEDBACK_REASON_LABELS` and `FEEDBACK_REASON_POLARITY` are TOTAL `Record`s
 * over a union derived from the generated types, so a re-pin that adds a reason
 * already fails to compile until both are extended. TypeScript is not the whole
 * guard though: totality is only as good as the union, and the union is only as
 * good as the generated file. This reads the pinned JSON Schema itself — the
 * artifact the generator consumed — so a generator that dropped a member, or a
 * generated file edited by hand, is caught rather than believed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    FEEDBACK_REASON_LABELS,
    FEEDBACK_REASON_POLARITY,
    NEGATIVE_FEEDBACK_REASONS,
    POSITIVE_FEEDBACK_REASON,
    UNKNOWN_FEEDBACK_REASON_LABEL,
    feedbackReasonLabel,
} from "./feedbackReasons";

const SCHEMA_PATH = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "lib",
    "dev",
    "contracts",
    "schemas",
    "dev_feedback.v1.schema.json",
);

function pinnedReasonEnum(): readonly string[] {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as {
        properties?: { reasons?: { items?: { enum?: unknown } } };
    };
    const members = schema.properties?.reasons?.items?.enum;
    if (!Array.isArray(members) || members.length === 0) {
        throw new Error("dev_feedback.v1 reasons enum missing — schema shape changed.");
    }
    return members as readonly string[];
}

describe("feedback reason vocabulary vs. the pinned dev_feedback.v1 schema", () => {
    it("labels cover exactly the pinned reason enum", () => {
        expect(Object.keys(FEEDBACK_REASON_LABELS).slice().sort()).toEqual(
            pinnedReasonEnum().slice().sort(),
        );
    });

    it("polarity covers exactly the pinned reason enum", () => {
        expect(Object.keys(FEEDBACK_REASON_POLARITY).slice().sort()).toEqual(
            pinnedReasonEnum().slice().sort(),
        );
    });

    it("no reason is left unlabelled or labelled with its raw member name", () => {
        for (const [reason, label] of Object.entries(FEEDBACK_REASON_LABELS)) {
            expect(label.length, `${reason} has no copy`).toBeGreaterThan(0);
            // A raw member would leak an internal token: every member is
            // underscore-or-lowercase machine vocabulary, never sanctioned copy.
            expect(label, `${reason} renders its raw member name`).not.toBe(reason);
        }
    });

    it("offers every negative reason as a chip and no positive or neutral one", () => {
        const expectedNegative = Object.keys(FEEDBACK_REASON_POLARITY).filter(
            (reason) =>
                FEEDBACK_REASON_POLARITY[reason as keyof typeof FEEDBACK_REASON_POLARITY] ===
                "negative",
        );
        expect(NEGATIVE_FEEDBACK_REASONS.slice().sort()).toEqual(expectedNegative.slice().sort());
        for (const reason of NEGATIVE_FEEDBACK_REASONS) {
            expect(FEEDBACK_REASON_POLARITY[reason]).toBe("negative");
        }
    });

    it("the one auto-supplied reason is positive, and is never offered as a negative chip", () => {
        // The positive path records POSITIVE_FEEDBACK_REASON without the reader
        // choosing it. That is only defensible while the member genuinely means
        // "this was useful" -- if it were ever reclassified, the one-click
        // positive submit would start asserting something unchosen AND untrue.
        expect(FEEDBACK_REASON_POLARITY[POSITIVE_FEEDBACK_REASON]).toBe("positive");
        expect(NEGATIVE_FEEDBACK_REASONS).not.toContain(POSITIVE_FEEDBACK_REASON);
    });
});

describe("a reason value this build does not recognise", () => {
    it("resolves to sanctioned copy, never to the raw member", () => {
        // `wrong_cohort` WAS this test's example of a real member arriving in a
        // later contract revision -- and the re-pin that declared it (alongside
        // five siblings) promptly falsified that premise, the same way
        // `record_locator` did for the forward-compatibility tests in
        // contractTolerance.test.ts. A name the contract may adopt is a test
        // with a built-in expiry, so this uses a reserved sentinel instead: one
        // no dev_feedback revision will ever declare, so the assertion stays
        // true across every future re-pin. The tolerance layer accepts an
        // undeclared member rather than failing the submission; this is the
        // other half of that promise -- it must not reach a reader as a machine
        // token.
        const undeclaredReason = "__unpinned_test_reason_sentinel";
        expect(feedbackReasonLabel(undeclaredReason)).toBe(UNKNOWN_FEEDBACK_REASON_LABEL);
        expect(feedbackReasonLabel(undeclaredReason)).not.toBe(undeclaredReason);
        expect(feedbackReasonLabel(undeclaredReason)).not.toContain("_");
    });

    it("never resolves to undefined, which React would render as nothing", () => {
        // Silently dropping a reason is worse than naming it vaguely: the reader
        // sees a shorter list and no indication anything was omitted.
        for (const value of ["", "unspecified", "totally_made_up", "USEFUL"]) {
            expect(typeof feedbackReasonLabel(value)).toBe("string");
            expect(feedbackReasonLabel(value).length).toBeGreaterThan(0);
        }
    });

    it("still returns the sanctioned copy for every recognised member", () => {
        for (const [reason, label] of Object.entries(FEEDBACK_REASON_LABELS)) {
            expect(feedbackReasonLabel(reason)).toBe(label);
        }
    });

    it("the fallback copy is itself free of internal-token shape", () => {
        expect(UNKNOWN_FEEDBACK_REASON_LABEL).not.toContain("_");
        expect(UNKNOWN_FEEDBACK_REASON_LABEL).toMatch(/^[A-Z]/u);
    });
});
