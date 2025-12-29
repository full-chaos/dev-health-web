import { encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

export const buildExploreUrl = (options: {
  metric?: string;
  api?: string;
  filters: MetricFilter;
}) => {
  const params = new URLSearchParams();
  if (options.metric) {
    params.set("metric", options.metric);
  }
  if (options.api) {
    params.set("api", options.api);
  }
  params.set("f", encodeFilterParam(options.filters));
  return `/explore?${params.toString()}`;
};

export const withFilterParam = (path: string, filters: MetricFilter) => {
  const params = new URLSearchParams();
  params.set("f", encodeFilterParam(filters));
  if (path.includes("?")) {
    return `${path}&${params.toString()}`;
  }
  return `${path}?${params.toString()}`;
};
