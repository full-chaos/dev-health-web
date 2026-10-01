/**
 * ScopeBar — server wrapper of the one scope bar (organization, team,
 * repository, window, and the advanced filters in a drawer).
 *
 * As the page filter bar does, it resolves the static configuration for the
 * `view` on the server and gives it to the interactive client part. The client
 * part reads `useSearchParams()`, so it sits inside a Suspense boundary.
 */
import { Suspense } from "react";

import type { FilterBarView } from "@/components/filters/filterBarConfig";

import { ScopeBarClient } from "./ScopeBarClient";
import { resolveScopeBarConfig } from "./scopeBarConfig";

type ScopeBarProps = {
    view?: FilterBarView;
    tab?: string;
    origin?: string | null;
    orgName?: string;
    /**
     * `false` for a page that had the global context bar alone: the scope row
     * and the actions, with no filter drawer, no scope lock and no default `f`.
     */
    pageFilters?: boolean;
};

export function ScopeBar({ view, tab, origin, orgName, pageFilters }: ScopeBarProps) {
    const { resolvedVisibility, resolvedScopeLock, writeDefaultFilter } = resolveScopeBarConfig(
        view,
        tab,
        pageFilters,
    );

    return (
        <Suspense
            fallback={<div className="h-14 animate-pulse rounded-(--radius-md) bg-(--surface)" />}
        >
            <ScopeBarClient
                view={view}
                tab={tab}
                resolvedVisibility={resolvedVisibility}
                resolvedScopeLock={resolvedScopeLock}
                writeDefaultFilter={writeDefaultFilter}
                origin={origin}
                orgName={orgName}
            />
        </Suspense>
    );
}
