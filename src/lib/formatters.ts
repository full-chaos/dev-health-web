// Pre-created formatters for common use cases - avoids creating new instances on every call
export const defaultFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
});
export const integerFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
});
export const compactFormatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
});
// Build timestamp strings manually via formatToParts to avoid hydration
// mismatches — Node and browsers disagree on literal separators
// (e.g. "Feb 8, 12:19 PM" vs "Feb 8 at 12:19 PM").
const _tsParts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

const ISO_DATETIME_WITHOUT_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/;

export const parseTimestampDate = (value: string | null | undefined): Date | null => {
    if (!value) return null;
    const normalizedValue = ISO_DATETIME_WITHOUT_TIMEZONE.test(value) ? `${value}Z` : value;
    const date = new Date(normalizedValue);
    return Number.isNaN(date.getTime()) ? null : date;
};

// Fallback cache for custom formatter options - exported for testing
export const customFormatters = new Map<string, Intl.NumberFormat>();

export const getFormatter = (options?: Intl.NumberFormatOptions): Intl.NumberFormat => {
    // Use pre-created formatters for common cases
    if (!options) {
        return defaultFormatter;
    }
    if (options.maximumFractionDigits === 0 && Object.keys(options).length === 1) {
        return integerFormatter;
    }
    if (
        options.notation === "compact" &&
        (options.maximumFractionDigits === undefined || options.maximumFractionDigits === 1) &&
        Object.keys(options).filter((k) => k !== "notation" && k !== "maximumFractionDigits")
            .length === 0
    ) {
        return compactFormatter;
    }

    // Fallback to cached custom formatter for any other options
    const key = JSON.stringify(options);
    let formatter = customFormatters.get(key);
    if (!formatter) {
        formatter = new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 1,
            ...options,
        });
        customFormatters.set(key, formatter);
    }
    return formatter;
};

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => {
    return getFormatter(options).format(value);
};

export const formatPercent = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: 0 })}%`;

export const formatDelta = (value: number) => {
    const rounded = Math.round(value);
    const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
    return `${sign}${formatNumber(Math.abs(rounded), { maximumFractionDigits: 0 })}%`;
};

export const formatMetricValue = (value: number, unit: string) => {
    if (unit === "%") {
        return formatPercent(value);
    }
    if (unit === "days") {
        return `${formatNumber(value, { maximumFractionDigits: 1 })}d`;
    }
    if (unit === "hours") {
        return `${formatNumber(value, { maximumFractionDigits: 0 })}h`;
    }
    if (unit === "loc") {
        return formatNumber(value, { notation: "compact" });
    }
    // Duration values are expressed in minutes by the time they reach the
    // formatter (the fetcher normalises seconds→minutes for real data; sample
    // data is already in minutes). The formatter only labels the unit.
    if (unit === "m") {
        return `${formatNumber(value, { maximumFractionDigits: 1 })}m`;
    }
    return `${formatNumber(value)} ${unit}`.trim();
};

export const formatTimestamp = (value?: string | null, fallback = "Unavailable") => {
    const date = parseTimestampDate(value);
    if (!date) return fallback;
    const parts = _tsParts.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("month")} ${get("day")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
};

/**
 * Date-only formatter locked to UTC (CHAOS-2791 D3): avoids hydration/CI
 * drift from bare toLocaleDateString() calls that pick up the runtime's
 * local timezone. Shared by SyncJobHistory and SyncCoverageTimeline so the
 * two coverage surfaces never drift apart on date-only formatting.
 */
export const formatDateUTC = (value: string | null | undefined): string => {
    const date = parseTimestampDate(value);
    if (!date) return "—";
    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    });
};

/**
 * Full date + time formatter locked to UTC (CHAOS-2843): audit-log
 * timestamps must be unambiguous and deterministic across server/client
 * rendering, so this never falls back to a bare `toLocaleString()` call.
 * Appends an explicit `UTC` marker so investigators never misread the
 * offset.
 */
export const formatDateTimeUTC = (value: string | null | undefined): string => {
    const date = parseTimestampDate(value);
    if (!date) return "—";
    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
    });
};
