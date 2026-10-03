import type { CapacityForecast } from "@/lib/graphql/types";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { STATUS_PILL } from "@/lib/statusPill";

/**
 * A served date as "Jun 10": the calendar day it names, in every time zone (CHAOS-8507). The API
 * serves a forecast date as a UTC day (the day the forecast was computed plus N days), so it is
 * printed in UTC: printed in the viewer's local time it was one day early west of UTC.
 * A date in another calendar year than today (as a UTC day) shows its year, "Jun 10, 2027": a day
 * one year ahead with no year reads as a day of this year.
 * The caller makes sure the date is served.
 */
export function formatForecastDate(dateStr: string): string {
    const date = new Date(dateStr);
    const thisYear = date.getUTCFullYear() === new Date().getUTCFullYear();
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(thisYear ? {} : { year: "numeric" }),
        timeZone: "UTC",
    });
}

// A tile with no value reads "Not reported" (CHAOS-8480): the web shows no dash and no made-up date.

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

/** A served day count as "1 day" / "14 days". */
const daysText = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

/**
 * The horizon of the forecast's simulation, in days, as the API serves it with the distribution;
 * null when no distribution is served (the web has no horizon of its own, so it cannot tell).
 */
export function servedHorizon(forecast: CapacityForecast): number | null {
    const horizon = forecast.completionDistribution?.horizonDays;
    return typeof horizon === "number" ? horizon : null;
}

/**
 * A percentile as text: its value and its caption.
 *
 * The simulation stops a run at the horizon, so a percentile AT the horizon means "that many days
 * or more": the curve never reached that share. Its served date is the horizon day, not a finish
 * date, so it reads "365 days or more" and names no date. Any other percentile is the served date
 * (nothing when it is not served) with the served days as the caption.
 */
export function percentileText(
    date: string | undefined,
    days: number | undefined,
    horizon: number | null,
): { value: string | undefined; caption: string | undefined } {
    if (typeof days === "number" && days === horizon) {
        return { value: `${daysText(days)} or more`, caption: undefined };
    }
    return {
        value: date ? formatForecastDate(date) : undefined,
        caption: typeof days === "number" ? daysText(days) : undefined,
    };
}

/**
 * The forecast as tiles: remaining work and the three percentile dates. The
 * percentiles are neutral text (a later date is not an error); "Target" marks
 * P85. When P50, P85 and P95 are the same, one "Forecast range" tile says so:
 * it shows the served date and the served days (CHAOS-8481: no week count made
 * in the web). A percentile at the served horizon of the simulation reads
 * "365 days or more" and shows no date. Values come from the served fields only.
 */
export function ForecastTiles({ forecast }: { forecast: CapacityForecast }) {
    const { p50Days, p85Days, p95Days } = forecast;
    // The one day count of a low-variance forecast, or null when the percentiles differ or a day
    // count is not served.
    const lowVarianceDays =
        typeof p50Days === "number" && p50Days === p85Days && p85Days === p95Days ? p50Days : null;
    const lowVariance = lowVarianceDays !== null;
    const horizon = servedHorizon(forecast);
    const p50 = percentileText(forecast.p50Date, p50Days, horizon);
    const p85 = percentileText(forecast.p85Date, p85Days, horizon);
    const p95 = percentileText(forecast.p95Date, p95Days, horizon);

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
            {lowVarianceDays !== null ? (
                <Tile
                    testId="tile-range"
                    label="Forecast range"
                    valueText={p50.value}
                    // Three percentiles at the horizon are not "low variance": no run share
                    // reached them inside the horizon.
                    caption={
                        lowVarianceDays === horizon
                            ? undefined
                            : `low variance · ${daysText(lowVarianceDays)}`
                    }
                />
            ) : (
                <>
                    <Tile
                        testId="tile-p50"
                        label="P50 · optimistic"
                        valueText={p50.value}
                        caption={p50.caption}
                    />
                    <Tile
                        testId="tile-p85"
                        label="P85 · target"
                        pill="Target"
                        valueText={p85.value}
                        caption={p85.caption}
                    />
                    <Tile
                        testId="tile-p95"
                        label="P95 · conservative"
                        valueText={p95.value}
                        caption={p95.caption}
                    />
                </>
            )}
        </MetricStrip>
    );
}
