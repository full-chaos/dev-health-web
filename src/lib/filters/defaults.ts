import type { MetricFilter } from "@/lib/filters/types";

export const defaultMetricFilter: MetricFilter = {
  time: {
    range_days: 14,
    compare_days: 14,
  },
  scope: {
    level: "org",
    ids: [],
  },
  who: {},
  what: {},
  why: {},
  how: {},
};
