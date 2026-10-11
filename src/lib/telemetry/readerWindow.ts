const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const parseDate = (value?: string) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Reader window for product telemetry. The backend takes calendar dates with
 * the start inclusive and the end EXCLUSIVE (`occurred_at < end`). So the
 * default end is tomorrow (UTC): that makes today, up to the present moment,
 * part of the window. The default start stays 30 days before today (UTC).
 * Explicit `startDate`/`endDate` values pass through unchanged.
 */
export function resolveReaderWindow(
    params: { startDate?: string; endDate?: string },
    now: Date = new Date(),
): { start: string; end: string } {
    const explicitEnd = parseDate(params.endDate);
    const end = explicitEnd ?? new Date(now.getTime() + DAY_MS);
    const explicitStart = parseDate(params.startDate);
    const start = explicitStart ?? new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    return { start: isoDate(start), end: isoDate(end) };
}
