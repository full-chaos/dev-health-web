import { useMemo } from "react";
import { useQuery } from "urql";

import {
  AI_ATTRIBUTED_PRS_QUERY,
  AI_GOVERNANCE_SUMMARY_QUERY,
  AI_REVIEW_LOAD_QUERY,
  AI_RISK_BREAKDOWN_QUERY,
  AI_WORKFLOW_DRILLDOWN_QUERY,
} from "../queries";
import { useOrgId } from "../provider";
import type {
  AiAttributedPrsResult,
  AiComparison,
  AiDateRangeInput,
  AiGovernanceSummary,
  AiReviewLoadResult,
  AiReviewLoadRow,
  AiRiskBreakdownResult,
  AiRiskBreakdownRow,
  AiScopeInput,
  AiWorkflowDrilldownResult,
  AiWorkflowRootTypeInput,
} from "../__generated__/types";
import type { AIFilter } from "@/lib/filters/ai";
import type { AiAttributionBucketInput } from "@/lib/graphql/__generated__/types";

type AIBucket = AiAttributionBucketInput;

type AIInputs = {
  dateRange: AiDateRangeInput;
  scope: AiScopeInput | null;
};

type ReviewLoadData = {
  aiReviewLoad: AiReviewLoadResult;
  aiComparison: AiComparison;
};

type RiskData = {
  aiRiskBreakdown: AiRiskBreakdownResult;
  aiComparison: AiComparison;
};

type GovernanceData = {
  aiGovernanceSummary: AiGovernanceSummary;
};

type AttributedPrsData = {
  aiAttributedPrs: AiAttributedPrsResult;
};

export function toAIQueryInputs(filter: AIFilter): AIInputs {
  const scope = {
    repoId: filter.repoId ?? null,
    teamId: filter.teamId ?? null,
    workType: filter.workType ?? null,
    buckets: filter.buckets ?? null,
  };

  const hasScope = Object.values(scope).some((value) => Array.isArray(value) ? value.length > 0 : value != null);

  return {
    dateRange: { startDate: filter.startDate, endDate: filter.endDate },
    scope: hasScope ? scope : null,
  };
}

/**
 * Strict bucket lookup. Returns `undefined` when the requested bucket is
 * absent so the caller's missing-data branch fires honestly rather than
 * silently substituting an unrelated bucket (e.g. AGENT_CREATED or
 * UNKNOWN) when AI_ASSISTED rows haven't populated yet. The GraphQL input
 * enum is uppercase, while persisted/resolver bucket values are lowercase
 * snake_case, so compare canonicalized keys instead of raw strings.
 */
export function findBucketRow<T extends { bucket: string }>(rows: T[] | undefined, bucket: AIBucket | string = "AI_ASSISTED"): T | undefined {
  const targetBucket = normalizeBucketKey(bucket);
  return rows?.find((row) => normalizeBucketKey(row.bucket) === targetBucket);
}

function normalizeBucketKey(bucket: string): string {
  return bucket.trim().toLowerCase();
}

export function valueDelta(value: number | null | undefined, baseline: number | null | undefined): number | undefined {
  if (value == null || baseline == null) return undefined;
  return value - baseline;
}

export function approvalFriction(row: Pick<AiReviewLoadRow, "changesRequestedPerPr" | "reviewsPerPr"> | undefined): number | undefined {
  if (!row?.reviewsPerPr || row.changesRequestedPerPr == null) return undefined;
  return row.changesRequestedPerPr / row.reviewsPerPr;
}

export function prViolationRows(summary: AiGovernanceSummary | undefined) {
  return (summary?.recentViolations ?? []).filter((violation) => violation.subjectType.toLowerCase() === "pr");
}

export function useAIReviewLoad(filter: AIFilter) {
  const orgId = useOrgId();
  const inputs = useMemo(() => toAIQueryInputs(filter), [filter]);

  const [result] = useQuery<ReviewLoadData>({
    query: AI_REVIEW_LOAD_QUERY,
    variables: { orgId: orgId ?? "", ...inputs },
    pause: !orgId,
    requestPolicy: "cache-and-network",
  });

  return {
    data: result.data,
    fetching: result.fetching,
    error: result.error,
  };
}

export function useAIRiskBreakdown(filter: AIFilter) {
  const orgId = useOrgId();
  const inputs = useMemo(() => toAIQueryInputs(filter), [filter]);

  const [result] = useQuery<RiskData>({
    query: AI_RISK_BREAKDOWN_QUERY,
    variables: { orgId: orgId ?? "", ...inputs },
    pause: !orgId,
    requestPolicy: "cache-and-network",
  });

  return {
    data: result.data,
    fetching: result.fetching,
    error: result.error,
  };
}

export function useAIGovernanceSummary(filter: AIFilter, violationLimit = 50) {
  const orgId = useOrgId();
  const inputs = useMemo(() => toAIQueryInputs(filter), [filter]);

  const [result] = useQuery<GovernanceData>({
    query: AI_GOVERNANCE_SUMMARY_QUERY,
    variables: { orgId: orgId ?? "", ...inputs, violationLimit },
    pause: !orgId,
    requestPolicy: "cache-and-network",
  });

  return {
    data: result.data,
    fetching: result.fetching,
    error: result.error,
  };
}

export function useAIAttributedPrs(filter: AIFilter, limit = 50, offset = 0, pause = false) {
  const orgId = useOrgId();
  const inputs = useMemo(() => toAIQueryInputs(filter), [filter]);

  const [result] = useQuery<AttributedPrsData>({
    query: AI_ATTRIBUTED_PRS_QUERY,
    variables: { orgId: orgId ?? "", ...inputs, limit, offset },
    pause: !orgId || pause,
    requestPolicy: "cache-and-network",
  });

  return {
    data: result.data?.aiAttributedPrs,
    fetching: result.fetching,
    error: result.error,
  };
}

type WorkflowDrilldownData = {
  aiWorkflowDrilldown: AiWorkflowDrilldownResult;
};

function toWorkflowRootType(rootType: string | null): AiWorkflowRootTypeInput | null {
  switch (rootType?.trim().toUpperCase()) {
    case "ISSUE":
      return "ISSUE";
    case "PR":
      return "PR";
    case "WORK_UNIT":
      return "WORK_UNIT";
    default:
      return null;
  }
}

export function useAIWorkflowDrilldown(
  rootType: string | null,
  rootId: string | null,
  options: { depth?: number; limit?: number } = {}
) {
  const orgId = useOrgId();
  const normalizedRootType = toWorkflowRootType(rootType);
  const variables = {
    orgId: orgId ?? "",
    rootType: normalizedRootType ?? "PR",
    rootId: rootId ?? "",
    depth: options.depth ?? 3,
    limit: options.limit ?? 100,
  };

  const [result] = useQuery<WorkflowDrilldownData>({
    query: AI_WORKFLOW_DRILLDOWN_QUERY,
    variables,
    pause: !orgId || !rootId || !normalizedRootType,
    requestPolicy: "cache-and-network",
  });

  return {
    data: result.data?.aiWorkflowDrilldown,
    fetching: result.fetching,
    error: result.error,
  };
}

export function useAIWorkflowDrilldownForPr(
  rootId: string | null,
  options: { depth?: number; limit?: number } = {}
) {
  return useAIWorkflowDrilldown("PR", rootId, options);
}

export type { AiReviewLoadRow, AiRiskBreakdownRow };
