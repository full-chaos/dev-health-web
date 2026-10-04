/**
 * Days of a capacity forecast (CHAOS-8477).
 *
 * The API works in UTC calendar days: the percentile dates are "the day the forecast was computed
 * plus N days", and a bin of `completionDistribution.days` is a number of days after that same day.
 * These helpers keep that rule: a served date is shown as the calendar day it names, and a day
 * offset is turned into its date with the API's own arithmetic. No value is made here.
 */

const DAY_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };

/** "Jun 20" for the served date "2026-06-20": the calendar day as served, in any time zone. */
export function formatServedDay(isoDate: string): string | null {
    const date = new Date(isoDate);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-US", DAY_FORMAT);
}

/**
 * The date of a day offset: the UTC day of `computedAt` plus `days`, as "Jun 20". It is the rule
 * the API uses for p50Date (that day plus p50Days). Null when `computedAt` is not a date.
 */
export function formatDayOffset(computedAt: string, days: number): string | null {
    const computed = new Date(computedAt);
    if (Number.isNaN(computed.getTime())) return null;
    const day = new Date(
        Date.UTC(computed.getUTCFullYear(), computed.getUTCMonth(), computed.getUTCDate() + days),
    );
    return day.toLocaleDateString("en-US", DAY_FORMAT);
}

/** "1 day" / "19 days". */
export const dayCount = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;
