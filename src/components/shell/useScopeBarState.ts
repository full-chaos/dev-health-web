"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { FilterBarClientProps } from "@/components/filters/filterBarConfig";
import { useFilterBarState } from "@/components/filters/useFilterBarState";
import type { MetricFilter } from "@/lib/filters/types";

type ScopeBarStateProps = Pick<
    FilterBarClientProps,
    "view" | "tab" | "resolvedVisibility" | "resolvedScopeLock"
>;

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
    const [copyFallbackUrl, setCopyFallbackUrl] = useState<string | null>(null);

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

    /**
     * Copy the page URL with its state (`f`, `role`, `lens`, …). When the
     * clipboard is not available the URL is shown in a field instead: the action
     * is never a silent no-op.
     */
    const copyLink = useCallback(async () => {
        const url = window.location.href;
        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error("clipboard unavailable");
            }
            await navigator.clipboard.writeText(url);
            setCopyFallbackUrl(null);
            toast.success("Link copied");
        } catch {
            setCopyFallbackUrl(url);
        }
    }, []);

    const dismissCopyFallback = useCallback(() => setCopyFallbackUrl(null), []);

    const teamIds = filters.scope.level === "team" ? filters.scope.ids : [];

    return {
        ...state,
        copyFallbackUrl,
        copyLink,
        dismissCopyFallback,
        selectRepos,
        selectTeams,
        setScopeLevel,
        setWindow,
        teamIds,
    };
}
