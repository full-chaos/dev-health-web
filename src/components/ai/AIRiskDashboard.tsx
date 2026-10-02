"use client";

import { useState } from "react";

import { DataState } from "@/components/ui/DataState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import type { AIFilter } from "@/lib/filters/ai";
import { formatPercent } from "@/lib/formatters";
import type { AiMissingState, AiRiskBreakdownRow } from "@/lib/graphql/__generated__/types";
import {
    findBucketRow,
    prViolationRows,
    useAIGovernanceSummary,
    useAIRiskBreakdown,
} from "@/lib/graphql/hooks/useAIReviewRisk";
import { AIComparisonMetricCard } from "./AIComparisonMetricCard";
import { Drawer } from "@/components/ui/Drawer";
import { AIEvidenceExplorer } from "./AIEvidenceExplorer";
import { AIMissingDataPanel } from "./AIMissingDataPanel";
import { AIViolationsList } from "./AIViolationsList";

type AIRiskDashboardProps = {
    filter: AIFilter;
};

function missingState(
    states: AiMissingState[] | undefined,
    key: string,
    fallbackTitle: string,
    fallbackGuidance: string,
) {
    const state = states?.find((item) => item.key === key);
    return {
        title: state?.title ?? fallbackTitle,
        guidance: state?.guidance ?? fallbackGuidance,
    };
}

export function AIRiskDashboard({ filter }: AIRiskDashboardProps) {
    const risk = useAIRiskBreakdown(filter);
    const governance = useAIGovernanceSummary(filter, 50);
    const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);

    const riskData = risk.data?.aiRiskBreakdown;
    const comparison = risk.data?.aiComparison;
    const aiBucket = findBucketRow<AiRiskBreakdownRow>(riskData?.byBucket);
    const violations = prViolationRows(governance.data?.aiGovernanceSummary);

    // Overlap panels resolve in three honest tiers (CHAOS-2185): real rows →
    // data panel (a computed 0 is a REAL zero and renders as 0%); no rows but
    // the backend emitted the matching missing-state → that explicit panel;
    // neither → the canonical not-yet-available DataState. The backend stops
    // emitting these missing-states once real overlap data exists, so the
    // data branch must come first or populated scopes render a silent hole.
    const hotspotRow = findBucketRow(riskData?.hotspotOverlap) ?? riskData?.hotspotOverlap?.[0];
    const complexityRow =
        findBucketRow(riskData?.complexityOverlap) ?? riskData?.complexityOverlap?.[0];
    const hasHotspotMissingState =
        riskData?.missingStates?.some((item) => item.key === "hotspot_overlap") ?? false;
    const hasComplexityMissingState =
        riskData?.missingStates?.some((item) => item.key === "complexity_overlap") ?? false;
    const hotspotMissing = missingState(
        riskData?.missingStates,
        "hotspot_overlap",
        "Hotspot file overlap",
        "Hotspot overlap is not available for the selected scope yet.",
    );
    const complexityMissing = missingState(
        riskData?.missingStates,
        "complexity_overlap",
        "High-complexity file overlap",
        "Complexity overlap is not available for the selected scope yet.",
    );

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
                <AIComparisonMetricCard
                    title="Rework rate"
                    value={aiBucket?.reworkRate}
                    unit="%"
                    delta={comparison?.delta.reworkRateDelta ?? undefined}
                    description="PRs that appear to require rework after AI-attributed changes."
                    loading={risk.fetching}
                    onDrilldown={() => setDrilldownMetric("Rework rate")}
                />
                <AIComparisonMetricCard
                    title="Revert rate"
                    value={aiBucket?.revertRate}
                    unit="%"
                    delta={comparison?.delta.revertRateDelta ?? undefined}
                    description="AI-attributed PRs associated with reverts in the selected range."
                    loading={risk.fetching}
                    onDrilldown={() => setDrilldownMetric("Revert rate")}
                />
                <AIComparisonMetricCard
                    title="Test gap rate"
                    value={aiBucket?.testGapRate}
                    unit="%"
                    delta={comparison?.delta.testGapRateDelta ?? undefined}
                    description="AI-attributed PRs that appear to land without matching test coverage signals."
                    loading={risk.fetching}
                    onDrilldown={() => setDrilldownMetric("Test gap rate")}
                />
                <AIComparisonMetricCard
                    title="Incident rate"
                    value={aiBucket?.incidentRate}
                    unit="%"
                    delta={comparison?.delta.incidentRateDelta ?? undefined}
                    description="AI-attributed PRs associated with incident edges or incident rollups."
                    loading={risk.fetching}
                    onDrilldown={() => setDrilldownMetric("Incident rate")}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                {hotspotRow ? (
                    <section
                        className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-5"
                        data-testid="ai-hotspot-overlap"
                    >
                        <h3 className="text-h3 font-semibold">Hotspot file overlap</h3>
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            Share of AI-attributed PRs that touch top-decile-risk files in the
                            selected window.
                        </p>
                        <p className="mt-6 text-[1.75rem] font-semibold leading-tight tabular-nums">
                            {hotspotRow.hotspotOverlapRate != null
                                ? formatPercent(hotspotRow.hotspotOverlapRate * 100)
                                : "—"}
                        </p>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            {hotspotRow.prsTouchingHotspots} of {hotspotRow.prsTotal} AI-attributed
                            PRs
                            {hotspotRow.avgHotspotRiskScore != null
                                ? ` · avg risk score ${hotspotRow.avgHotspotRiskScore.toFixed(2)}`
                                : ""}
                        </p>
                    </section>
                ) : hasHotspotMissingState ? (
                    <AIMissingDataPanel
                        title={hotspotMissing.title}
                        reason={hotspotMissing.guidance}
                        needed="File hotspot signals for AI-attributed changes."
                    />
                ) : (
                    <DataState
                        variant="detector-unavailable"
                        title="Hotspot file overlap"
                        description="Overlap with top-decile-risk files is not available for this scope yet."
                        data-testid="ai-hotspot-overlap-unavailable"
                    />
                )}
                {complexityRow ? (
                    <section
                        className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-5"
                        data-testid="ai-complexity-overlap"
                    >
                        <h3 className="text-h3 font-semibold">High-complexity file overlap</h3>
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            Share of AI-attributed PRs that touch high-complexity files in the
                            selected window.
                        </p>
                        <p className="mt-6 text-[1.75rem] font-semibold leading-tight tabular-nums">
                            {complexityRow.complexityOverlapRate != null
                                ? formatPercent(complexityRow.complexityOverlapRate * 100)
                                : "—"}
                        </p>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            {complexityRow.prsTouchingHighComplexity} of {complexityRow.prsTotal}{" "}
                            AI-attributed PRs
                        </p>
                    </section>
                ) : hasComplexityMissingState ? (
                    <AIMissingDataPanel
                        title={complexityMissing.title}
                        reason={complexityMissing.guidance}
                        needed="Complexity-indexed file metadata linked to PR file changes."
                    />
                ) : (
                    <DataState
                        variant="detector-unavailable"
                        title="High-complexity file overlap"
                        description="Overlap with high-complexity files is not available for this scope yet."
                        data-testid="ai-complexity-overlap-unavailable"
                    />
                )}
                <section
                    className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-5"
                    data-testid="ai-linked-incidents"
                >
                    <h3 className="text-h3 font-semibold">Linked incidents</h3>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        Summary count from AI-attributed PR incident rollups. Open evidence on any
                        tile to inspect Work Graph edges per PR.
                    </p>
                    <p className="mt-6 text-[1.75rem] font-semibold leading-tight tabular-nums">
                        {risk.fetching ? "—" : (aiBucket?.incidentsCount ?? 0)}
                    </p>
                </section>
            </div>

            <AIViolationsList violations={violations} loading={governance.fetching} />

            {governance.error && (
                <p className="rounded-(--radius-md) border border-(--accent-negative)/30 bg-red-500/5 px-4 py-3 text-sm text-red-600">
                    Governance findings unavailable: {governance.error.message}
                </p>
            )}

            {/* A8: the shared Drawer, as on Review Load. Same PR explorer inside. */}
            <Drawer
                open={drilldownMetric !== null}
                onCloseAction={() => setDrilldownMetric(null)}
                eyebrow={drilldownMetric ?? undefined}
                title="Evidence by pull request"
                size="wide"
                data-testid="ai-drilldown-drawer"
            >
                <p className="text-sm text-(--ink-muted)">
                    Pick an AI-attributed PR to see its Work Graph evidence. Filtered to the current
                    dashboard range, repo, and work type.
                </p>
                <AIEvidenceExplorer filter={filter} />
            </Drawer>
        </div>
    );
}
