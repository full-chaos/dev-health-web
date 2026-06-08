"use client";

import { computeEvidenceBandCounts } from "@/lib/investment";
import { formatNumber } from "@/lib/formatters";
import type { WorkUnitInvestment } from "@/lib/types";
import { EVIDENCE_QUALITY_BANDS } from "./types";

type EvidenceQualityBandsProps = {
    workUnits: WorkUnitInvestment[];
};

/**
 * Evidence-quality band distribution.
 *
 * Fixes the "evidence quality bands indicate nothing" bug: previously the band
 * swatches were an orphaned legend next to a treemap that encoded theme colour,
 * so the bands described nothing on screen. Here the bands DRIVE the encoding —
 * each band is a segment whose width is its share of work units and whose
 * opacity matches the band's strength (`band.opacityClass`). The legend below
 * reads the same counts, so the swatch opacity now means exactly what the bar
 * shows. Units without a server band fall into "Unknown" rather than vanishing.
 */
export function EvidenceQualityBands({ workUnits }: EvidenceQualityBandsProps) {
    const counts = computeEvidenceBandCounts(workUnits);
    const total = workUnits.length;

    const segments = [
        ...EVIDENCE_QUALITY_BANDS.map((band) => ({
            id: band.id,
            label: band.label,
            opacityClass: band.opacityClass,
            count: counts[band.id],
        })),
        {
            id: "unknown" as const,
            label: "Unknown (no evidence)",
            opacityClass: "opacity-20",
            count: counts.unknown,
        },
    ];

    if (total === 0) {
        return (
            <p className="text-sm text-(--ink-muted)">
                No work units in the selected window, so evidence quality bands cannot be summarized
                yet.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex h-3 w-full overflow-hidden rounded-full border border-(--card-stroke) bg-(--card-70)">
                {segments.map((segment) => {
                    const share = total > 0 ? (segment.count / total) * 100 : 0;
                    if (share <= 0) return null;
                    return (
                        <div
                            key={segment.id}
                            className={`h-full bg-(--accent-2) ${segment.opacityClass}`}
                            style={{ width: `${share}%` }}
                            title={`${segment.label}: ${segment.count} of ${total} (${formatNumber(share, { maximumFractionDigits: 0 })}%)`}
                        />
                    );
                })}
            </div>
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {segments.map((segment) => {
                    const share = total > 0 ? (segment.count / total) * 100 : 0;
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
                                {segment.count}
                                <span className="ml-1 text-(--ink-muted)">
                                    ({formatNumber(share, { maximumFractionDigits: 0 })}%)
                                </span>
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}
