"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { toggleValue } from "@/components/filters/filterBarUtils";
import { QuickFilterMenu } from "@/components/filters/sections/QuickFilterMenu";
import { useFilterOptions } from "@/components/filters/useFilterOptions";
import { encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

const WINDOW_OPTIONS = [7, 14, 30, 90] as const;

/** Neutral fallback shown while the org name resolves — never a tenant name. */
const ORG_FALLBACK = "Organization";

type GlobalContextBarClientProps = {
    filters: MetricFilter;
    origin?: string | null;
    /** Optional override; when omitted the name is derived from the session. */
    orgName?: string;
};

type OrganizationOption = {
    id: string;
    name: string;
};

type OrganizationsResponse = {
    active_org_id?: string | null;
    organizations?: OrganizationOption[];
};

const formatSelection = (values: string[] | undefined, emptyLabel: string) => {
    if (!values?.length) return emptyLabel;
    if (values.length === 1) return values[0];
    return `${values.length} selected`;
};

export function GlobalContextBarClient({ filters, origin, orgName }: GlobalContextBarClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { data: session } = useSession();

    // Team/Repo option lists come from the SAME source the page FilterBar uses
    // (`/api/v1/filters/options`), so the global bar always offers identical
    // choices instead of hardcoding lists.
    const options = useFilterOptions();
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const barRef = useRef<HTMLElement | null>(null);

    // Derive the active org name from the auth session rather than hardcoding a
    // tenant. The org id lives on the session; the display name is resolved via
    // the same endpoint the OrgSwitcher uses. A caller-supplied `orgName` wins.
    const [resolvedOrgName, setResolvedOrgName] = useState<string | null>(orgName ?? null);
    const sessionOrgId = session?.user?.org_id;

    useEffect(() => {
        if (orgName) return;
        if (!sessionOrgId) return;
        let ignore = false;
        async function loadOrgName() {
            try {
                const response = await fetch("/api/auth/organizations", {
                    cache: "no-store",
                });
                if (!response.ok) return;
                const data = (await response.json()) as OrganizationsResponse;
                const activeId = data.active_org_id ?? sessionOrgId;
                const match = data.organizations?.find((org) => org.id === activeId);
                if (!ignore && match?.name) setResolvedOrgName(match.name);
            } catch {
                // Network/backend unavailable — keep the neutral fallback.
            }
        }
        loadOrgName();
        return () => {
            ignore = true;
        };
    }, [orgName, sessionOrgId]);

    // Close the open selector when clicking outside the bar — mirrors the
    // FilterBar's `useFilterBarState` outside-click behaviour.
    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!openMenu) return;
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

    const orgLabel = orgName ?? resolvedOrgName ?? ORG_FALLBACK;

    const updateFilters = useCallback(
        (nextFilters: MetricFilter) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("f", encodeFilterParam(nextFilters));
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    const setScopeLevel = useCallback(
        (level: MetricFilter["scope"]["level"]) => {
            updateFilters({
                ...filters,
                scope: { level, ids: [] },
            });
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
                time: {
                    ...timeWithoutDates,
                    range_days: days,
                    compare_days: days,
                },
            });
        },
        [filters, updateFilters],
    );

    const selectTeam = useCallback(
        (next: string[]) => {
            updateFilters({
                ...filters,
                scope: { level: "team", ids: next },
            });
        },
        [filters, updateFilters],
    );

    const selectRepos = useCallback(
        (next: string[]) => {
            updateFilters({
                ...filters,
                what: { ...filters.what, repos: next },
            });
        },
        [filters, updateFilters],
    );

    const teamIds = filters.scope.level === "team" ? filters.scope.ids : [];
    const teamLabel = formatSelection(teamIds, "All");
    const repos = filters.what.repos ?? [];
    const repoLabel = formatSelection(repos, "All");
    const isOrgScope = filters.scope.level === "org";

    return (
        <section
            ref={barRef}
            aria-label="Global context"
            data-testid="global-context-bar"
            className="rounded-2xl border border-(--card-stroke) bg-(--card-90)/80 px-4 py-3 text-xs backdrop-blur-sm"
        >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                        Org
                    </span>
                    <button
                        type="button"
                        onClick={() => setScopeLevel("org")}
                        className={`rounded-full border px-3 py-1.5 font-medium transition-colors ${
                            isOrgScope
                                ? "border-(--accent-2) bg-(--accent-2)/15 text-foreground"
                                : "border-(--card-stroke) bg-(--card-80) text-(--ink-muted) hover:text-foreground"
                        }`}
                    >
                        {orgLabel}
                    </button>
                </div>

                <span aria-hidden="true" className="text-(--ink-muted)/60">
                    ·
                </span>

                <QuickFilterMenu
                    active={teamIds}
                    emptyLabel="All Teams"
                    items={options.teams}
                    label="Team"
                    menuKey="team"
                    onChange={selectTeam}
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    toggleValue={toggleValue}
                    value={teamLabel}
                />

                <span aria-hidden="true" className="text-(--ink-muted)/60">
                    ·
                </span>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                        Window
                    </span>
                    <div className="flex rounded-full border border-(--card-stroke) bg-(--card-80) p-1">
                        {WINDOW_OPTIONS.map((days) => {
                            const active = filters.time.range_days === days;
                            return (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => setWindow(days)}
                                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                                        active
                                            ? "bg-(--accent) text-white"
                                            : "text-(--ink-muted) hover:text-foreground"
                                    }`}
                                >
                                    {days}d
                                </button>
                            );
                        })}
                    </div>
                </div>

                <span aria-hidden="true" className="text-(--ink-muted)/60">
                    ·
                </span>

                <QuickFilterMenu
                    active={repos}
                    emptyLabel="All"
                    items={options.repos}
                    label="Repo"
                    menuKey="repo"
                    onChange={selectRepos}
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    toggleValue={toggleValue}
                    value={repoLabel}
                />

                {origin ? (
                    <div className="ml-auto flex items-center gap-2 text-xs text-(--ink-muted)">
                        <span className="uppercase tracking-[0.18em]">Origin</span>
                        <span className="font-medium text-foreground">{origin}</span>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
