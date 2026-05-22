import { AI_BUCKETS } from "@/components/ai/utils";
import { isServer } from "@/lib/env";
import type { MetricFilter } from "@/lib/filters/types";
import type { AiAttributionBucketInput } from "@/lib/graphql/__generated__/types";

type AIAttributionBucket = AiAttributionBucketInput;

export type AIFilter = {
  startDate: string;
  endDate: string;
  teamId?: string;
  repoId?: string;
  workType?: string;
  buckets?: AIAttributionBucket[];
};

const ALLOWED_KEYS = new Set(["startDate", "endDate", "teamId", "repoId", "workType", "buckets"]);
const BUCKETS = new Set<string>(AI_BUCKETS);

// Next.js polyfills `Buffer` in the browser bundle, but the polyfill does
// NOT support the `base64url` encoding (Node 16+ only). Falling back to a
// `typeof Buffer !== "undefined"` check would crash the client at runtime
// with `TypeError: Unknown encoding: base64url`. Use the canonical
// `isServer` flag instead, matching `src/lib/filters/encode.ts`.
const toBase64Url = (value: string): string => {
  if (isServer) {
    return Buffer.from(value, "utf-8").toString("base64url");
  }
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string): string => {
  if (isServer) {
    return Buffer.from(value, "base64url").toString("utf-8");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return decodeURIComponent(escape(atob(padded)));
};

const stableStringify = (input: unknown): string => {
  if (Array.isArray(input)) return `[${input.map((item) => stableStringify(item)).join(",")}]`;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(input);
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function defaultAIFilter(): AIFilter {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

export function encodeAIFilter(filter: AIFilter): string {
  return toBase64Url(stableStringify(filter));
}

export function decodeAIFilter(encoded?: string | null): AIFilter {
  if (!encoded) return defaultAIFilter();

  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Record<string, unknown>;
    const clean: Partial<AIFilter> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (!ALLOWED_KEYS.has(key)) continue;
      if ((key === "startDate" || key === "endDate" || key === "teamId" || key === "repoId" || key === "workType") && typeof value === "string") {
        clean[key] = value;
      }
      if (key === "buckets" && Array.isArray(value)) {
        clean.buckets = value.filter((item): item is AIAttributionBucket => typeof item === "string" && BUCKETS.has(item));
      }
    }

    return { ...defaultAIFilter(), ...clean };
  } catch {
    return defaultAIFilter();
  }
}

export const encodeAIFilterParam = encodeAIFilter;

/**
 * Derive an {@link AIFilter} from the canonical {@link MetricFilter} used by
 * the global FilterBar. The AI surfaces (Impact, Review Load, Automations,
 * Risk) consume `AIFilter` internally, but their URL state is now driven by
 * the canonical filter so they share the same chrome as the rest of the app.
 *
 * Mapping:
 * - startDate/endDate <- time.start_date/time.end_date (custom range) or a
 *   window of `time.range_days` ending today (preset).
 * - teamId  <- scope.ids[0] when scope.level === "team".
 * - repoId  <- what.repos[0].
 * - workType<- why.work_category[0].
 * - buckets <- left undefined (FilterBar does not expose buckets; dashboards
 *   manage attribution drill-downs internally).
 */
export function metricFilterToAIFilter(metric: MetricFilter): AIFilter {
  const fallback = defaultAIFilter();

  let startDate = fallback.startDate;
  let endDate = fallback.endDate;
  if (metric.time?.start_date && metric.time?.end_date) {
    startDate = metric.time.start_date;
    endDate = metric.time.end_date;
  } else if (typeof metric.time?.range_days === "number" && metric.time.range_days > 0) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (metric.time.range_days - 1));
    startDate = isoDate(start);
    endDate = isoDate(end);
  }

  const teamId =
    metric.scope?.level === "team" && metric.scope.ids?.length
      ? metric.scope.ids[0]
      : undefined;
  const repoId = metric.what?.repos?.[0];
  const workType = metric.why?.work_category?.[0];

  return {
    startDate,
    endDate,
    ...(teamId ? { teamId } : {}),
    ...(repoId ? { repoId } : {}),
    ...(workType ? { workType } : {}),
  };
}
