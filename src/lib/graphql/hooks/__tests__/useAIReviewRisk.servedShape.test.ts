import { describe, expect, it } from "vitest";

import type { AiGovernanceSummary } from "@/lib/graphql/__generated__/types";

import { prViolationRows } from "../useAIReviewRisk";

const violation = (subjectType: string, subjectId: string) => ({
    ruleId: "human-review-required",
    severity: "high",
    subjectType,
    subjectId,
    observedAt: "2026-05-01T00:00:00Z",
    evidence: "synthetic evidence",
});

const summaryOf = (subjectTypes: string[]): AiGovernanceSummary => ({
    orgId: "org-synthetic",
    startDate: "2026-04-01",
    endDate: "2026-05-01",
    dataAvailable: true,
    coverage: [],
    recentViolations: subjectTypes.map((t, i) => violation(t, String(i + 1))),
});

describe("prViolationRows on the served ops vocabulary", () => {
    it("keeps a violation whose subjectType is the served pull_request", () => {
        expect(prViolationRows(summaryOf(["pull_request"]))).toHaveLength(1);
    });

    it("drops a non-PR subject", () => {
        expect(prViolationRows(summaryOf(["artifact", "workflow"]))).toHaveLength(0);
    });

    it("stays empty for an empty list", () => {
        expect(prViolationRows(summaryOf([]))).toHaveLength(0);
    });
});
