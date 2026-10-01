import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";

export type ShellNavParams = {
    filters: MetricFilter;
    role?: string;
    lens?: string;
    /** Where the user came from (`origin` param). Carried by the trail links only. */
    origin?: string;
};

/**
 * A shell navigation link: the route plus the filter (`f`), `role` and `lens`
 * params, so scope and lens stay with the user across destinations. Pass
 * `withOrigin` for a return link (the trail): it also carries `origin`, as the
 * in-page "Back to {area}" links did.
 */
export function shellHref(
    path: string,
    { filters, role, lens, origin }: ShellNavParams,
    { withOrigin = false }: { withOrigin?: boolean } = {},
): string {
    const href = withFilterParam(path, filters, role, withOrigin ? origin : undefined);
    if (!lens) return href;
    // `withFilterParam` always writes a query string, so `&` is correct here.
    const [base, hash] = href.split("#", 2);
    const suffix = hash ? `#${hash}` : "";
    return `${base}&lens=${encodeURIComponent(lens)}${suffix}`;
}
