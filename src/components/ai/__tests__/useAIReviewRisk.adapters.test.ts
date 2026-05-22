import { describe, expect, it, vi } from "vitest";

vi.mock("urql", () => ({
  useQuery: () => [{ data: undefined, fetching: false, error: undefined }],
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));

import {
  approvalFriction,
  findBucketRow,
  prViolationRows,
  toAIQueryInputs,
  valueDelta,
} from "@/lib/graphql/hooks/useAIReviewRisk";
import type { AIFilter } from "@/lib/filters/ai";
import type { AiGovernanceSummary } from "@/lib/graphql/__generated__/types";

describe("useAIReviewRisk adapters", () => {
  it("maps AI filters to GraphQL dateRange and nullable scope", () => {
    const filter: AIFilter = {
      startDate: "2026-04-01",
      endDate: "2026-05-01",
      repoId: "repo-1",
      workType: "feature",
      buckets: ["AI_ASSISTED"],
    };
    expect(toAIQueryInputs(filter)).toEqual({
      dateRange: { startDate: filter.startDate, endDate: filter.endDate },
      scope: { repoId: "repo-1", teamId: null, workType: "feature", buckets: ["AI_ASSISTED"] },
    });
  });

  it("returns the requested bucket and undefined when it is absent (no silent fallback)", () => {
    const rows = [
      { bucket: "HUMAN", value: 1 },
      { bucket: "AGENT_CREATED", value: 2 },
    ];
    expect(findBucketRow(rows, "HUMAN")?.value).toBe(1);
    expect(findBucketRow(rows)).toBeUndefined();
    expect(findBucketRow(rows, "AGENT_CREATED")?.value).toBe(2);
  });

  it("derives deltas and approval friction only when inputs exist", () => {
    expect(valueDelta(5, 3)).toBe(2);
    expect(valueDelta(undefined, 3)).toBeUndefined();
    expect(approvalFriction({ changesRequestedPerPr: 1, reviewsPerPr: 4 })).toBe(0.25);
    expect(approvalFriction({ changesRequestedPerPr: 1, reviewsPerPr: 0 })).toBeUndefined();
  });

  it("filters governance violations to PR subjects", () => {
    const summary: AiGovernanceSummary = {
      orgId: "org",
      startDate: "2026-04-01",
      endDate: "2026-05-01",
      dataAvailable: true,
      coverage: [],
      recentViolations: [
        {
          ruleId: "a",
          severity: "high",
          subjectType: "pr",
          subjectId: "1",
          observedAt: "2026-05-01T00:00:00Z",
          evidence: "PR issue",
        },
        {
          ruleId: "b",
          severity: "low",
          subjectType: "workflow",
          subjectId: "2",
          observedAt: "2026-05-01T00:00:00Z",
          evidence: "Workflow issue",
        },
      ],
    };
    expect(prViolationRows(summary)).toHaveLength(1);
  });
});
