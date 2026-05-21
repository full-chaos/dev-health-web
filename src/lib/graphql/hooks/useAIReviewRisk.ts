import { useMemo } from "react";
import { useQuery } from "urql";

import {
  AI_GOVERNANCE_SUMMARY_QUERY,
  AI_REVIEW_LOAD_QUERY,
  AI_RISK_BREAKDOWN_QUERY,
} from "../queries";
import { useOrgId } from "../provider";
import type {
  AiComparison,
  AiDateRangeInput,
  AiGovernanceSummary,
  AiReviewLoadResult,
  AiReviewLoadRow,
  AiRiskBreakdownResult,
  AiRiskBreakdownRow,
  AiScopeInput,
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

export type { AiReviewLoadRow, AiRiskBreakdownRow };
