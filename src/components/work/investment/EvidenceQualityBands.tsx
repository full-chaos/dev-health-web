"use client";

import { DataState } from "@/components/ui/DataState";
import { MeterRows } from "@/components/ui/MeterRows";
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
 * The band and the meter rows both reflect the server-computed distribution, not a
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
    const BAND_FILL = "bg-(--chart-color-1)";
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
            {/* Prototype `investmentConfidence()`: the band, then meter rows (`bars()`), one per band
                with its share of the work units. */}
            <MeterRows
                aria-label="Evidence quality bands"
                testId="evidence-quality-meter-rows"
                max={100}
                rows={segments.map((segment) => {
                    const pct = segment.share * 100;
                    return {
                        key: segment.id,
                        label: segment.label,
                        value: pct,
                        display: `${formatNumber(pct, { maximumFractionDigits: 0 })}%`,
                    };
                })}
            />
        </div>
    );
}
