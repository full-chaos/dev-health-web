// Pre-created formatters for common use cases - avoids creating new instances on every call
const defaultFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Fallback cache for custom formatter options
const customFormatters = new Map<string, Intl.NumberFormat>();

const getFormatter = (options?: Intl.NumberFormatOptions): Intl.NumberFormat => {
  // Use pre-created formatters for common cases
  if (!options) {
    return defaultFormatter;
  }
  if (options.maximumFractionDigits === 0 && Object.keys(options).length === 1) {
    return integerFormatter;
  }
  if (options.notation === "compact") {
    return compactFormatter;
  }

  // Fallback to cached custom formatter for rare options
  const key = `${options.maximumFractionDigits ?? ""}:${options.notation ?? ""}`;
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
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(value), { maximumFractionDigits: 0 })}%`;
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
  return `${formatNumber(value)} ${unit}`.trim();
};

export const formatTimestamp = (value?: string | null) => {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }
  return timestampFormatter.format(date);
};
