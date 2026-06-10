"use client";

import type { ImproveOpportunity } from "@/lib/graphql/__generated__/types";

const KIND_LABELS: Record<string, string> = {
    HIGH_REVIEW_LATENCY: "High review latency",
    SLOW_CYCLE_TIME: "Slow cycle time",
    HIGH_REWORK: "High rework",
    HIGH_WIP: "High WIP",
    LOW_THROUGHPUT: "Low throughput",
    HIGH_CHURN: "High churn",
    HIGH_CHANGE_FAILURE: "High change failure rate",
};

function SeverityBadge({ severity }: { severity: string }) {
    const colorMap: Record<string, string> = {
        high: "bg-red-100 text-red-800",
        medium: "bg-amber-100 text-amber-800",
        low: "bg-sky-100 text-sky-800",
    };
    const color = colorMap[severity] ?? "bg-gray-100 text-gray-700";
    return (
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${color}`}>{severity}</span>
    );
}

export function ImproveOpportunityList({
    detectorReady,
    opportunities,
}: {
    detectorReady?: boolean;
    opportunities?: ImproveOpportunity[];
}) {
    if (!detectorReady) {
        return (
            <div className="rounded-2xl border border-dashed border-(--border) bg-(--card-80) p-5 text-sm text-(--ink-muted)">
                <p className="font-medium text-foreground">No flow opportunities detected</p>
                <p className="mt-2">
                    As review, cycle time, rework, WIP, throughput, churn, and change failure data
                    accumulate, candidates will appear here automatically.
                </p>
            </div>
        );
    }

    if (!opportunities?.length) {
        return (
            <p className="text-sm text-(--ink-muted)">
                No flow opportunities detected in the current window. All monitored metrics are
                within thresholds.
            </p>
        );
    }

    return (
        <ol className="space-y-3">
            {opportunities.map((item) => (
                <li
                    key={item.opportunityId}
                    className="rounded-2xl border border-(--border) bg-(--card-80) p-4"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="font-medium">{item.title}</p>
                            <p className="mt-1 text-sm text-(--ink-muted)">{item.rationale}</p>
                        </div>
                        <SeverityBadge severity={item.severity} />
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.12em] text-(--ink-muted)">
                        {KIND_LABELS[item.kind] ?? item.kind.replace(/_/g, " ")} · {item.entityType}{" "}
                        {item.entityId}
                    </p>
                    {item.recommendedAction && (
                        <p className="mt-3 rounded-xl bg-background/60 px-3 py-2 text-xs text-(--ink-muted)">
                            <span className="font-semibold text-foreground">Recommended: </span>
                            {item.recommendedAction}
                        </p>
                    )}
                    {item.evidenceRefs.length > 0 && (
                        <p className="mt-2 text-xs text-(--ink-muted)">
                            Evidence: {item.evidenceRefs.join(" · ")}
                        </p>
                    )}
                </li>
            ))}
        </ol>
    );
}
