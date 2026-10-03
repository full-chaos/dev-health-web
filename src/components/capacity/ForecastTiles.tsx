import type { CapacityForecast } from "@/lib/graphql/types";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { STATUS_PILL } from "@/lib/statusPill";

export function formatForecastDate(dateStr: string | undefined): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function lowVarianceWeeks(days: number): string {
    const weeks = Math.max(1, Math.round(days / 7));
    return `≈${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

function Tile({
    label,
    value,
    unit,
    valueText,
    caption,
    pill,
    testId,
}: {
    label: string;
    /** A number and its unit apart (the tile draws the unit small), or a ready text (a date). */
    value?: number;
    unit?: string;
    valueText?: string;
    caption?: string;
    pill?: string;
    testId: string;
}) {
    return (
        <MetricCard
            testId={testId}
            label={label}
            value={value}
            unit={unit}
            valueText={valueText}
            hideTrend
            deltaSlot={
                <>
                    {pill ? (
                        <span
                            className={`mr-2 rounded-full border px-2 py-0.5 text-xs ${STATUS_PILL.muted}`}
                        >
                            {pill}
                        </span>
                    ) : null}
                    {caption ? <span>{caption}</span> : null}
                </>
            }
        />
    );
}

const daysCaption = (days: number | undefined) =>
    typeof days === "number" ? `${days} ${days === 1 ? "day" : "days"}` : undefined;

/**
 * The forecast as tiles: remaining work and the three percentile dates. The
 * percentiles are neutral text (a later date is not an error); "Target" marks
 * P85. When P50, P85 and P95 are the same, one "Forecast range" tile says so,
 * as the old card did. Values come from the same fields as before.
 */
export function ForecastTiles({ forecast }: { forecast: CapacityForecast }) {
    const lowVariance =
        typeof forecast.p50Days === "number" &&
        forecast.p50Days === forecast.p85Days &&
        forecast.p85Days === forecast.p95Days;

    return (
        // The strip counts its direct children, and the three percentiles sit in one fragment:
        // say the column count here (Remaining work + 3 percentile dates, or + 1 range tile).
        <MetricStrip data-testid="forecast-tiles" columns={lowVariance ? 2 : 4}>
            <Tile
                testId="tile-remaining"
                label="Remaining work"
                value={forecast.backlogSize}
                unit={forecast.backlogSize === 1 ? "item" : "items"}
            />
            {lowVariance ? (
                <Tile
                    testId="tile-range"
                    label="Forecast range"
                    valueText={lowVarianceWeeks(forecast.p50Days ?? 0)}
                    caption={`low variance · ${formatForecastDate(forecast.p50Date)}`}
                />
            ) : (
                <>
                    <Tile
                        testId="tile-p50"
                        label="P50 · optimistic"
                        valueText={formatForecastDate(forecast.p50Date)}
                        caption={daysCaption(forecast.p50Days)}
                    />
                    <Tile
                        testId="tile-p85"
                        label="P85 · target"
                        pill="Target"
                        valueText={formatForecastDate(forecast.p85Date)}
                        caption={daysCaption(forecast.p85Days)}
                    />
                    <Tile
                        testId="tile-p95"
                        label="P95 · conservative"
                        valueText={formatForecastDate(forecast.p95Date)}
                        caption={daysCaption(forecast.p95Days)}
                    />
                </>
            )}
        </MetricStrip>
    );
}
