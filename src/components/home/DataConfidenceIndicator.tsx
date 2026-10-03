import { Notice, type NoticeVariant } from "@/components/ui/Notice";

/**
 * Confidence banner of Home (approved prototype `cockpit()`: `note(..., 'good')`, `app.js:100`).
 *
 * One Notice strip above the primary signal: the served confidence level, the served connected
 * and missing source names, and one fixed sentence that keeps source-level state apart from
 * signal-level evidence. It shows only the `data_confidence` contract; it computes nothing.
 *
 * The served caveats are in the "Evidence & context" card (`EvidenceContextCard`). The served
 * coverage is a fact row of the drawer that the page header "View evidence" action opens
 * (`formatCoveragePct`, `lib/cockpit/coverage.ts`).
 */

export type DataConfidenceLevel = "high" | "medium" | "low";

export type DataConfidence = {
    level: DataConfidenceLevel;
    /** 0–100 coverage of the sources this view depends on. Optional. */
    coverage_pct?: number | null;
    connected_sources: string[];
    missing_sources: string[];
    caveats: string[];
};

type DataConfidenceIndicatorProps = {
    confidence: DataConfidence;
    className?: string;
};

const LEVEL_META: Record<
    DataConfidenceLevel,
    { label: string; variant: NoticeVariant; strong: string }
> = {
    high: { label: "High confidence", variant: "good", strong: "text-(--positive)" },
    medium: { label: "Medium confidence", variant: "warn", strong: "text-(--caution)" },
    // Limited coverage is a caution about reading the page, not an error.
    low: { label: "Low confidence", variant: "warn", strong: "text-(--caution)" },
};

/** Approved prototype sentence (`app.js:100`). Source state is not signal evidence. */
export const SIGNAL_LEVEL_SENTENCE = "Signal-level evidence can still be moderate or incomplete.";

export function DataConfidenceIndicator({ confidence, className }: DataConfidenceIndicatorProps) {
    const { level, connected_sources, missing_sources } = confidence;
    const meta = LEVEL_META[level] ?? LEVEL_META.low;

    // Source names as served. A missing source is named: missing is not healthy.
    const sentences = [
        connected_sources.length > 0 ? `Connected sources: ${connected_sources.join(", ")}.` : null,
        missing_sources.length > 0 ? `Missing sources: ${missing_sources.join(", ")}.` : null,
        SIGNAL_LEVEL_SENTENCE,
    ].filter((sentence): sentence is string => sentence !== null);

    return (
        <Notice
            variant={meta.variant}
            live={false}
            data-testid="data-confidence-indicator"
            data-level={level}
            className={className}
        >
            <strong data-testid="data-confidence-level" className={`font-semibold ${meta.strong}`}>
                {meta.label}
            </strong>
            <span aria-hidden="true"> · </span>
            <span data-testid="data-confidence-text">{sentences.join(" ")}</span>
        </Notice>
    );
}
