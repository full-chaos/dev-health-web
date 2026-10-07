import type { ReactNode } from "react";

import { formatTimestamp } from "@/lib/formatters";
import { STATUS_PILL } from "@/lib/statusPill";

/** Shown for a field the API did not serve. */
export const NOT_REPORTED = "Not reported";

/**
 * The fact rows of the evidence drawer: one row per field, label left and value right.
 * A field with no served value draws no row; the web never fills a value in.
 */
export function EvidenceFactList({
    children,
    "aria-label": ariaLabel,
    testId = "evidence-facts",
}: {
    children: ReactNode;
    "aria-label"?: string;
    testId?: string;
}) {
    return (
        <dl data-testid={testId} aria-label={ariaLabel} className="text-xs">
            {children}
        </dl>
    );
}

/**
 * One fact row. A field the API did not serve (`undefined` or `null`) draws no row.
 * `stacked` puts the value under the label, for a long value such as a file path.
 */
export function EvidenceFact({
    label,
    value,
    stacked = false,
}: {
    label: string;
    value?: ReactNode;
    stacked?: boolean;
}) {
    if (value === undefined || value === null) return null;
    return (
        <div
            data-testid="evidence-fact"
            data-reported
            className={`flex gap-x-3 gap-y-1 border-b border-(--card-stroke) py-2.5 last:border-b-0 ${
                stacked ? "flex-col" : "items-center"
            }`}
        >
            <dt className="text-(--ink-muted)">{label}</dt>
            <dd
                className={`min-w-0 tabular-nums ${stacked ? "" : "ml-auto text-right"} ${"font-semibold text-foreground"}`}
            >
                {value}
            </dd>
        </div>
    );
}

export type EvidenceProvenanceValues = {
    source?: string | null;
    quality?: string | null;
    lastSync?: string | null;
    /**
     * How many artifacts the API returned for the subject. Leave it undefined when the subject has
     * no artifact list, or the list is not loaded. `0` is an empty list and reads "None returned",
     * never "0".
     */
    artifactCount?: number;
};

/**
 * The provenance block an evidence drawer starts with: Source, Data quality, Last sync,
 * Artifacts. A row exists only for a field the API served; a field with no value is not drawn,
 * and when nothing is served the block is not drawn. A failed read is the caller's error state,
 * never this block's silence.
 */
export function EvidenceProvenanceFacts({
    source,
    quality,
    lastSync,
    artifactCount,
}: EvidenceProvenanceValues) {
    const rows: ReactNode[] = [];
    if (source) rows.push(<EvidenceFact key="source" label="Source" value={source} />);
    if (quality) {
        rows.push(
            <EvidenceFact
                key="quality"
                label="Data quality"
                value={
                    <span
                        className={`rounded-full border px-2 py-0.5 font-medium ${STATUS_PILL.muted}`}
                    >
                        {quality.charAt(0).toUpperCase() + quality.slice(1)}
                    </span>
                }
            />,
        );
    }
    if (lastSync) {
        rows.push(
            <EvidenceFact
                key="last-sync"
                label="Last sync"
                // An unparseable value is shown as served, not replaced.
                value={formatTimestamp(lastSync, lastSync)}
            />,
        );
    }
    if (artifactCount !== undefined) {
        rows.push(
            <EvidenceFact
                key="artifacts"
                label="Artifacts"
                value={
                    artifactCount > 0
                        ? `${artifactCount} ${artifactCount === 1 ? "artifact" : "artifacts"}`
                        : "None returned"
                }
            />,
        );
    }
    if (rows.length === 0) return null;

    return <EvidenceFactList aria-label="Quality and provenance">{rows}</EvidenceFactList>;
}
