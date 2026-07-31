"use client";

import { useId, useState } from "react";

import { CTA_LABELS } from "@/lib/design/cta";

type AIComparisonMetricCardProps = {
    title: string;
    value?: number | null;
    unit?: string;
    delta?: number;
    description: string;
    loading?: boolean;
    inverseGood?: boolean;
    precision?: number;
    tooltip?: string;
    onDrilldown?: () => void;
};

function formatValue(value: number | null | undefined, unit: string, precision: number) {
    if (value == null || Number.isNaN(value)) return "—";
    const formatted = unit === "%" ? (value * 100).toFixed(precision) : value.toFixed(precision);
    return `${formatted}${unit ? ` ${unit}` : ""}`;
}

function deltaTone(delta: number, inverseGood: boolean) {
    if (delta === 0) return "text-(--ink-muted)";
    const riskyDirection = inverseGood ? delta < 0 : delta > 0;
    return riskyDirection ? "text-red-600" : "text-emerald-600";
}

export function AIComparisonMetricCard({
    title,
    value,
    unit = "",
    delta,
    description,
    loading,
    inverseGood = false,
    precision = 2,
    tooltip,
    onDrilldown,
}: AIComparisonMetricCardProps) {
    const tooltipId = useId();
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const deltaLabel =
        delta == null
            ? "Baseline delta unavailable"
            : `${delta > 0 ? "+" : ""}${formatValue(delta, unit, precision)} vs human baseline`;

    return (
        <article
            className="flex min-h-48 flex-col justify-between rounded-3xl border border-(--card-stroke) bg-card p-5 shadow-sm"
            data-testid="ai-comparison-metric-card"
        >
            <div>
                <div className="flex items-start justify-between gap-3">
                    <h3 className="font-(--font-display) text-lg">{title}</h3>
                    {tooltip && (
                        <button
                            type="button"
                            aria-describedby={tooltipId}
                            onBlur={() => setTooltipVisible(false)}
                            onFocus={() => setTooltipVisible(true)}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") setTooltipVisible(false);
                            }}
                            onMouseEnter={() => setTooltipVisible(true)}
                            onMouseLeave={() => setTooltipVisible(false)}
                            className="relative rounded-full border border-(--card-stroke) px-2 py-1 text-xs text-(--ink-muted)"
                        >
                            <span aria-hidden="true">?</span>
                            <span className="sr-only">Metric information</span>
                            <span
                                id={tooltipId}
                                role="tooltip"
                                aria-hidden={!tooltipVisible}
                                style={{
                                    opacity: tooltipVisible ? 1 : 0,
                                    visibility: tooltipVisible ? "visible" : "hidden",
                                }}
                                className="absolute top-full right-0 z-10 mt-2 w-56 rounded-lg border border-(--card-stroke) bg-card p-2 text-left text-xs text-foreground shadow-lg transition"
                            >
                                {tooltip}
                            </span>
                        </button>
                    )}
                </div>
                <p className="mt-2 text-sm text-(--ink-muted)">{description}</p>
            </div>

            <div className="mt-6">
                <p className="text-3xl font-semibold tabular-nums text-foreground">
                    {loading ? "—" : formatValue(value, unit, precision)}
                </p>
                <p
                    className={`mt-1 text-sm font-medium ${delta == null ? "text-(--ink-muted)" : deltaTone(delta, inverseGood)}`}
                >
                    {loading ? "Loading baseline…" : deltaLabel}
                </p>
                {onDrilldown && (
                    <button
                        type="button"
                        onClick={onDrilldown}
                        className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-(--accent-positive) hover:underline"
                    >
                        {CTA_LABELS.openEvidence}
                    </button>
                )}
            </div>
        </article>
    );
}

export { formatValue };
