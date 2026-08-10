"use client";

import type { DevAnswer } from "@/lib/dev/generated";
import { formatNumber } from "@/lib/formatters";

/**
 * Per-source coverage for this answer.
 *
 * Whether this block appears at all is the container's call (see
 * `showCoverage`): "0 of 0 sources" reads as a measurement that happened, and
 * a source plan that never ran must not render one. Once mounted, every
 * required-source state the answer actually carries is named — a visibly
 * downgraded answer with nothing on screen explaining the downgrade is the
 * defect CHAOS-3219 W4 fixed.
 */
export function CoverageSection({ coverage }: { coverage: DevAnswer["coverage"] }) {
    return (
        <section
            aria-label="Evidence coverage"
            className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-(--text-muted)"
        >
            <span>
                Coverage:{" "}
                {formatNumber(coverage?.available_source_count ?? 0, {
                    maximumFractionDigits: 0,
                })}{" "}
                of{" "}
                {formatNumber(coverage?.required_source_count ?? 0, {
                    maximumFractionDigits: 0,
                })}{" "}
                sources
            </span>
            {coverage?.unavailable_required_sources?.length ? (
                <span className="text-(--caution)">
                    {coverage.unavailable_required_sources.length} required sources unavailable
                </span>
            ) : null}
            {coverage?.degraded_required_sources?.length ? (
                <span className="text-(--caution)">
                    {coverage.degraded_required_sources.length} required sources degraded
                </span>
            ) : null}
            {coverage?.stale_required_sources?.length ? (
                <span className="text-(--caution)">
                    {coverage.stale_required_sources.length} required sources stale
                </span>
            ) : null}
        </section>
    );
}
