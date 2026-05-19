"use client";

import { useState } from "react";

import { ErrorCard } from "@/components/ui/ErrorCard";
import type { AIFilter } from "@/lib/filters/ai";
import type { AiRiskBreakdownRow } from "@/lib/graphql/__generated__/types";
import { findBucketRow, prViolationRows, useAIGovernanceSummary, useAIRiskBreakdown } from "@/lib/graphql/hooks/useAIReviewRisk";
import { AIComparisonMetricCard } from "./AIComparisonMetricCard";
import { AIMissingDataPanel } from "./AIMissingDataPanel";
import { AIViolationsList } from "./AIViolationsList";

type AIRiskDashboardProps = {
  filter: AIFilter;
};

export function AIRiskDashboard({ filter }: AIRiskDashboardProps) {
  const risk = useAIRiskBreakdown(filter);
  const governance = useAIGovernanceSummary(filter, 50);
  const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);

  const riskData = risk.data?.aiRiskBreakdown;
  const comparison = risk.data?.aiComparison;
  const aiBucket = findBucketRow<AiRiskBreakdownRow>(riskData?.byBucket);
  const violations = prViolationRows(governance.data?.aiGovernanceSummary);

  if (risk.error) {
    return <ErrorCard title="Failed to load AI risk" message={risk.error.message} />;
  }

  if (!risk.fetching && riskData && !riskData.dataAvailable) {
    return (
      <AIMissingDataPanel
        title="AI risk data is not available"
        reason="The backend returned data_available=false for the selected scope. Missing risk data is shown explicitly."
        needed="AI attribution joined to rework, revert, test-gap, and incident rollups."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="ai-risk-dashboard">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <AIComparisonMetricCard title="Rework rate" value={aiBucket?.reworkRate} unit="%" delta={comparison?.delta.reworkRateDelta ?? undefined} description="PRs that appear to require rework after AI-attributed changes." loading={risk.fetching} onDrilldown={() => setDrilldownMetric("Rework rate")} />
        <AIComparisonMetricCard title="Revert rate" value={aiBucket?.revertRate} unit="%" delta={comparison?.delta.revertRateDelta ?? undefined} description="AI-attributed PRs associated with reverts in the selected range." loading={risk.fetching} onDrilldown={() => setDrilldownMetric("Revert rate")} />
        <AIComparisonMetricCard title="Test gap rate" value={aiBucket?.testGapRate} unit="%" delta={comparison?.delta.testGapRateDelta ?? undefined} description="AI-attributed PRs that appear to land without matching test coverage signals." loading={risk.fetching} onDrilldown={() => setDrilldownMetric("Test gap rate")} />
        <AIComparisonMetricCard title="Incident rate" value={aiBucket?.incidentRate} unit="%" delta={comparison?.delta.incidentRateDelta ?? undefined} description="AI-attributed PRs associated with incident edges or incident rollups." loading={risk.fetching} onDrilldown={() => setDrilldownMetric("Incident rate")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AIMissingDataPanel title="Hotspot file overlap" reason="Coming when the hotspot detector ships." needed="Hotspot file detector output joined to AI-attributed PR changed files." />
        <AIMissingDataPanel title="High-complexity file overlap" reason="Complexity overlap is not in the current schema." needed="Complexity-indexed file metadata linked to PR file changes." />
        <section className="rounded-3xl border border-(--card-stroke) bg-card p-5" data-testid="ai-linked-incidents">
          <h3 className="font-(--font-display) text-lg">Linked incidents</h3>
          <p className="mt-2 text-sm text-(--ink-muted)">Summary count from AI-attributed PR incident rollups. PR-level edges will use aiWorkflowDrilldown after a PR is selected.</p>
          <p className="mt-6 text-3xl font-semibold tabular-nums">{risk.fetching ? "—" : (aiBucket?.incidentsCount ?? 0)}</p>
        </section>
      </div>

      <AIViolationsList violations={violations} loading={governance.fetching} />

      {governance.error && (
        <p className="rounded-2xl border border-(--accent-negative)/30 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          Governance findings unavailable: {governance.error.message}
        </p>
      )}

      {drilldownMetric && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setDrilldownMetric(null)}>
          <div className="max-w-lg rounded-3xl border border-(--card-stroke) bg-card p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="font-(--font-display) text-xl">{drilldownMetric} evidence</h3>
            <p className="mt-2 text-sm text-(--ink-muted)">
              Drilldown will call aiWorkflowDrilldown(rootType=PR, rootId=…) after a PR row is selected. The aggregate risk card does not invent PR-level edges.
            </p>
            <button type="button" className="mt-5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background" onClick={() => setDrilldownMetric(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
