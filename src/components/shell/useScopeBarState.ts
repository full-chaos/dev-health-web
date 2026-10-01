"use client";

import { useCallback } from "react";

import type { FilterBarClientProps } from "@/components/filters/filterBarConfig";
import { useFilterBarState } from "@/components/filters/useFilterBarState";
import type { MetricFilter } from "@/lib/filters/types";

type ScopeBarStateProps = Pick<
    FilterBarClientProps,
    "view" | "tab" | "resolvedVisibility" | "resolvedScopeLock"
> & {
    /** `false`: no default `f` is written (a bar with no page filters). */
    writeDefaultFilter?: boolean;
};

/**
 * State of the scope bar: the filter state machine of the page filter bar
 * (`useFilterBarState`: URL sync on `f`, the default `f`, the scope lock, reset)
 * plus the scope actions the global context bar had (organization, team,
 * repository, window).
 *
 * One hook means one writer of `f` on the page. The encoding is not changed, so
 * existing links keep working.
 */
export function useScopeBarState(props: ScopeBarStateProps) {
    const state = useFilterBarState(props);
    const { filters, updateFilters } = state;

    const setScopeLevel = useCallback(
        (level: MetricFilter["scope"]["level"]) => {
            updateFilters({ ...filters, scope: { level, ids: [] } });
        },
        [filters, updateFilters],
    );

    const setWindow = useCallback(
        (days: number) => {
            const timeWithoutDates = { ...filters.time };
            delete timeWithoutDates.start_date;
            delete timeWithoutDates.end_date;
            updateFilters({
                ...filters,
                time: { ...timeWithoutDates, range_days: days, compare_days: days },
            });
        },
        [filters, updateFilters],
    );

    const selectTeams = useCallback(
        (next: string[]) => {
            updateFilters({ ...filters, scope: { level: "team", ids: next } });
        },
        [filters, updateFilters],
    );

    const selectRepos = useCallback(
        (next: string[]) => {
            updateFilters({ ...filters, what: { ...filters.what, repos: next } });
        },
        [filters, updateFilters],
    );

    const teamIds = filters.scope.level === "team" ? filters.scope.ids : [];

    return {
        ...state,
        selectRepos,
        selectTeams,
        setScopeLevel,
        setWindow,
        teamIds,
    };
}
