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
import type { AIBucket, AIFilter } from "@/lib/filters/ai";

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

export function findBucketRow<T extends { bucket: string }>(rows: T[] | undefined, bucket: AIBucket | string = "AI_ASSISTED"): T | undefined {
  return rows?.find((row) => row.bucket === bucket) ?? rows?.find((row) => row.bucket !== "HUMAN");
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
