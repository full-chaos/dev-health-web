import { describe, expect, it, vi } from "vitest";

vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }],
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));

import { prViolationRows } from "@/lib/graphql/hooks/useAIReviewRisk";
import type { AiGovernanceSummary } from "@/lib/graphql/__generated__/types";

const summaryWith = (subjectTypes: string[]): AiGovernanceSummary =>
    ({
        recentViolations: subjectTypes.map((subjectType, n) => ({
            ruleId: "human-review-required",
            ruleName: "Human review required",
            severity: "high",
            subjectType,
            subjectId: `subject-${String(n)}`,
            observedAt: "2026-05-01T00:00:00Z",
            evidence: "{}",
        })),
    }) as unknown as AiGovernanceSummary;

describe("prViolationRows on the subject type ops serves", () => {
    it("keeps a violation whose subjectType is pull_request (ops governance.go / compute.go)", () => {
        const rows = prViolationRows(summaryWith(["pull_request"]));
        expect(rows).toHaveLength(1);
    });

    it("control: drops a non-PR subject and keeps an empty list empty", () => {
        expect(prViolationRows(summaryWith(["work_item"]))).toHaveLength(0);
        expect(prViolationRows(summaryWith([]))).toHaveLength(0);
    });
});
