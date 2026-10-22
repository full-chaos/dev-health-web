import type { MetricFilter } from "@/lib/filters/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDay(day: string): boolean {
    if (!ISO_DAY.test(day)) return false;
    const parsed = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day);
}

/**
 * Build the investment window from MetricFilter. A relative range is the N full
 * UTC days that end yesterday (inclusive): today's partial day is never read,
 * matching the server's endExclusive = min(end+1, today). Explicit dates pass
 * through, except an end later than yesterday is clamped to yesterday and a
 * start then after it is clamped to that end. Every investment reader (chart
 * and explain) uses this one.
 */
export function buildDateRange(filters: MetricFilter): {
    startDate: string;
    endDate: string;
} {
    const { start_date, end_date, range_days } = filters.time;

    const now = Date.now();
    const todayStart = now - (now % DAY_MS);
    const yesterday = new Date(todayStart - DAY_MS).toISOString().split("T")[0];

    if (start_date && end_date) {
        // URL params reach here unvalidated and may carry a time part: compare the date part.
        const endDay = end_date.slice(0, 10);
        if (!isCalendarDay(endDay) || endDay <= yesterday) {
            return { startDate: start_date, endDate: end_date };
        }
        const startDay = start_date.slice(0, 10);
        return {
            startDate: isCalendarDay(startDay) && startDay > yesterday ? yesterday : start_date,
            endDate: yesterday,
        };
    }

    const endDate = new Date(todayStart - DAY_MS);
    const startDate = new Date(endDate.getTime() - (range_days - 1) * DAY_MS);

    return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: yesterday,
    };
}
