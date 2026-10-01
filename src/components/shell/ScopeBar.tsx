/**
 * ScopeBar — server wrapper of the one scope bar (organization, team,
 * repository, window, and the advanced filters in a drawer).
 *
 * As the page filter bar does, it resolves the static configuration for the
 * `view` on the server and gives it to the interactive client part. The client
 * part reads `useSearchParams()`, so it sits inside a Suspense boundary.
 */
import { Suspense } from "react";

import {
    type FilterBarView,
    resolveScopeLock,
    resolveVisibility,
} from "@/components/filters/filterBarConfig";

import { ScopeBarClient } from "./ScopeBarClient";

type ScopeBarProps = {
    view?: FilterBarView;
    tab?: string;
    origin?: string | null;
    orgName?: string;
};

export function ScopeBar({ view, tab, origin, orgName }: ScopeBarProps) {
    // Scope, dates and repositories are in the bar's row, as they were in the
    // global context bar. The drawer holds the page filters only.
    const resolvedVisibility = {
        ...resolveVisibility(view, tab),
        scope: false,
        date: false,
        repo: false,
    };

    return (
        <Suspense
            fallback={<div className="h-14 animate-pulse rounded-(--radius-md) bg-(--surface)" />}
        >
            <ScopeBarClient
                view={view}
                tab={tab}
                resolvedVisibility={resolvedVisibility}
                resolvedScopeLock={resolveScopeLock(view)}
                origin={origin}
                orgName={orgName}
            />
        </Suspense>
    );
}
