import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

const toBase64Url = (value: string) => {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf-8").toString("base64url");
  }
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string) => {
  if (typeof window === "undefined") {
    return Buffer.from(value, "base64url").toString("utf-8");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return decodeURIComponent(escape(atob(padded)));
};

const stableStringify = (input: unknown): string => {
  if (Array.isArray(input)) {
    return `[${input.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(input);
};

export const encodeFilter = (filters: MetricFilter) => {
  const serialized = stableStringify(filters);
  return toBase64Url(serialized);
};

export const decodeFilter = (encoded?: string | null): MetricFilter => {
  if (!encoded) {
    return defaultMetricFilter;
  }
  try {
    const decoded = fromBase64Url(encoded);
    const parsed = JSON.parse(decoded) as MetricFilter;
    return {
      ...defaultMetricFilter,
      ...parsed,
      time: { ...defaultMetricFilter.time, ...parsed.time },
      scope: { ...defaultMetricFilter.scope, ...parsed.scope },
      who: { ...defaultMetricFilter.who, ...parsed.who },
      what: { ...defaultMetricFilter.what, ...parsed.what },
      why: { ...defaultMetricFilter.why, ...parsed.why },
      how: { ...defaultMetricFilter.how, ...parsed.how },
    };
  } catch {
    return defaultMetricFilter;
  }
};

export const encodeFilterParam = (filters: MetricFilter) => {
  return encodeFilter(filters);
};

export const filterFromQueryParams = (
  params: Record<string, string | string[] | undefined>
): MetricFilter => {
  const scopeType = (params.scope_type as MetricFilter["scope"]["level"]) ?? "org";
  const scopeId = (params.scope_id as string) ?? "";
  const rangeDays = Number(
    (params.range_days as string) ?? defaultMetricFilter.time.range_days
  );
  const compareDays = Number(
    (params.compare_days as string) ?? defaultMetricFilter.time.compare_days
  );

  return {
    ...defaultMetricFilter,
    time: {
      range_days: Number.isNaN(rangeDays) ? defaultMetricFilter.time.range_days : rangeDays,
      compare_days: Number.isNaN(compareDays) ? defaultMetricFilter.time.compare_days : compareDays,
    },
    scope: {
      level: scopeType,
      ids: scopeId ? [scopeId] : [],
    },
  };
};
