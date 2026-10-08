import type { TimeseriesPoint } from "@/components/charts/timeseriesData";

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One point per day of the half-open window [startDate, endDate). A day without a served row is
 * `null` (a gap), never 0 and never joined to its neighbours. Returns the served rows unchanged
 * when the window is not a valid ISO day range.
 */
export function dailyWindowSeries(
    rows: ReadonlyArray<{ day: string; activeAnonymousUsers: number }>,
    startDate: string,
    endDate: string,
): TimeseriesPoint[] {
    const served = new Map(rows.map((row) => [row.day, row.activeAnonymousUsers]));
    const start = ISO_DAY.test(startDate) ? Date.parse(`${startDate}T00:00:00Z`) : Number.NaN;
    const end = ISO_DAY.test(endDate) ? Date.parse(`${endDate}T00:00:00Z`) : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return rows.map((row) => ({ day: row.day, value: row.activeAnonymousUsers }));
    }
    const days = new Set<string>();
    for (let t = start; t < end; t += DAY_MS) {
        days.add(new Date(t).toISOString().slice(0, 10));
    }
    // A served day outside the window stays visible instead of being dropped.
    for (const day of served.keys()) days.add(day);
    return [...days].map((day) => ({ day, value: served.get(day) ?? null }));
}
