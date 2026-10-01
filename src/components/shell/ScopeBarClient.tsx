"use client";

import { useEffect, useRef, useState } from "react";

import { type FilterBarClientProps } from "@/components/filters/filterBarConfig";
import { formatSelection, toggleValue } from "@/components/filters/filterBarUtils";
import { ActiveFilterPills } from "@/components/filters/sections/ActiveFilterPills";
import { AdvancedFiltersPanel } from "@/components/filters/sections/AdvancedFiltersPanel";
import { QuickFilterMenu } from "@/components/filters/sections/QuickFilterMenu";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";

import { FilterDrawer } from "./FilterDrawer";
import { useShellOrganization } from "./ShellContext";
import { useScopeBarState } from "./useScopeBarState";

const WINDOW_OPTIONS = [7, 14, 30, 90] as const;
const ORG_FALLBACK = "Organization";
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
};

const LABEL_CLASS = "text-label-caps font-semibold uppercase text-(--text-muted)";
const SEPARATOR = (
    <span aria-hidden="true" className="text-(--text-muted)">
        ·
    </span>
);

/** The URL in a read-only field, focused with its text selected, ready to copy. */
function CopyFallbackField({ url }: { url: string }) {
    const fieldRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fieldRef.current?.focus();
        fieldRef.current?.select();
    }, [url]);

    return (
        <input
            id="scope-bar-copy-url"
            ref={fieldRef}
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-(--radius-sm) border border-(--border) bg-(--surface-raised) px-3 py-1.5 text-xs text-(--text-primary)"
        />
    );
}

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
}: ScopeBarClientProps) {
    const {
        artifacts,
        barRef,
        copyFallbackUrl,
        copyLink,
        developers,
        dismissCopyFallback,
        filters,
        flowStage,
        issueType,
        openMenu,
        options,
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
        visibility,
        workCategory,
    } = useScopeBarState({ view, tab, resolvedVisibility, resolvedScopeLock });

    const organization = useShellOrganization();
    const orgLabel = orgName ?? organization?.name ?? ORG_FALLBACK;
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
        developers.length +
        roles.length +
        workCategory.length +
        issueType.length +
        flowStage.length +
        artifacts.length +
        (blocked ? 1 : 0);
    const filtersButtonName =
        activeFilterCount > 0
            ? `${CTA_LABELS.filters}, ${activeFilterCount} active`
            : CTA_LABELS.filters;

    const hasDrawerFilters = Boolean(
        visibility.developer || visibility.workType || visibility.flowStage,
    );

    return (
        <section
            ref={barRef}
            aria-label="Scope"
            data-testid="scope-bar"
            data-view={view ?? "default"}
            // No backdrop-filter here: it would make this bar the containing block
            // of the fixed drawer, which is a DOM child so that the outside-click
            // handler treats its menus as inside the bar.
            // z-20 keeps the bar's menus under the sticky top bar (z-30). An open
            // drawer must be over the top bar and the sidebar, so the bar rises.
            className={`relative rounded-(--radius-md) border border-(--border) bg-(--surface) px-4 py-3 text-xs ${
                filtersMode === "drawer" ? "z-50" : "z-20"
            }`}
        >
            <div
                data-testid="scope-bar-row"
                className="flex flex-wrap items-center gap-x-4 gap-y-2"
            >
                <div className="flex items-center gap-2">
                    <span className={LABEL_CLASS}>Org</span>
                    <button
                        type="button"
                        onClick={() => setScopeLevel("org")}
                        aria-pressed={isOrgScope}
                        className={`rounded-(--radius-pill) border px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) ${
                            isOrgScope
                                ? "border-(--accent) bg-(--accent)/15 text-(--text-primary)"
                                : "border-(--border) bg-(--surface-raised) text-(--text-secondary) hover:text-(--text-primary)"
                        }`}
                    >
                        {orgLabel}
                    </button>
                </div>

                {SEPARATOR}

                <QuickFilterMenu
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
                />

                {SEPARATOR}

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
                    value={formatSelection(repos, "All")}
                />

                {SEPARATOR}

                <div className="flex items-center gap-2">
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
                </div>

                {origin ? (
                    <div className="flex items-center gap-2 text-xs text-(--text-secondary)">
                        <span className={LABEL_CLASS}>Origin</span>
                        <span className="font-medium text-(--text-primary)">{origin}</span>
                    </div>
                ) : null}

                <div className="ml-auto flex flex-wrap items-center gap-2">
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
                    <Button variant="secondary" onClick={resetFilters}>
                        {CTA_LABELS.resetFilters}
                    </Button>
                    <Button variant="secondary" onClick={copyLink}>
                        {CTA_LABELS.copyLink}
                    </Button>
                </div>
            </div>

            {copyFallbackUrl ? (
                <div
                    data-testid="scope-bar-copy-fallback"
                    className="mt-3 flex flex-wrap items-center gap-2 border-t border-(--border) pt-3"
                >
                    <label htmlFor="scope-bar-copy-url" className="text-xs text-(--text-secondary)">
                        The link could not be copied. Copy it from this field:
                    </label>
                    <CopyFallbackField url={copyFallbackUrl} />
                    <Button variant="ghost" size="sm" onClick={dismissCopyFallback}>
                        {CTA_LABELS.close}
                    </Button>
                </div>
            ) : null}

            {activeFilterCount > 0 || repos.length > 0 ? (
                <div className="mt-3">
                    <ActiveFilterPills
                        artifacts={artifacts}
                        blocked={blocked}
                        developers={developers}
                        flowStage={flowStage}
                        issueType={issueType}
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
                            updateFilters({ ...filters, how: { ...filters.how, blocked: false } })
                        }
                        onClearDeveloper={(value) =>
                            updateFilters({
                                ...filters,
                                who: { ...filters.who, developers: toggleValue(developers, value) },
                            })
                        }
                        onClearFlowStage={(value) =>
                            updateFilters({
                                ...filters,
                                how: { ...filters.how, flow_stage: toggleValue(flowStage, value) },
                            })
                        }
                        onClearIssueType={(value) =>
                            updateFilters({
                                ...filters,
                                why: { ...filters.why, issue_type: toggleValue(issueType, value) },
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
        </section>
    );
}
