// Cached formatters for better performance - avoid creating new instances on every call
const cachedFormatters = new Map<string, Intl.NumberFormat>();
const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const getCachedFormatter = (options?: Intl.NumberFormatOptions): Intl.NumberFormat => {
  const key = JSON.stringify(options ?? {});
  let formatter = cachedFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 1,
      ...options,
    });
    cachedFormatters.set(key, formatter);
  }
  return formatter;
};

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => {
  return getCachedFormatter(options).format(value);
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
