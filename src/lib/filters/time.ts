import type { MetricFilter } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculates the number of days between two date strings.
 * Returns null if either date is missing or invalid.
 */
export const toRangeDays = (start?: string, end?: string): number | null => {
  if (!start || !end) {
    return null;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  const diffMs = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.max(1, Math.ceil(diffMs / MS_PER_DAY));
};

/**
 * Applies a time window to a MetricFilter, recalculating range_days if needed.
 * Returns the original filter if no window parameters are provided.
 */
export const applyWindowToFilters = (
  filters: MetricFilter,
  windowStart?: string,
  windowEnd?: string
): MetricFilter => {
  if (!windowStart && !windowEnd) {
    return filters;
  }
  const rangeDays = toRangeDays(windowStart, windowEnd);
  return {
    ...filters,
    time: {
      ...filters.time,
      start_date: windowStart ?? filters.time.start_date,
      end_date: windowEnd ?? filters.time.end_date,
      range_days: rangeDays ?? filters.time.range_days,
    },
  };
};
