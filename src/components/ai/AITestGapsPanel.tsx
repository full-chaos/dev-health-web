"use client";

import { ErrorCard } from "@/components/ui/ErrorCard";
import type { AIFilter } from "@/lib/filters/ai";
import type { AiRiskBreakdownRow } from "@/lib/graphql/__generated__/types";
import { findBucketRow, useAIRiskBreakdown } from "@/lib/graphql/hooks/useAIReviewRisk";
import { AIComparisonMetricCard } from "./AIComparisonMetricCard";
import { AIMissingDataPanel } from "./AIMissingDataPanel";

type AITestGapsPanelProps = {
    filter: AIFilter;
};

/**
 * Governance Risk → Test Gaps tab (CHAOS-2197). Focused view of AI-attributed
 * work that appears to land without matching test coverage signals, with the
 * human baseline alongside for context. Reuses the risk-breakdown query the
 * Overview tab already loads, so the two tabs can never disagree.
 *
 * Aggregate-only by design: no per-PR drilldown is offered here because the
 * schema does not yet expose the concrete gap-PR population — the generic
 * AI-attributed PR explorer would be a different (wider) population and
 * presenting it as "PRs with test gaps" would be dishonest.
 */
export function AITestGapsPanel({ filter }: AITestGapsPanelProps) {
    const risk = useAIRiskBreakdown(filter);

    const riskData = risk.data?.aiRiskBreakdown;
    const comparison = risk.data?.aiComparison;
    const aiBucket = findBucketRow<AiRiskBreakdownRow>(riskData?.byBucket);

    if (risk.error) {
        return <ErrorCard title="Failed to load AI test gaps" message={risk.error.message} />;
    }

    if (!risk.fetching && riskData && !riskData.dataAvailable) {
        return (
            <AIMissingDataPanel
                title="AI test-gap data is not available"
                reason="The backend returned data_available=false for the selected scope. Missing test-gap data is shown explicitly."
                needed="AI attribution joined to test-coverage rollups."
            />
        );
    }

    return (
        <div className="flex flex-col gap-6" data-testid="ai-test-gaps-panel">
            <div className="grid gap-4 lg:grid-cols-3">
                <AIComparisonMetricCard
                    title="Test gap rate"
                    value={aiBucket?.testGapRate}
                    unit="%"
                    delta={comparison?.delta.testGapRateDelta ?? undefined}
                    description="AI-attributed PRs that appear to land without matching test coverage signals."
                    loading={risk.fetching}
                />
                <section
                    className="rounded-3xl border border-(--card-stroke) bg-card p-5"
                    data-testid="ai-test-gap-baseline"
                >
                    <h3 className="font-(--font-display) text-lg">Baseline test gap rate</h3>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        The same signal for non-AI-attributed work in the selected range, for honest
                        side-by-side context.
                    </p>
                    <p className="mt-6 text-3xl font-semibold tabular-nums">
                        {risk.fetching
                            ? "—"
                            : comparison?.baselineSide?.testGapRate == null
                              ? "—"
                              : `${(comparison.baselineSide.testGapRate * 100).toFixed(2)} %`}
                    </p>
                </section>
                <section
                    className="rounded-3xl border border-(--card-stroke) bg-card p-5"
                    data-testid="ai-test-gap-prs"
                >
                    <h3 className="font-(--font-display) text-lg">PRs with test gaps</h3>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        AI-attributed pull requests counted toward the gap rate, out of{" "}
                        {risk.fetching ? "—" : (aiBucket?.prsTotal ?? 0)} AI-attributed PRs in
                        range.
                    </p>
                    <p className="mt-6 text-3xl font-semibold tabular-nums">
                        {risk.fetching ? "—" : (aiBucket?.testGapPrs ?? 0)}
                    </p>
                </section>
            </div>

            <p className="text-sm text-(--ink-muted)" data-testid="ai-test-gap-evidence-note">
                Per-PR test-gap evidence is not available yet — these counts are aggregate-only
                until the underlying signal links individual pull requests.
            </p>
        </div>
    );
}
