const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Convert a Date to a local date (midnight in local timezone)
 */
export const toLocalDate = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

/**
 * Format a Date as YYYY-MM-DD for use in date inputs
 */
export const formatDateInput = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Parse a date string (YYYY-MM-DD) into a Date object
 * Returns null if the input is invalid or represents an invalid date
 * (e.g., "2024-02-30" would be rejected)
 */
export const parseDateInput = (value: string) => {
  const parts = value.split("-");
  if (parts.length !== 3) {
    return null;
  }
  const [year, month, day] = parts.map((part) => Number(part));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

/**
 * Add a number of days to a date
 */
export const addDays = (value: Date, days: number) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);

/**
 * Calculate the number of days between two dates (inclusive)
 * Returns at least 1 day
 */
export const diffDaysInclusive = (start: Date, end: Date) => {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((endUtc - startUtc) / MS_PER_DAY) + 1);
};
