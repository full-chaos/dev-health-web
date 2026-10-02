"use client";

import { Info, OctagonAlert, TriangleAlert } from "lucide-react";

import { DataState } from "@/components/ui/DataState";
import type { ImproveOpportunity } from "@/lib/graphql/__generated__/types";
import { resolveEntityLabel } from "@/lib/labels/entityLabel";
import { STATUS_PILL } from "@/lib/statusPill";

export const KIND_LABELS: Record<string, string> = {
    HIGH_REVIEW_LATENCY: "High review latency",
    SLOW_CYCLE_TIME: "Slow cycle time",
    HIGH_REWORK: "High rework",
    HIGH_WIP: "High WIP",
    LOW_THROUGHPUT: "Low throughput",
    HIGH_CHURN: "High churn",
    HIGH_CHANGE_FAILURE: "High change failure rate",
};

export const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind.replace(/_/g, " ");

const SEVERITY: Record<string, { pill: string; Icon: typeof Info }> = {
    high: { pill: STATUS_PILL.negative, Icon: OctagonAlert },
    medium: { pill: STATUS_PILL.caution, Icon: TriangleAlert },
    low: { pill: STATUS_PILL.info, Icon: Info },
};

/** Status is word + icon + color, never color alone. */
function SeverityBadge({ severity }: { severity: string }) {
    const tone = SEVERITY[severity];
    const Icon = tone?.Icon ?? Info;
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${tone?.pill ?? STATUS_PILL.muted}`}
        >
            <Icon className="size-3.5" aria-hidden="true" />
            {severity}
        </span>
    );
}

/** The name when the page has one; otherwise the short token with "Unresolved" (full id in the tooltip). */
function EntityCell({ item }: { item: ImproveOpportunity }) {
    const entity = resolveEntityLabel(item.entityId, { unresolvedFallback: "Unresolved" });
    return (
        <span title={entity.title}>
            <span className="text-(--ink-muted)">{item.entityType} </span>
            {entity.resolved ? entity.label : `${entity.short ?? entity.label} · Unresolved`}
        </span>
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
            <DataState
                variant="detector-unavailable"
                title="No flow opportunities detected"
                description="As review, cycle time, rework, WIP, throughput, churn, and change failure data accumulate, candidates will appear here automatically."
                compact
                data-testid="improve-automations-unavailable"
            />
        );
    }

    if (!opportunities?.length) {
        return (
            <DataState
                variant="detector-enabled-no-findings"
                title="No flow opportunities detected"
                description="No flow opportunities detected in the current window. All monitored metrics are within thresholds."
                compact
                data-testid="improve-automations-empty"
            />
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="improve-automations-table">
                <thead className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    <tr>
                        {[
                            "Signal",
                            "Captured entity",
                            "Value",
                            "Threshold",
                            "Severity",
                            "Detail",
                            "Recommended",
                            "Evidence",
                        ].map((label) => (
                            <th key={label} className="px-3 py-2 text-left font-medium">
                                {label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {opportunities.map((item) => (
                        <tr
                            key={item.opportunityId}
                            className="border-t border-(--card-stroke) align-top"
                            data-testid="improve-automations-row"
                        >
                            <td className="px-3 py-3 font-medium" title={item.title}>
                                {kindLabel(item.kind)}
                            </td>
                            <td className="px-3 py-3">
                                <EntityCell item={item} />
                            </td>
                            {/* Not served per detection yet (CHAOS-7626): never computed here. */}
                            <td
                                className="px-3 py-3 text-(--ink-muted)"
                                data-testid="detection-value"
                            >
                                Not reported
                            </td>
                            <td
                                className="px-3 py-3 text-(--ink-muted)"
                                data-testid="detection-threshold"
                            >
                                Not reported
                            </td>
                            <td className="px-3 py-3">
                                <SeverityBadge severity={item.severity} />
                            </td>
                            <td className="px-3 py-3 text-(--ink-muted)">{item.rationale}</td>
                            <td className="px-3 py-3 text-(--ink-muted)">
                                {item.recommendedAction}
                            </td>
                            <td className="px-3 py-3 text-xs text-(--ink-muted)">
                                {item.evidenceRefs.join(" · ")}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
