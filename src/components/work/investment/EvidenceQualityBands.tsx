"use client";

import { DataState } from "@/components/ui/DataState";
import { formatNumber } from "@/lib/formatters";
import { EVIDENCE_QUALITY_BANDS } from "./types";

const BAND_IDS = [...EVIDENCE_QUALITY_BANDS.map((b) => b.id), "unknown"] as const;

type EvidenceQualityBandsProps = {
    /**
     * Persisted aggregate evidence-quality distribution from the investment mix.
     * Keys are band IDs ("high" | "moderate" | "low" | "very_low" | "unknown");
     * values are proportional weights that may be un-normalised counts or fractions.
     * When absent or empty the component renders an honest-unavailable state rather
     * than deriving a distribution from the (potentially capped) workUnits list.
     */
    evidenceQualityDistribution: Record<string, number> | null | undefined;
};

/**
 * Evidence-quality band distribution driven by the persisted aggregate
 * `evidence_quality_distribution` from the investment mix.
 *
 * The bar and legend both reflect the server-computed distribution, not a
 * client-side count of workUnits (which is capped at 200 and may be partial).
 * When the persisted distribution is absent, an honest-unavailable DataState
 * is shown rather than synthesising a misleading encoding.
 */
export function EvidenceQualityBands({ evidenceQualityDistribution }: EvidenceQualityBandsProps) {
    // Validate and normalise
    const total = evidenceQualityDistribution
        ? BAND_IDS.reduce((sum, id) => sum + (evidenceQualityDistribution[id] ?? 0), 0)
        : 0;

    if (!evidenceQualityDistribution || total <= 0) {
        return (
            <DataState
                variant="detector-unavailable"
                title="Quality distribution unavailable"
                description="The aggregate evidence-quality distribution is not available for this scope and window."
            />
        );
    }

    // Four ordinal bands: one hue (tide), strength = opacity (unchanged). Unknown is NOT a step of
    // that ramp: neutral ink with a dashed outline, so missing evidence never reads as "low".
    const BAND_FILL = "bg-(--theme-operational)";
    const UNKNOWN_FILL = "bg-(--ink-muted)/35 border border-dashed border-(--ink-muted)";
    const segments = [
        ...EVIDENCE_QUALITY_BANDS.map((band) => ({
            id: band.id,
            label: band.label,
            swatchClass: `${BAND_FILL} ${band.opacityClass}`,
            share: (evidenceQualityDistribution[band.id] ?? 0) / total,
        })),
        {
            id: "unknown" as const,
            label: "Unknown (no evidence)",
            swatchClass: UNKNOWN_FILL,
            share: (evidenceQualityDistribution["unknown"] ?? 0) / total,
        },
    ];

    return (
        <div className="space-y-3">
            {/* 2px gaps between segments (surface shows through); width = share */}
            <div className="flex h-3 w-full gap-0.5">
                {segments.map((segment) => {
                    const pct = segment.share * 100;
                    if (pct <= 0) return null;
                    return (
                        <div
                            key={segment.id}
                            data-band={segment.id}
                            className={`h-full min-w-0.5 rounded-(--radius-sm) ${segment.swatchClass}`}
                            style={{ flex: `${pct} 1 0%` }}
                            title={`${segment.label}: ${formatNumber(pct, { maximumFractionDigits: 0 })}%`}
                        />
                    );
                })}
            </div>
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {segments.map((segment) => {
                    const pct = segment.share * 100;
                    return (
                        <div
                            key={segment.id}
                            className="flex items-center gap-2 text-xs text-(--ink-muted)"
                        >
                            <span
                                data-swatch={segment.id}
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${segment.swatchClass}`}
                            />
                            <dt className="min-w-0 truncate">{segment.label}</dt>
                            <dd className="ml-auto font-mono text-(--ink)">
                                {formatNumber(pct, { maximumFractionDigits: 0 })}%
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}
