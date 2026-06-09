"use client";

import Link from "next/link";

import { DonutChart } from "@/components/charts/DonutChart";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { DataState } from "@/components/ui/DataState";
import { useAIComparison, useAIImpactSummary } from "@/lib/graphql/hooks/useAIImpact";
import type { AIFilter } from "@/lib/filters/ai";
import { bucketEquals } from "@/lib/ai/buckets";
import { CTA_LABELS } from "@/lib/design/cta";
import { AIComparisonCard } from "./AIComparisonCard";
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
    /** Filter-preserving href for the PR-evidence drilldown (CHAOS-2196). */
    evidenceHref?: string;
};

export function AIImpactDashboard({ filter, evidenceHref }: AIImpactDashboardProps) {
    const summaryResult = useAIImpactSummary(filter);
    const comparisonResult = useAIComparison(filter);
    const fetching = summaryResult.fetching || comparisonResult.fetching;
    const summary = summaryResult.data?.aiImpactSummary;
    const comparison = comparisonResult.data?.aiComparison;

    if (summaryResult.error || comparisonResult.error) {
        return (
            <DataState
                variant="error"
                title="AI impact data could not load"
                message={
                    (summaryResult.error || comparisonResult.error)?.message ??
                    "Please retry the request."
                }
            />
        );
    }

    if (fetching && !summary && !comparison) {
        return <DashboardSkeleton />;
    }

    if (summary && !summary.dataAvailable) {
        return (
            <DataState
                variant="no-data-connected"
                title="AI workflow data has not populated yet"
                description="Connect a GitHub provider to populate AI-assisted PR attribution, review signals, test gaps, and incident linkage."
            />
        );
    }

    const bucketRows = summary?.byBucket ?? [];
    const agentBucket = bucketRows.find((row) => bucketEquals(row.bucket, "AGENT_CREATED"));
    const leverage =
        bucketRows.find((row) => bucketEquals(row.bucket, "AI_ASSISTED"))?.leverage ??
        bucketRows[0]?.leverage;
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
                        {summary?.aiAssistedPrs ?? 0} of {summary?.totalPrs ?? 0} PRs lean
                        AI-assisted.
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
                        {formatPercent(safeRatio(summary?.agentCreatedPrs, summary?.totalPrs))} of
                        PRs appear agent-created.
                    </p>
                </div>
                <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                        Unknown attribution
                    </p>
                    <p className="mt-2 text-4xl font-semibold tabular-nums">
                        {summary?.unknownPrs ?? 0}
                    </p>
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
                        <DataState variant="detector-enabled-no-findings" />
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
                        <DataState variant="detector-enabled-no-findings" />
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
                    description="Repos and teams ranked by AI-attributed PR volume in the selected window."
                >
                    {(summary?.repoBreakdown?.length ?? 0) > 0 ||
                    (summary?.teamBreakdown?.length ?? 0) > 0 ? (
                        <div className="flex flex-col gap-4" data-testid="ai-impact-breakdown">
                            <ScopeRollupList label="Repos" rows={summary?.repoBreakdown ?? []} />
                            <ScopeRollupList label="Teams" rows={summary?.teamBreakdown ?? []} />
                            {evidenceHref && (
                                <Link
                                    className="text-sm font-medium text-accent underline-offset-4 hover:underline"
                                    href={evidenceHref}
                                >
                                    {CTA_LABELS.openEvidence} →
                                </Link>
                            )}
                        </div>
                    ) : (
                        <DataState
                            variant="preview-not-populated"
                            title="No scoped rollups in this scope yet"
                            description="Org-wide AI impact is shown above. Repo- and team-level rankings stay empty until there is enough scoped coverage to show them without estimating values."
                        />
                    )}
                </AIPanelCard>

                <AIPanelCard
                    title="Best-fit automation opportunities"
                    description="Candidate patterns for responsible automation now have a dedicated workflow."
                >
                    <div className="flex flex-col gap-3 text-sm text-(--ink-muted)">
                        <p>
                            Automation candidates moved out of the Impact dashboard so leverage
                            diagnostics and candidate triage can evolve independently.
                        </p>
                        <Link
                            className="font-medium text-accent underline-offset-4 hover:underline"
                            href="/ai/automations"
                        >
                            {CTA_LABELS.seeAIAutomations} →
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

type ScopeRollupRow = {
    scopeId: string;
    scopeLabel: string;
    aiPrsTotal: number;
    aiAssistedPrRatio?: number | null;
    reworkRateDelta?: number | null;
};

const ROLLUP_LIMIT = 5;

function ScopeRollupList({ label, rows }: { label: string; rows: ScopeRollupRow[] }) {
    if (rows.length === 0) {
        return (
            <p className="text-sm text-(--ink-muted)">
                {label}: no scoped coverage in this window.
            </p>
        );
    }
    return (
        <div>
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">{label}</p>
            <ul className="mt-2 space-y-1.5">
                {rows.slice(0, ROLLUP_LIMIT).map((row) => (
                    <li
                        key={row.scopeId}
                        className="flex items-baseline justify-between gap-3 text-sm"
                        data-testid="ai-impact-rollup-row"
                    >
                        <span className="truncate">{row.scopeLabel}</span>
                        <span className="shrink-0 tabular-nums text-(--ink-muted)">
                            {row.aiPrsTotal} PRs
                            {row.aiAssistedPrRatio != null
                                ? ` · ${formatPercent(row.aiAssistedPrRatio)}`
                                : ""}
                        </span>
                    </li>
                ))}
            </ul>
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
