"use client";

import { type ReactNode, useRef, useState } from "react";

import { isFilterRead, type FilterBarClientProps } from "@/components/filters/filterBarConfig";
import { formatSelection, toggleValue } from "@/components/filters/filterBarUtils";
import { ActiveFilterPills } from "@/components/filters/sections/ActiveFilterPills";
import { AdvancedFiltersPanel } from "@/components/filters/sections/AdvancedFiltersPanel";
import { QuickFilterMenu } from "@/components/filters/sections/QuickFilterMenu";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";

import { FilterDrawer } from "./FilterDrawer";
import { SCOPE_BAR_LABEL_CLASS, SCOPE_BAR_ORG_FALLBACK, ScopeBarCard } from "./ScopeBarFrame";
import { useShellOrganization } from "./ShellContext";
import { useScopeBarState } from "./useScopeBarState";

const WINDOW_OPTIONS = [7, 14, 30, 90] as const;
const DRAWER_ID = "scope-bar-filters";
/** The `md` breakpoint: from here up the filters open as a drawer. */
const DRAWER_MEDIA_QUERY = "(min-width: 768px)";

export type ScopeBarClientProps = Pick<
    FilterBarClientProps,
    "view" | "tab" | "resolvedVisibility" | "resolvedScopeLock"
> & {
    /** Where the user came from, when the page knows it. */
    origin?: string | null;
    /** Organization name. Defaults to the shell's active organization. */
    orgName?: string;
    /**
     * `false` for a bar with no page filters: no default `f` is written, and
     * with no `f` in the URL the scope is the organization, as the page reads it.
     */
    writeDefaultFilter?: boolean;
    /** Page-control rows, in the card below the scope row. */
    children?: ReactNode;
};

const LABEL_CLASS = SCOPE_BAR_LABEL_CLASS;

/**
 * The one scope bar of a page: organization, team, repository and window in one
 * row, with the advanced filters in a drawer. It replaces the global context bar
 * plus the page filter bar on pages in the shared app shell.
 */
export function ScopeBarClient({
    view,
    tab,
    resolvedVisibility,
    resolvedScopeLock,
    origin,
    orgName,
    writeDefaultFilter,
    children,
}: ScopeBarClientProps) {
    const {
        allowAdvanced,
        artifacts,
        barRef,
        developers,
        filters,
        flowStage,
        issueType,
        openMenu,
        options,
        peopleQuery,
        repos,
        resetFilters,
        roles,
        selectRepos,
        selectTeams,
        setOpenMenu,
        setScopeLevel,
        setWindow,
        teamIds,
        updateFilters,
        updatePeopleQuery,
        visibility,
        workCategory,
    } = useScopeBarState({
        view,
        tab,
        resolvedVisibility,
        resolvedScopeLock,
        writeDefaultFilter,
    });

    const organization = useShellOrganization();
    const orgLabel = orgName ?? organization?.name ?? SCOPE_BAR_ORG_FALLBACK;
    const isOrgScope = filters.scope.level === "org";
    const blocked = filters.how.blocked ?? false;

    const [filtersMode, setFiltersMode] = useState<"drawer" | "inline" | null>(null);
    const filtersButtonRef = useRef<HTMLButtonElement>(null);
    const filtersOpen = filtersMode !== null;

    const openFilters = () => {
        const wide =
            typeof window.matchMedia === "function"
                ? window.matchMedia(DRAWER_MEDIA_QUERY).matches
                : true;
        setOpenMenu(null);
        setFiltersMode(wide ? "drawer" : "inline");
    };
    const closeFilters = () => {
        setOpenMenu(null);
        setFiltersMode(null);
        // Focus goes back to the control that opened the panel.
        filtersButtonRef.current?.focus();
    };
    const handleFiltersEscape = () => {
        // Escape closes an open menu in the panel first, then the panel.
        if (openMenu) {
            setOpenMenu(null);
            return;
        }
        closeFilters();
    };

    // Filters that live in the drawer. Team, repository and window are in the row.
    const activeFilterCount =
        (isFilterRead(visibility, "developers") ? developers.length : 0) +
        (isFilterRead(visibility, "roles") ? roles.length : 0) +
        workCategory.length +
        (isFilterRead(visibility, "issueType") ? issueType.length : 0) +
        (isFilterRead(visibility, "flowStage") ? flowStage.length : 0) +
        (isFilterRead(visibility, "artifacts") ? artifacts.length : 0) +
        (blocked && isFilterRead(visibility, "blocked") ? 1 : 0);
    const filtersButtonName =
        activeFilterCount > 0
            ? `${CTA_LABELS.filters}, ${activeFilterCount} active`
            : CTA_LABELS.filters;

    // The People view has no filter drawer (as its filter bar had no panel): it
    // has the person search in the row.
    const hasDrawerFilters = Boolean(
        allowAdvanced && (visibility.developer || visibility.workType || visibility.flowStage),
    );

    // The page filters with a list of options. They are in the drawer; a view
    // with no drawer (People) keeps them in the row, where its filter bar had them.
    const pageFilterMenus = (
        <>
            {visibility.developer ? (
                <QuickFilterMenu
                    active={developers}
                    emptyLabel="All"
                    items={options.developers}
                    label="Developer"
                    menuKey="developer"
                    onChange={(next) =>
                        updateFilters({
                            ...filters,
                            who: { ...filters.who, developers: next },
                        })
                    }
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    toggleValue={toggleValue}
                />
            ) : null}
            {visibility.workType ? (
                <QuickFilterMenu
                    active={workCategory}
                    emptyLabel="All"
                    items={options.work_category}
                    label="Work"
                    menuKey="work"
                    onChange={(next) =>
                        updateFilters({
                            ...filters,
                            why: { ...filters.why, work_category: next },
                        })
                    }
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    toggleValue={toggleValue}
                />
            ) : null}
            {visibility.flowStage ? (
                <QuickFilterMenu
                    active={flowStage}
                    emptyLabel="All"
                    items={options.flow_stage}
                    label="Flow"
                    menuKey="flow"
                    onChange={(next) =>
                        updateFilters({
                            ...filters,
                            how: { ...filters.how, flow_stage: next },
                        })
                    }
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    toggleValue={toggleValue}
                />
            ) : null}
        </>
    );

    return (
        <ScopeBarCard
            barRef={barRef}
            view={view ?? "default"}
            raised={filtersMode === "drawer"}
            organization={{
                label: orgLabel,
                pressed: isOrgScope,
                onSelect: () => setScopeLevel("org"),
            }}
            controls={[
                <QuickFilterMenu
                    key="team"
                    active={teamIds}
                    emptyLabel="All Teams"
                    items={options.teams}
                    label="Team"
                    menuKey="team"
                    onChange={selectTeams}
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    toggleValue={toggleValue}
                    value={formatSelection(teamIds, "All")}
                />,
                <QuickFilterMenu
                    key="repo"
                    active={repos}
                    emptyLabel="All"
                    items={options.repos}
                    label="Repo"
                    menuKey="repo"
                    onChange={selectRepos}
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    toggleValue={toggleValue}
                    value={formatSelection(repos, "All")}
                />,
                <div key="window" className="flex items-center gap-2">
                    <span id="scope-bar-window-label" className={LABEL_CLASS}>
                        Window
                    </span>
                    <div
                        role="group"
                        aria-labelledby="scope-bar-window-label"
                        className="flex rounded-(--radius-pill) border border-(--border) bg-(--surface-raised) p-1"
                    >
                        {WINDOW_OPTIONS.map((days) => {
                            const active = filters.time.range_days === days;
                            return (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => setWindow(days)}
                                    aria-pressed={active}
                                    className={`rounded-(--radius-pill) px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) ${
                                        active
                                            ? "bg-(--accent) text-(--accent-foreground)"
                                            : "text-(--text-secondary) hover:text-(--text-primary)"
                                    }`}
                                >
                                    {days}d
                                </button>
                            );
                        })}
                    </div>
                </div>,
            ]}
            rowExtras={
                <>
                    {!hasDrawerFilters ? pageFilterMenus : null}

                    {origin ? (
                        <div className="flex items-center gap-2 text-xs text-(--text-secondary)">
                            <span className={LABEL_CLASS}>Origin</span>
                            <span className="font-medium text-(--text-primary)">{origin}</span>
                        </div>
                    ) : null}
                </>
            }
            actions={
                <>
                    {view === "people" ? (
                        <label className="flex items-center gap-2 text-xs">
                            <span className={LABEL_CLASS}>Search</span>
                            <input
                                value={peopleQuery}
                                onChange={(event) => updatePeopleQuery(event.target.value)}
                                placeholder="Name or handle"
                                className="w-full rounded-(--radius-pill) border border-(--border) bg-(--surface-raised) px-4 py-2 text-xs text-(--text-primary) sm:w-56"
                            />
                        </label>
                    ) : null}
                    {hasDrawerFilters ? (
                        <button
                            type="button"
                            ref={filtersButtonRef}
                            onClick={() => (filtersOpen ? closeFilters() : openFilters())}
                            aria-label={filtersButtonName}
                            aria-expanded={filtersOpen}
                            aria-controls={DRAWER_ID}
                            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) ${
                                filtersOpen || activeFilterCount > 0
                                    ? "border-(--accent) text-(--text-primary)"
                                    : "border-(--border) bg-(--surface-raised) text-(--text-primary) hover:border-(--text-muted)"
                            }`}
                        >
                            {CTA_LABELS.filters}
                            {activeFilterCount > 0 ? (
                                <span
                                    aria-hidden="true"
                                    data-testid="scope-bar-filter-count"
                                    className="rounded-(--radius-pill) bg-(--accent) px-1.5 text-(--accent-foreground)"
                                >
                                    {activeFilterCount}
                                </span>
                            ) : null}
                        </button>
                    ) : null}
                </>
            }
            onReset={resetFilters}
            footer={
                <>
                    {activeFilterCount > 0 || repos.length > 0 ? (
                        <div className="mt-3">
                            <ActiveFilterPills
                                artifacts={artifacts}
                                blocked={blocked}
                                developers={developers}
                                flowStage={flowStage}
                                issueType={issueType}
                                unread={visibility.unreadFilters}
                                onClearArtifact={(value) =>
                                    updateFilters({
                                        ...filters,
                                        what: {
                                            ...filters.what,
                                            artifacts: toggleValue(
                                                artifacts,
                                                value,
                                            ) as MetricFilter["what"]["artifacts"],
                                        },
                                    })
                                }
                                onClearBlocked={() =>
                                    updateFilters({
                                        ...filters,
                                        how: { ...filters.how, blocked: false },
                                    })
                                }
                                onClearDeveloper={(value) =>
                                    updateFilters({
                                        ...filters,
                                        who: {
                                            ...filters.who,
                                            developers: toggleValue(developers, value),
                                        },
                                    })
                                }
                                onClearFlowStage={(value) =>
                                    updateFilters({
                                        ...filters,
                                        how: {
                                            ...filters.how,
                                            flow_stage: toggleValue(flowStage, value),
                                        },
                                    })
                                }
                                onClearIssueType={(value) =>
                                    updateFilters({
                                        ...filters,
                                        why: {
                                            ...filters.why,
                                            issue_type: toggleValue(issueType, value),
                                        },
                                    })
                                }
                                onClearRepo={(value) =>
                                    updateFilters({
                                        ...filters,
                                        what: { ...filters.what, repos: toggleValue(repos, value) },
                                    })
                                }
                                onClearRole={(value) =>
                                    updateFilters({
                                        ...filters,
                                        who: { ...filters.who, roles: toggleValue(roles, value) },
                                    })
                                }
                                onClearWorkCategory={(value) =>
                                    updateFilters({
                                        ...filters,
                                        why: {
                                            ...filters.why,
                                            work_category: toggleValue(workCategory, value),
                                        },
                                    })
                                }
                                repos={repos}
                                roles={roles}
                                workCategory={workCategory}
                            />
                        </div>
                    ) : null}

                    {filtersMode && hasDrawerFilters ? (
                        <FilterDrawer
                            id={DRAWER_ID}
                            mode={filtersMode}
                            onClose={closeFilters}
                            onEscape={handleFiltersEscape}
                        >
                            <div className="flex flex-wrap items-center gap-3">
                                {pageFilterMenus}
                            </div>
                            <AdvancedFiltersPanel
                                artifacts={artifacts}
                                blocked={blocked}
                                developers={developers}
                                filters={filters}
                                flowStage={flowStage}
                                issueType={issueType}
                                repos={repos}
                                roles={roles}
                                singleColumn={filtersMode === "drawer"}
                                updateFilters={updateFilters}
                                visibility={visibility}
                                workCategory={workCategory}
                            />
                        </FilterDrawer>
                    ) : null}
                </>
            }
        >
            {children}
        </ScopeBarCard>
    );
}
