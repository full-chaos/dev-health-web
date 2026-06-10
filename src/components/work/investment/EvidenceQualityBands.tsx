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

    const segments = [
        ...EVIDENCE_QUALITY_BANDS.map((band) => ({
            id: band.id,
            label: band.label,
            opacityClass: band.opacityClass,
            share: (evidenceQualityDistribution[band.id] ?? 0) / total,
        })),
        {
            id: "unknown" as const,
            label: "Unknown (no evidence)",
            opacityClass: "opacity-20",
            share: (evidenceQualityDistribution["unknown"] ?? 0) / total,
        },
    ];

    return (
        <div className="space-y-3">
            <div className="flex h-3 w-full overflow-hidden rounded-full border border-(--border) bg-(--card-70)">
                {segments.map((segment) => {
                    const pct = segment.share * 100;
                    if (pct <= 0) return null;
                    return (
                        <div
                            key={segment.id}
                            className={`h-full bg-(--accent-2) ${segment.opacityClass}`}
                            style={{ width: `${pct}%` }}
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
                                className={`h-2.5 w-2.5 shrink-0 rounded-full bg-(--accent-2) ${segment.opacityClass}`}
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
