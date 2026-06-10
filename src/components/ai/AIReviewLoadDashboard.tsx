"use client";

import { useState } from "react";

import { ErrorCard } from "@/components/ui/ErrorCard";
import type { AIFilter } from "@/lib/filters/ai";
import type { AiMissingState, AiReviewLoadRow } from "@/lib/graphql/__generated__/types";
import {
    approvalFriction,
    findBucketRow,
    useAIReviewLoad,
    valueDelta,
} from "@/lib/graphql/hooks/useAIReviewRisk";
import { AIComparisonMetricCard } from "./AIComparisonMetricCard";
import { AIDrilldownModal } from "./AIDrilldownModal";
import { AIMissingDataPanel } from "./AIMissingDataPanel";
import { AIReviewAmplificationTrend } from "./AIReviewAmplificationTrend";

type AIReviewLoadDashboardProps = {
    filter: AIFilter;
};

function missingState(
    states: AiMissingState[] | undefined,
    key: string,
): AiMissingState | undefined {
    return states?.find((state) => state.key === key);
}

export function AIReviewLoadDashboard({ filter }: AIReviewLoadDashboardProps) {
    const { data, fetching, error } = useAIReviewLoad(filter);
    const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);

    const reviewLoad = data?.aiReviewLoad;
    const aiBucket = findBucketRow<AiReviewLoadRow>(reviewLoad?.byBucket);
    const humanBucket = findBucketRow<AiReviewLoadRow>(reviewLoad?.byBucket, "HUMAN");
    const aiFriction = approvalFriction(aiBucket);
    const humanFriction = approvalFriction(humanBucket);
    const reviewerMissing = missingState(reviewLoad?.missingStates, "reviewer_concentration");

    if (error) {
        return <ErrorCard title="Failed to load AI review load" message={error.message} />;
    }

    if (!fetching && reviewLoad && !reviewLoad.dataAvailable) {
        return (
            <AIMissingDataPanel
                title="AI review load data is not available"
                reason="The backend returned data_available=false for the selected scope. This view keeps the gap explicit instead of fabricating values."
                needed="Review activity rollups for AI-attributed PRs."
            />
        );
    }

    return (
        <div className="flex flex-col gap-6" data-testid="ai-review-load-dashboard">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <AIComparisonMetricCard
                    title="Pickup latency"
                    value={aiBucket?.pickupLatencyHours}
                    unit="h"
                    delta={valueDelta(
                        aiBucket?.pickupLatencyHours,
                        humanBucket?.pickupLatencyHours,
                    )}
                    description="Average time from PR open to first review for AI-attributed work."
                    loading={fetching}
                    onDrilldown={() => setDrilldownMetric("Pickup latency")}
                />
                <AIComparisonMetricCard
                    title="Review comments per LOC"
                    value={aiBucket?.reviewCommentsPerLoc}
                    precision={3}
                    delta={valueDelta(
                        aiBucket?.reviewCommentsPerLoc,
                        humanBucket?.reviewCommentsPerLoc,
                    )}
                    description="Review comment density relative to lines changed in AI-attributed PRs."
                    loading={fetching}
                    onDrilldown={() => setDrilldownMetric("Review comments per LOC")}
                />
                <AIComparisonMetricCard
                    title="Change request rate"
                    value={aiBucket?.changesRequestedPerPr}
                    delta={valueDelta(
                        aiBucket?.changesRequestedPerPr,
                        humanBucket?.changesRequestedPerPr,
                    )}
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
                <AIComparisonMetricCard
                    title="Push iterations after first review"
                    value={aiBucket?.postFirstReviewPushesPerPr}
                    delta={valueDelta(
                        aiBucket?.postFirstReviewPushesPerPr,
                        humanBucket?.postFirstReviewPushesPerPr,
                    )}
                    description="Average pushes after the first review for AI-attributed PRs. This exposes review churn without naming reviewers."
                    loading={fetching}
                    onDrilldown={() => setDrilldownMetric("Push iterations after first review")}
                />
                {reviewLoad?.reviewerConcentration.dataAvailable ? (
                    <section
                        className="rounded-3xl border border-(--border) bg-card p-5"
                        data-testid="ai-reviewer-concentration"
                    >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--ink-muted)">
                            Aggregate-only
                        </p>
                        <h3 className="mt-2 font-(--font-display) text-lg">
                            Reviewer concentration
                        </h3>
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            Distribution-level review spread only. No reviewer names, ranks, or
                            person-level counts are exposed.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-background/60 px-3 py-3">
                                <p className="text-xs uppercase tracking-[0.12em] text-(--ink-muted)">
                                    Gini
                                </p>
                                <p className="mt-1 text-2xl font-semibold tabular-nums">
                                    {reviewLoad.reviewerConcentration.reviewerGini?.toFixed(2) ??
                                        "—"}
                                </p>
                            </div>
                            <div className="rounded-2xl bg-background/60 px-3 py-3">
                                <p className="text-xs uppercase tracking-[0.12em] text-(--ink-muted)">
                                    Reviewers
                                </p>
                                <p className="mt-1 text-2xl font-semibold tabular-nums">
                                    {reviewLoad.reviewerConcentration.reviewerCount}
                                </p>
                            </div>
                        </div>
                    </section>
                ) : (
                    <AIMissingDataPanel
                        title={reviewerMissing?.title ?? "Reviewer concentration"}
                        reason={
                            reviewerMissing?.guidance ??
                            "Reviewer concentration is unavailable until aggregate-only reviewer distribution data is present."
                        }
                        needed="Aggregated reviewer distribution buckets only; never individual reviewer leaderboards."
                    />
                )}
                <AIComparisonMetricCard
                    title="Review amplification"
                    value={aiBucket?.reviewAmplification}
                    delta={valueDelta(
                        aiBucket?.reviewAmplification,
                        humanBucket?.reviewAmplification,
                    )}
                    description="Review volume amplification for AI-attributed PRs compared with the human baseline."
                    loading={fetching}
                    onDrilldown={() => setDrilldownMetric("Review amplification")}
                />
            </div>

            <AIReviewAmplificationTrend daily={reviewLoad?.daily ?? []} loading={fetching} />

            {drilldownMetric && (
                <AIDrilldownModal
                    metric={drilldownMetric}
                    filter={filter}
                    onClose={() => setDrilldownMetric(null)}
                />
            )}
        </div>
    );
}
