"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";
import { DEFAULT_ROLE, getLensFromSearchParams } from "@/lib/lensContext";

import type { ShellNavParams } from "./shellHref";
import { shellRouteForPathname } from "./shellRoutes";

/**
 * The params every shell navigation link carries, read from the live URL.
 *
 * A layout does not receive `searchParams` and does not re-render on a client
 * navigation, so the shell reads them on the client. This keeps the links in
 * step with `router.replace` (a filter change on the page).
 *
 * - `filters`: the `f` param, else the legacy query params (as the pages do).
 * - `lens`: carried verbatim when the URL has it.
 * - `role`: carried verbatim when the URL has it. A route registered with
 *   `defaultRole` always gets the resolved role instead (lens first, then
 *   `role`, then the default role), which is what its page-level navigation did.
 */
export function useShellNavParams(pathname: string): ShellNavParams {
    const searchParams = useSearchParams();

    return useMemo(() => {
        const encoded = searchParams.get("f");
        const legacyParams: Record<string, string> = {};
        searchParams.forEach((value, key) => {
            legacyParams[key] = value;
        });
        const filters: MetricFilter = encoded
            ? decodeFilter(encoded)
            : filterFromQueryParams(legacyParams);

        const lens = searchParams.get("lens") || undefined;
        const urlRole = searchParams.get("role") || undefined;

        let role = urlRole;
        if (shellRouteForPathname(pathname)?.defaultRole) {
            const activeLens = getLensFromSearchParams(searchParams) ?? "neutral";
            role = activeLens === "neutral" ? DEFAULT_ROLE : activeLens;
        }

        return { filters, role, lens };
    }, [pathname, searchParams]);
}
