"use client";

import Link from "next/link";

import { DonutChart } from "@/components/charts/DonutChart";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { useAIComparison, useAIImpactSummary } from "@/lib/graphql/hooks/useAIImpact";
import type { AIFilter } from "@/lib/filters/ai";
import { AIComparisonCard } from "./AIComparisonCard";
import { AIEmptyState } from "./AIEmptyState";
import { AILeverageBars } from "./AILeverageBars";
import { AIPanelCard } from "./AIPanelCard";
import {
  agentCreatedTrend,
  assistedWorkShareRows,
  bucketLabel,
  formatPercent,
  safeRatio,
} from "./utils";

type AIImpactDashboardProps = {
  filter: AIFilter;
};

export function AIImpactDashboard({ filter }: AIImpactDashboardProps) {
  const summaryResult = useAIImpactSummary(filter);
  const comparisonResult = useAIComparison(filter);
  const fetching = summaryResult.fetching || comparisonResult.fetching;
  const summary = summaryResult.data?.aiImpactSummary;
  const comparison = comparisonResult.data?.aiComparison;
  // Drill-into-evidence is intentionally not wired yet: the PR-row picker
  // and `/ai/impact/PR/summary` route haven't shipped. Panels render
  // without an evidence link rather than pointing at a 404. (CHAOS-1715)

  if (summaryResult.error || comparisonResult.error) {
    return (
      <ErrorCard
        title="AI impact data could not load"
        message={
          (summaryResult.error || comparisonResult.error)?.message ?? "Please retry the request."
        }
      />
    );
  }

  if (fetching && !summary && !comparison) {
    return <DashboardSkeleton />;
  }

  if (summary && !summary.dataAvailable) {
    return (
      <AIEmptyState title="AI workflow data has not populated yet">
        Connect a GitHub provider to populate AI-assisted PR attribution, review signals, test gaps,
        and incident linkage.
      </AIEmptyState>
    );
  }

  const bucketRows = summary?.byBucket ?? [];
  const agentBucket = bucketRows.find((row) => row.bucket === "AGENT_CREATED");
  const leverage =
    bucketRows.find((row) => row.bucket === "AI_ASSISTED")?.leverage ?? bucketRows[0]?.leverage;
  const donutRows = assistedWorkShareRows(bucketRows);
  const trend = agentCreatedTrend(summary?.daily ?? []);

  return (
    <div className="flex flex-col gap-6" data-testid="ai-impact-dashboard">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            AI-assisted work share
          </p>
          <p className="mt-2 text-4xl font-semibold tabular-nums">
            {formatPercent(summary?.aiAssistedPrRatio)}
          </p>
          <p className="mt-2 text-sm text-(--ink-muted)">
            {summary?.aiAssistedPrs ?? 0} of {summary?.totalPrs ?? 0} PRs lean AI-assisted.
          </p>
        </div>
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            Agent-created work share
          </p>
          <p className="mt-2 text-4xl font-semibold tabular-nums">
            {summary?.agentCreatedPrs ?? 0}
          </p>
          <p className="mt-2 text-sm text-(--ink-muted)">
            {formatPercent(safeRatio(summary?.agentCreatedPrs, summary?.totalPrs))} of PRs appear
            agent-created.
          </p>
        </div>
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            Unknown attribution
          </p>
          <p className="mt-2 text-4xl font-semibold tabular-nums">{summary?.unknownPrs ?? 0}</p>
          <p className="mt-2 text-sm text-(--ink-muted)">
            Kept visible so data coverage gaps stay inspectable.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AIPanelCard
          title="AI-assisted work share"
          description="PR attribution mix across human, assisted, review, agent, and unknown buckets."
        >
          {donutRows.length ? (
            <DonutChart data={donutRows} height={260} />
          ) : (
            <AIEmptyState title="Attribution mix has no rows yet" />
          )}
        </AIPanelCard>

        <AIPanelCard
          title="Agent-created work share"
          description="Absolute agent-created PR count with a scoped trend."
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-semibold tabular-nums">
                {agentBucket?.agentCreatedPrCount ?? summary?.agentCreatedPrs ?? 0}
              </p>
              <p className="text-sm text-(--ink-muted)">agent-created PRs</p>
            </div>
            <p className="text-sm text-(--ink-muted)">{bucketLabel("AGENT_CREATED")}</p>
          </div>
          {trend.length ? (
            <TimeseriesChart data={trend} height={180} />
          ) : (
            <AIEmptyState title="Agent-created trend has no rows yet" />
          )}
        </AIPanelCard>

        <AIPanelCard
          title="Net delivery lift"
          description="AI Operating Leverage broken into signed delivery and drag components."
        >
          <AILeverageBars components={leverage} />
        </AIPanelCard>

        <AIPanelCard
          title="Review amplification"
          description="Reviews per PR on the AI side compared with the non-AI baseline."
        >
          <AIComparisonCard
            label="Reviews per PR"
            aiSide={comparison?.aiSide}
            baselineSide={comparison?.baselineSide}
            delta={comparison?.delta.reviewsPerPrDelta}
            metric="reviewsPerPr"
            percent={false}
          />
        </AIPanelCard>

        <AIPanelCard
          title="Rework drag"
          description="Rework rate suggests where assisted flow may add iteration load."
        >
          <AIComparisonCard
            label="Rework rate"
            aiSide={comparison?.aiSide}
            baselineSide={comparison?.baselineSide}
            delta={comparison?.delta.reworkRateDelta}
            metric="reworkRate"
          />
        </AIPanelCard>

        <AIPanelCard
          title="Test gap rate"
          description="Test gaps show where confidence may lag behind generated or assisted change."
        >
          <AIComparisonCard
            label="Test gap rate"
            aiSide={comparison?.aiSide}
            baselineSide={comparison?.baselineSide}
            delta={comparison?.delta.testGapRateDelta}
            metric="testGapRate"
          />
        </AIPanelCard>

        <AIPanelCard
          title="Revert + incident drag"
          description="Operational drag indicators compared with the baseline side."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <AIComparisonCard
              label="Revert rate"
              aiSide={comparison?.aiSide}
              baselineSide={comparison?.baselineSide}
              delta={comparison?.delta.revertRateDelta}
              metric="revertRate"
            />
            <AIComparisonCard
              label="Incident rate"
              aiSide={comparison?.aiSide}
              baselineSide={comparison?.baselineSide}
              delta={comparison?.delta.incidentRateDelta}
              metric="incidentRate"
            />
          </div>
        </AIPanelCard>

        <AIPanelCard
          title="Top affected repos and teams"
          description="Scoped rollups will appear after repo/team AI summary coverage lands."
        >
          <AIEmptyState title="Coming after detector lands">
            Org-scoped AI impact data populates now. Repo and team ranking placeholders remain empty
            to avoid fabricating scoped values.
          </AIEmptyState>
        </AIPanelCard>

        <AIPanelCard
          title="Best-fit automation opportunities"
          description="Candidate patterns for responsible automation now have a dedicated workflow."
        >
          <div className="flex flex-col gap-3 text-sm text-(--ink-muted)">
            <p>
              Automation candidates moved out of the Impact dashboard so leverage diagnostics and
              candidate triage can evolve independently.
            </p>
            <Link
              className="font-medium text-accent underline-offset-4 hover:underline"
              href="/ai/automations"
            >
              See AI Automations →
            </Link>
          </div>
        </AIPanelCard>
      </div>

      <p className="text-xs text-(--ink-muted)">
        Last computed {summary?.computedAt ?? "not yet available"}. Copy uses system-health
        language: values suggest patterns and should be interpreted with local context.
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3" data-testid="ai-impact-loading">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-40 animate-pulse rounded-3xl bg-(--card-80)" />
      ))}
    </div>
  );
}
