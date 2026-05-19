"use client";

import { useState } from "react";

import { ErrorCard } from "@/components/ui/ErrorCard";
import type { AIFilter } from "@/lib/filters/ai";
import type { AiReviewLoadRow } from "@/lib/graphql/__generated__/types";
import { approvalFriction, findBucketRow, useAIReviewLoad, valueDelta } from "@/lib/graphql/hooks/useAIReviewRisk";
import { AIComparisonMetricCard } from "./AIComparisonMetricCard";
import { AIMissingDataPanel } from "./AIMissingDataPanel";
import { AIReviewAmplificationTrend } from "./AIReviewAmplificationTrend";

type AIReviewLoadDashboardProps = {
  filter: AIFilter;
};

export function AIReviewLoadDashboard({ filter }: AIReviewLoadDashboardProps) {
  const { data, fetching, error } = useAIReviewLoad(filter);
  const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);

  const reviewLoad = data?.aiReviewLoad;
  const comparison = data?.aiComparison;
  const aiBucket = findBucketRow<AiReviewLoadRow>(reviewLoad?.byBucket);
  const humanBucket = findBucketRow<AiReviewLoadRow>(reviewLoad?.byBucket, "HUMAN");
  const aiFriction = approvalFriction(aiBucket);
  const humanFriction = approvalFriction(humanBucket);

  if (error) {
    return <ErrorCard title="Failed to load AI review load" message={error.message} />;
  }

  if (!fetching && reviewLoad && !reviewLoad.dataAvailable) {
    return (
      <AIMissingDataPanel
        title="AI review load data is not available"
        reason="The backend returned data_available=false for the selected scope. This view keeps the gap explicit instead of fabricating values."
        needed="AI attribution plus review event rollups in ClickHouse."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="ai-review-load-dashboard">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <AIComparisonMetricCard
          title="Pickup latency"
          value={comparison?.aiSide.cycleTimeAvgHours}
          unit="h"
          delta={comparison?.delta.cycleTimeDeltaHours ?? undefined}
          description="Uses AI-side average cycle time as the current pickup-latency proxy."
          loading={fetching}
          onDrilldown={() => setDrilldownMetric("Pickup latency")}
        />
        <AIComparisonMetricCard
          title="Review comments per PR"
          value={aiBucket?.reviewsPerPr}
          delta={comparison?.delta.reviewsPerPrDelta ?? undefined}
          description="Closest available proxy for review comments per LOC until comment/LOC exposure ships."
          loading={fetching}
          onDrilldown={() => setDrilldownMetric("Review comments per PR")}
        />
        <AIComparisonMetricCard
          title="Change request rate"
          value={aiBucket?.changesRequestedPerPr}
          delta={valueDelta(aiBucket?.changesRequestedPerPr, humanBucket?.changesRequestedPerPr)}
          description="Average change requests per PR for AI-attributed work."
          loading={fetching}
          onDrilldown={() => setDrilldownMetric("Change request rate")}
        />
        <AIComparisonMetricCard
          title="Approval friction"
          value={aiFriction}
          delta={valueDelta(aiFriction, humanFriction)}
          description="Share of reviews that resulted in requested changes."
          loading={fetching}
          tooltip="Derived as changesRequestedPerPr / reviewsPerPr for each bucket."
          onDrilldown={() => setDrilldownMetric("Approval friction")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AIMissingDataPanel title="Push iterations after first review" reason="Not yet instrumented in the AI review-load schema." needed="Post-first-review push iteration events linked to PR review timestamps." />
        <AIMissingDataPanel title="Reviewer concentration" reason="Reviewer concentration is intentionally unavailable until reviewer aggregation ships without person-level ranking." needed="Aggregated reviewer distribution buckets, not individual leaderboards." />
        <AIComparisonMetricCard
          title="Review amplification"
          value={aiBucket?.reviewAmplification}
          delta={valueDelta(aiBucket?.reviewAmplification, humanBucket?.reviewAmplification)}
          description="Review volume amplification for AI-attributed PRs compared with the human baseline."
          loading={fetching}
          onDrilldown={() => setDrilldownMetric("Review amplification")}
        />
      </div>

      <AIReviewAmplificationTrend daily={reviewLoad?.daily ?? []} loading={fetching} />

      {drilldownMetric && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setDrilldownMetric(null)}>
          <div className="max-w-lg rounded-3xl border border-(--card-stroke) bg-card p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="font-(--font-display) text-xl">{drilldownMetric} evidence</h3>
            <p className="mt-2 text-sm text-(--ink-muted)">
              Drilldown will call aiWorkflowDrilldown once a specific PR is selected. This page avoids fabricating PR-level evidence from aggregate metrics.
            </p>
            <button type="button" className="mt-5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background" onClick={() => setDrilldownMetric(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
