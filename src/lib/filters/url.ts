import { encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

export const buildExploreUrl = (options: {
    metric?: string;
    api?: string;
    filters: MetricFilter;
    role?: string;
    origin?: string;
}) => {
    const params = new URLSearchParams();
    if (options.metric) {
        params.set("metric", options.metric);
    }
    if (options.api) {
        params.set("api", options.api);
    }
    if (options.role) {
        params.set("role", options.role);
    }
    if (options.origin) {
        params.set("origin", options.origin);
    }
    params.set("f", encodeFilterParam(options.filters));
    return `/explore?${params.toString()}`;
};

export const withFilterParam = (
    path: string,
    filters: MetricFilter,
    role?: string,
    origin?: string,
) => {
    const [pathWithoutHash, hash] = path.split("#", 2);
    const params = new URLSearchParams();
    params.set("f", encodeFilterParam(filters));
    if (role) {
        params.set("role", role);
    }
    if (origin) {
        params.set("origin", origin);
    }
    const suffix = hash ? `#${hash}` : "";
    if (pathWithoutHash.includes("?")) {
        return `${pathWithoutHash}&${params.toString()}${suffix}`;
    }
    return `${pathWithoutHash}?${params.toString()}${suffix}`;
};
