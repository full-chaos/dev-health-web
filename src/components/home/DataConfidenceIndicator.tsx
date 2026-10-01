import type { ReactNode } from "react";

import { Notice, type NoticeVariant } from "@/components/ui/Notice";

/**
 * Data confidence indicator (CHAOS-2052).
 *
 * Renders the cockpit `data_confidence` contract so a viewer can immediately
 * gauge how much to trust what they're looking at — without leaking internal
 * detector names or implying a finding. Trust-preserving language only
 * ("appears / based on"), never absolutes.
 *
 * Structural prop shape mirrors the `data_confidence` contract from
 * `@/lib/types` exactly, kept decoupled here so the component compiles ahead of
 * the shared type landing. Swap to the imported contract type once published.
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
    { label: string; variant: NoticeVariant; blurb: string }
> = {
    high: {
        label: "High confidence",
        variant: "good",
        blurb: "Most sources this view relies on are connected and recent.",
    },
    medium: {
        label: "Medium confidence",
        variant: "warn",
        blurb: "Some sources are missing or sparse — read trends, not point values.",
    },
    low: {
        label: "Low confidence",
        // Limited coverage is a caution about reading the page, not an error.
        variant: "warn",
        blurb: "Coverage is limited — this view may not reflect the full picture.",
    },
};

function SourceList({ heading, sources }: { heading: string; sources: string[] }): ReactNode {
    if (sources.length === 0) {
        return null;
    }
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                {heading}
            </span>
            {sources.map((source) => (
                <span
                    key={source}
                    className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-0.5 text-xs text-(--ink-muted)"
                >
                    {source}
                </span>
            ))}
        </div>
    );
}

export function DataConfidenceIndicator({ confidence, className }: DataConfidenceIndicatorProps) {
    const { level, coverage_pct, connected_sources, missing_sources, caveats } = confidence;
    const meta = LEVEL_META[level] ?? LEVEL_META.low;
    const hasCoverage = typeof coverage_pct === "number" && Number.isFinite(coverage_pct);
    const coverageRounded = hasCoverage
        ? Math.max(0, Math.min(100, Math.round(coverage_pct as number)))
        : null;

    const hasDetail =
        connected_sources.length > 0 || missing_sources.length > 0 || caveats.length > 0;

    return (
        <section
            data-testid="data-confidence-indicator"
            data-level={level}
            aria-label={`Data confidence: ${meta.label}`}
            className={`flex flex-col gap-3 ${className ?? ""}`}
        >
            <Notice
                variant={meta.variant}
                live={false}
                title={meta.label}
                action={
                    coverageRounded !== null ? (
                        <span className="text-xs" data-testid="data-confidence-coverage">
                            {coverageRounded}% coverage
                        </span>
                    ) : undefined
                }
            >
                {meta.blurb}
            </Notice>

            {hasDetail && (
                <section
                    aria-labelledby="evidence-context-title"
                    className="flex flex-col gap-3 rounded-(--radius-md) border border-(--card-stroke) bg-(--card) p-4.75"
                >
                    <h2
                        id="evidence-context-title"
                        className="text-label-caps uppercase text-(--ink-muted)"
                    >
                        Evidence & context
                    </h2>
                    <SourceList heading="Connected" sources={connected_sources} />
                    <SourceList heading="Missing" sources={missing_sources} />

                    {caveats.length > 0 && (
                        <ul className="mt-1 space-y-1" data-testid="data-confidence-caveats">
                            {caveats.map((caveat) => (
                                <li key={caveat} className="flex gap-2 text-xs text-(--ink-muted)">
                                    <span aria-hidden="true">•</span>
                                    <span>{caveat}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </section>
    );
}
