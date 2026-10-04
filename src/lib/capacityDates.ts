/**
 * Days of a capacity forecast (CHAOS-8477).
 *
 * The API works in UTC calendar days: the percentile dates are "the day the forecast was computed
 * plus N days", and a bin of `completionDistribution.days` is a number of days after that same day.
 * These helpers keep that rule: a served date is shown as the calendar day it names, and a day
 * offset is turned into its date with the API's own arithmetic. No value is made here.
 *
 * One date rule for the page (CHAOS-8556): a day in another calendar year than today (as a UTC
 * day) shows its year, "Jan 31, 2027". A day one year ahead with no year reads as a day of this
 * year.
 */

/** The format of a UTC day: "Jun 20", or "Jun 20, 2027" when the day is not in this year. */
export function dayFormat(day: Date): Intl.DateTimeFormatOptions {
    const thisYear = day.getUTCFullYear() === new Date().getUTCFullYear();
    return {
        month: "short",
        day: "numeric",
        ...(thisYear ? {} : { year: "numeric" }),
        timeZone: "UTC",
    };
}

/** "Jun 20" for the served date "2026-06-20": the calendar day as served, in any time zone. */
export function formatServedDay(isoDate: string): string | null {
    const date = new Date(isoDate);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-US", dayFormat(date));
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
    return day.toLocaleDateString("en-US", dayFormat(day));
}

/** "1 day" / "19 days". */
export const dayCount = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;
