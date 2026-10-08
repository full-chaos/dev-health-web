"use client";

import { ArrowRight, Info, OctagonAlert, TriangleAlert } from "lucide-react";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList, NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";
import { DataState } from "@/components/ui/DataState";
import { formatNumber } from "@/lib/formatters";
import type { ImproveOpportunity } from "@/lib/graphql/__generated__/types";
import { nameOrUnresolved } from "@/lib/labels/unresolved";
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

/** The name when the page has one; otherwise "Unresolved" (the id is not shown). */
function EntityCell({ item }: { item: ImproveOpportunity }) {
    const entity = { label: nameOrUnresolved(item.entityDisplayName) };
    return (
        <span>
            <span className="text-(--ink-muted)">{item.entityType} </span>
            {entity.label}
        </span>
    );
}

/**
 * A served rule number written in its served unit (CHAOS-8500), or null when the number or the unit
 * is not served. The unit only decides how the number is written: hours as "52 h", a ratio as a
 * percent ("56%"), items as "2 items". A unit this page does not know is written as served.
 */
export function formatDetectionNumber(
    value: number | null | undefined,
    unit: string | null | undefined,
): string | null {
    if (typeof value !== "number" || !Number.isFinite(value) || !unit) return null;
    switch (unit) {
        case "HOURS":
            return `${formatNumber(value, { maximumFractionDigits: 1 })} h`;
        case "RATIO":
            return `${formatNumber(value * 100, { maximumFractionDigits: 0 })}%`;
        case "ITEMS":
            return `${formatNumber(value)} ${value === 1 ? "item" : "items"}`;
        default:
            return `${formatNumber(value)} ${unit}`;
    }
}

/** The side of the threshold that fires the rule, as served: a sign to read, a word to hear. */
const DIRECTION: Record<string, { sign: string; word: string }> = {
    ABOVE: { sign: ">", word: "above" },
    BELOW: { sign: "<", word: "below" },
};

/** The measured value the rule compared. "Not reported" when the API did not serve it. */
function ValueCell({ item }: { item: ImproveOpportunity }) {
    const text = formatDetectionNumber(item.value, item.unit);
    return (
        <td
            className={`px-3 py-3 tabular-nums ${text ? "" : "text-(--ink-muted)"}`}
            data-testid="detection-value"
        >
            {text ?? NOT_REPORTED}
        </td>
    );
}

/** The rule's limit, with the side that fires it. "Not reported" when the API did not serve it. */
function ThresholdCell({ item }: { item: ImproveOpportunity }) {
    const text = formatDetectionNumber(item.threshold, item.unit);
    const direction = item.thresholdDirection ? DIRECTION[item.thresholdDirection] : undefined;
    return (
        <td
            className={`px-3 py-3 tabular-nums ${text ? "" : "text-(--ink-muted)"}`}
            data-testid="detection-threshold"
            aria-label={text && direction ? `${direction.word} ${text}` : undefined}
        >
            {text ? (direction ? `${direction.sign} ${text}` : text) : NOT_REPORTED}
        </td>
    );
}

/** The row's served fields in the shared drawer: the detection, then each evidence reference. */
function RowEvidenceButton({ item }: { item: ImproveOpportunity }) {
    const evidence = useEvidenceDrawer();
    const entity = { label: nameOrUnresolved(item.entityDisplayName) };
    const entityText = `${item.entityType} ${entity.label}`;
    return (
        <Button
            variant="ghost"
            size="sm"
            icon={<ArrowRight />}
            iconPosition="start"
            data-testid="detection-evidence-button"
            aria-label={`Evidence for ${kindLabel(item.kind)}`}
            onClick={() =>
                evidence.open({
                    title: kindLabel(item.kind),
                    content: (
                        <EvidenceFactList aria-label="Detection" testId="detection-evidence-facts">
                            <EvidenceFact label="Signal" value={kindLabel(item.kind)} />
                            <EvidenceFact label="Captured entity" value={entityText} />
                            <EvidenceFact label="Severity" value={item.severity} />
                            <EvidenceFact label="Detail" value={item.rationale} stacked />
                            <EvidenceFact
                                label="Recommended"
                                value={item.recommendedAction}
                                stacked
                            />
                            {item.evidenceRefs.length > 0 ? (
                                item.evidenceRefs.map((ref, index) => (
                                    <EvidenceFact
                                        key={`${ref}-${index}`}
                                        label={`Evidence reference ${index + 1}`}
                                        value={ref}
                                        stacked
                                    />
                                ))
                            ) : (
                                <EvidenceFact label="Evidence references" />
                            )}
                        </EvidenceFactList>
                    ),
                })
            }
        >
            {CTA_LABELS.evidence}
        </Button>
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
                            <ValueCell item={item} />
                            <ThresholdCell item={item} />
                            <td className="px-3 py-3">
                                <SeverityBadge severity={item.severity} />
                            </td>
                            <td className="px-3 py-3 text-(--ink-muted)">{item.rationale}</td>
                            <td className="px-3 py-3 text-(--ink-muted)">
                                {item.recommendedAction}
                            </td>
                            <td className="px-3 py-3">
                                <RowEvidenceButton item={item} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
