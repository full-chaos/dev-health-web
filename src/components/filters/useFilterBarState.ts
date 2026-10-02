"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { addDays, formatDateInput, parseDateInput, toLocalDate } from "@/lib/dateUtils";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam, filterFromQueryParams } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";
import { type FilterBarClientProps, resolveScopeLock, resolveVisibility } from "./filterBarConfig";
import { DATE_PRESETS, formatSelection, scopeLabelMap } from "./filterBarUtils";
import { useFilterOptions } from "./useFilterOptions";

// Two-pass hydration guard — see components/ClientTimestamp.tsx and
// components/people/PersonRangeBar.tsx for the same pattern. Gates
// wall-clock reads (`new Date()`) so SSR and the first client render emit
// identical markup, preventing hydration attribute/text mismatches.
// Ref: https://react.dev/reference/react-dom/client/hydrateRoot#hydrating-server-rendered-html
const subscribe = () => () => {};
const getIsClientSnapshot = () => true;
const getServerSnapshot = () => false;

type FilterBarStateProps = Pick<
    FilterBarClientProps,
    "view" | "tab" | "resolvedVisibility" | "resolvedScopeLock"
> & {
    /**
     * `false`: the bar does not write a default `f`. With no `f` in the URL the
     * filter comes from the query params, as the pages read it (organization
     * level), and the URL is not changed. The global context bar worked this
     * way on a page that had no page filter bar.
     */
    writeDefaultFilter?: boolean;
};

const filterFromQuery = (query: string) =>
    filterFromQueryParams(Object.fromEntries(new URLSearchParams(query)));

export function useFilterBarState({
    view,
    tab,
    resolvedVisibility,
    resolvedScopeLock,
    writeDefaultFilter = true,
}: FilterBarStateProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const isClient = useSyncExternalStore(subscribe, getIsClientSnapshot, getServerSnapshot);

    const encoded = searchParams.get("f");
    // Only the mode with no default `f` reads the other query params.
    const queryWithoutFilter = !encoded && !writeDefaultFilter ? searchParams.toString() : null;
    const initialFilters = useMemo(
        () =>
            queryWithoutFilter === null
                ? decodeFilter(encoded)
                : filterFromQuery(queryWithoutFilter),
        [encoded, queryWithoutFilter],
    );
    const [filters, setFilters] = useState<MetricFilter>(initialFilters);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const barRef = useRef<HTMLElement | null>(null);
    const didSetDefaultRef = useRef(false);
    const queryParam = searchParams.get("q") ?? "";
    const [peopleQuery, setPeopleQuery] = useState(queryParam);
    const options = useFilterOptions();

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- filters mirror URL-derived initial state.
        setFilters(initialFilters);
    }, [initialFilters]);

    useEffect(() => {
        if (writeDefaultFilter && !encoded && !didSetDefaultRef.current) {
            didSetDefaultRef.current = true;
            const params = new URLSearchParams(searchParams.toString());
            params.set("f", encodeFilterParam(defaultMetricFilter));
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }
    }, [encoded, pathname, router, searchParams, writeDefaultFilter]);

    useEffect(() => {
        if (view !== "people") {
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- people query mirrors the q search parameter.
        setPeopleQuery(queryParam);
    }, [queryParam, view]);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!openMenu) {
                return;
            }

            const target = event.target;
            if (barRef.current && target instanceof Node && !barRef.current.contains(target)) {
                setOpenMenu(null);
            }
        };

        window.addEventListener("mousedown", handleClick);
        return () => {
            window.removeEventListener("mousedown", handleClick);
        };
    }, [openMenu]);

    const updateUrl = useCallback(
        (nextFilters: MetricFilter) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("f", encodeFilterParam(nextFilters));
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    const updateFilters = useCallback(
        (nextFilters: MetricFilter) => {
            setFilters(nextFilters);
            updateUrl(nextFilters);
        },
        [updateUrl],
    );

    const updatePeopleQuery = useCallback(
        (nextQuery: string) => {
            setPeopleQuery(nextQuery);
            const params = new URLSearchParams(searchParams.toString());
            if (nextQuery.trim()) {
                params.set("q", nextQuery);
            } else {
                params.delete("q");
            }
            params.set("f", encodeFilterParam(filters));
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [filters, pathname, router, searchParams],
    );

    const resetFilters = useCallback(() => {
        if (!writeDefaultFilter) {
            // Back to the first-load state of this mode: no `f` in the URL.
            const params = new URLSearchParams(searchParams.toString());
            params.delete("f");
            const query = params.toString();
            setFilters(filterFromQuery(query));
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
            return;
        }

        if (view === "people") {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("q");
            params.set("f", encodeFilterParam(defaultMetricFilter));
            setFilters(defaultMetricFilter);
            setPeopleQuery("");
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
            return;
        }

        updateFilters(defaultMetricFilter);
    }, [pathname, router, searchParams, updateFilters, view, writeDefaultFilter]);

    const copyFilters = useCallback(async () => {
        const payload = JSON.stringify(filters, null, 2);
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(payload);
        }
    }, [filters]);

    const handleDatePreset = useCallback(
        (days: number) => {
            const nextEnd = toLocalDate(new Date());
            const nextStart = addDays(nextEnd, -(days - 1));
            updateFilters({
                ...filters,
                time: {
                    ...filters.time,
                    range_days: days,
                    compare_days: days,
                    start_date: formatDateInput(nextStart),
                    end_date: formatDateInput(nextEnd),
                },
            });
        },
        [filters, updateFilters],
    );

    const visibility = resolvedVisibility ?? resolveVisibility(view, tab);
    const allowAdvanced = view !== "people";
    const scopeLock = resolvedScopeLock !== undefined ? resolvedScopeLock : resolveScopeLock(view);
    const scopeLevel = scopeLock ?? filters.scope.level;
    const effectiveScopeIds =
        scopeLock && filters.scope.level !== scopeLock ? [] : filters.scope.ids;

    useEffect(() => {
        if (!scopeLock || filters.scope.level === scopeLock) {
            return;
        }

        const nextFilters = {
            ...filters,
            scope: { ...filters.scope, level: scopeLock, ids: [] },
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- scope lock enforces URL/filter consistency.
        setFilters(nextFilters);
        updateUrl(nextFilters);
    }, [filters, scopeLock, updateUrl]);

    const scopeOptions = useMemo(() => {
        if (scopeLevel === "team") {
            return options.teams;
        }
        if (scopeLevel === "repo") {
            return options.repos;
        }
        if (scopeLevel === "developer") {
            return options.developers;
        }
        if (scopeLevel === "service") {
            return options.services;
        }
        return [];
    }, [scopeLevel, options]);

    const developers = filters.who.developers ?? [];
    const repos = filters.what.repos ?? [];
    const workCategory = filters.why.work_category ?? [];

    const scopeLabel = scopeLabelMap[scopeLevel] ?? "Team";
    const scopeEmptyLabel = scopeLevel === "team" ? "All Teams" : "All";
    const scopeValue = formatSelection(effectiveScopeIds, scopeEmptyLabel);
    const safeRangeDays = Math.max(1, filters.time.range_days);
    const today = toLocalDate(new Date());
    const parsedStart = filters.time.start_date ? parseDateInput(filters.time.start_date) : null;
    const parsedEnd = filters.time.end_date ? parseDateInput(filters.time.end_date) : null;
    const resolvedEnd = toLocalDate(parsedEnd ?? today);
    const resolvedStart = toLocalDate(parsedStart ?? addDays(resolvedEnd, -(safeRangeDays - 1)));
    const startDate = resolvedStart > resolvedEnd ? resolvedEnd : resolvedStart;
    const endDate = resolvedStart > resolvedEnd ? resolvedStart : resolvedEnd;
    // When the URL doesn't pin both dates, startDate/endDate derive from
    // `new Date()` — server and client would disagree. Keep `dateValue` empty
    // until mounted so the custom-range button label hydrates cleanly.
    const datesFromWallClock = !filters.time.start_date || !filters.time.end_date;
    const dateValue =
        !isClient && datesFromWallClock
            ? ""
            : `${formatDateInput(startDate)} - ${formatDateInput(endDate)}`;
    const isCustomDateRange = !DATE_PRESETS.some(
        (preset) => preset.days === filters.time.range_days,
    );

    return {
        allowAdvanced,
        barRef,
        copyFilters,
        dateValue,
        developers,
        effectiveScopeIds,
        endDate,
        filters,
        handleDatePreset,
        isCustomDateRange,
        openMenu,
        options,
        peopleQuery,
        repos,
        resetFilters,
        scopeEmptyLabel,
        scopeLabel,
        scopeLevel,
        scopeLock,
        scopeOptions,
        scopeValue,
        setOpenMenu,
        setShowAdvanced,
        showAdvanced,
        startDate,
        updateFilters,
        updatePeopleQuery,
        visibility,
        workCategory,
    };
}
