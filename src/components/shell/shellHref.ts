import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";

export type ShellNavParams = {
    filters: MetricFilter;
    role?: string;
    lens?: string;
};

/**
 * A shell navigation link: the route plus the filter (`f`), `role` and `lens`
 * params, so scope and lens stay with the user across destinations.
 */
export function shellHref(path: string, { filters, role, lens }: ShellNavParams): string {
    const href = withFilterParam(path, filters, role);
    if (!lens) return href;
    // `withFilterParam` always writes a query string, so `&` is correct here.
    const [base, hash] = href.split("#", 2);
    const suffix = hash ? `#${hash}` : "";
    return `${base}&lens=${encodeURIComponent(lens)}${suffix}`;
}
