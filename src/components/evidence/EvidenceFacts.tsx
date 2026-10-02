import type { ReactNode } from "react";

import { formatTimestamp } from "@/lib/formatters";
import { STATUS_PILL } from "@/lib/statusPill";

/** Shown for a field the API did not serve. */
export const NOT_REPORTED = "Not reported";

/**
 * The fact rows of the evidence drawer: one row per field, label left and value right.
 * A field with no served value shows "Not reported"; the web never fills a value in.
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
 * One fact row. Leave `value` undefined when the API did not serve the field.
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
    const reported = value !== undefined && value !== null;
    return (
        <div
            data-testid="evidence-fact"
            data-reported={reported}
            className={`flex gap-x-3 gap-y-1 border-b border-(--card-stroke) py-2.5 last:border-b-0 ${
                stacked ? "flex-col" : "items-center"
            }`}
        >
            <dt className="text-(--ink-muted)">{label}</dt>
            <dd
                className={`min-w-0 tabular-nums ${stacked ? "" : "ml-auto text-right"} ${
                    reported ? "font-semibold text-foreground" : "text-(--ink-muted)"
                }`}
            >
                {reported ? value : NOT_REPORTED}
            </dd>
        </div>
    );
}

export type EvidenceProvenanceValues = {
    source?: string | null;
    quality?: string | null;
    lastSync?: string | null;
    /** 0 to 1. */
    identityConfidence?: number | null;
    /**
     * How many artifacts the API returned for the subject. Leave it undefined when the subject has
     * no artifact list, or the list is not loaded: the row then reads "Not reported". `0` is an
     * empty list and reads "None returned", never "0".
     */
    artifactCount?: number;
};

/** The one line a drawer shows in place of five empty provenance rows. */
export const PROVENANCE_NOT_REPORTED = "Provenance is not reported for this item.";

type EvidenceProvenanceFactsProps = EvidenceProvenanceValues & {
    /**
     * What to show when NO row is served. `rows` (default): the five rows, each "Not reported";
     * the explain-backed drawer uses it, because its request can serve every row. `line`: one
     * muted line in place of five empty rows; a drawer whose query serves none of them uses it.
     * As soon as one row is served, the five rows show (the others read "Not reported").
     */
    whenEmpty?: "rows" | "line";
};

/**
 * The provenance block an evidence drawer starts with (approved prototype `openEvidence`,
 * `app.js:122`): Source, Data quality, Last sync, Identity confidence, Artifacts. A subject
 * passes only what was served for it; the other rows read "Not reported".
 */
export function EvidenceProvenanceFacts({
    source,
    quality,
    lastSync,
    identityConfidence,
    artifactCount,
    whenEmpty = "rows",
}: EvidenceProvenanceFactsProps) {
    const anyServed =
        Boolean(source) ||
        Boolean(quality) ||
        Boolean(lastSync) ||
        typeof identityConfidence === "number" ||
        artifactCount !== undefined;

    if (!anyServed && whenEmpty === "line") {
        return (
            <p
                data-testid="evidence-provenance-not-reported"
                className="text-xs text-(--ink-muted)"
            >
                {PROVENANCE_NOT_REPORTED}
            </p>
        );
    }

    return (
        <EvidenceFactList aria-label="Quality and provenance">
            <EvidenceFact label="Source" value={source || undefined} />
            <EvidenceFact
                label="Data quality"
                value={
                    quality ? (
                        <span
                            className={`rounded-full border px-2 py-0.5 font-medium ${STATUS_PILL.muted}`}
                        >
                            {quality.charAt(0).toUpperCase() + quality.slice(1)}
                        </span>
                    ) : undefined
                }
            />
            <EvidenceFact
                label="Last sync"
                // An unparseable value is shown as served, not replaced.
                value={lastSync ? formatTimestamp(lastSync, lastSync) : undefined}
            />
            <EvidenceFact
                label="Identity confidence"
                value={
                    typeof identityConfidence === "number"
                        ? `${Math.round(identityConfidence * 100)}%`
                        : undefined
                }
            />
            <EvidenceFact
                label="Artifacts"
                value={
                    artifactCount === undefined
                        ? undefined
                        : artifactCount > 0
                          ? `${artifactCount} ${artifactCount === 1 ? "artifact" : "artifacts"}`
                          : "None returned"
                }
            />
        </EvidenceFactList>
    );
}
