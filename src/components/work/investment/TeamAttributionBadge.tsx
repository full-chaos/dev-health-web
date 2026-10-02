import {
    describeAttributionProvenance,
    type AttributionTone,
} from "@/lib/investment/teamAttribution";
import { STATUS_PILL } from "@/lib/statusPill";
import type {
    TeamAttributionConfidence,
    TeamAttributionSource,
} from "@/lib/graphql/__generated__/types";

/**
 * Render-only provenance badge for a work item's backend-computed team
 * attribution (CHAOS-2608 / CS7). Surfaces the `source` + `confidence` the
 * ClickHouse system-of-record resolved; never recomputes attribution.
 *
 * `MANUAL_FALLBACK` is rendered with a distinct muted "manual · low confidence"
 * treatment so it is never read as authoritative team truth.
 */

const TONE_STYLES: Record<AttributionTone, string> = {
    trusted: STATUS_PILL.positive,
    derived: STATUS_PILL.info,
    weak: STATUS_PILL.caution,
    // Distinct, muted, dashed treatment — a backstop guess, not team truth.
    fallback: "border-dashed border-(--card-stroke) bg-(--card-70) text-(--ink-muted)",
    none: "border-(--card-stroke) bg-(--card-70) text-(--ink-muted)",
};

type TeamAttributionBadgeProps = {
    source: TeamAttributionSource;
    confidence: TeamAttributionConfidence;
    teamName?: string | null;
};

export function TeamAttributionBadge({ source, confidence, teamName }: TeamAttributionBadgeProps) {
    const provenance = describeAttributionProvenance({ source, confidence });
    const title = teamName
        ? `Team "${teamName}" — ${provenance.description}`
        : provenance.description;

    return (
        <span
            data-testid="team-attribution-badge"
            data-source={source}
            data-confidence={confidence}
            data-manual-fallback={provenance.isManualFallback ? "true" : "false"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${TONE_STYLES[provenance.tone]}`}
            title={title}
        >
            {provenance.isManualFallback ? "Manual · low confidence" : provenance.sourceLabel}
        </span>
    );
}
