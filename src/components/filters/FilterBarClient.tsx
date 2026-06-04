"use client";

import type { MetricFilter } from "@/lib/filters/types";
import { type FilterBarClientProps } from "./filterBarConfig";
import { toggleValue } from "./filterBarUtils";
import { useFilterBarState } from "./useFilterBarState";
import { ActiveFilterPills } from "./sections/ActiveFilterPills";
import { AdvancedFiltersPanel } from "./sections/AdvancedFiltersPanel";
import { QuickFilterMenu } from "./sections/QuickFilterMenu";
import { ScopeSection } from "./sections/ScopeSection";
import { TimeRangeSection } from "./sections/TimeRangeSection";
import { ToolbarActions } from "./sections/ToolbarActions";

export { resolveVisibility } from "./filterBarConfig";
export type { FilterBarView } from "./filterBarConfig";

export function FilterBarClient({
  condensed,
  view,
  tab,
  resolvedVisibility,
  resolvedScopeLock,
}: FilterBarClientProps) {
  const {
    allowAdvanced,
    artifacts,
    barRef,
    copyFilters,
    dateValue,
    developers,
    effectiveScopeIds,
    endDate,
    filters,
    flowStage,
    handleDatePreset,
    isCustomDateRange,
    issueType,
    openMenu,
    options,
    peopleQuery,
    repos,
    resetFilters,
    roles,
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
  } = useFilterBarState({ view, tab, resolvedVisibility, resolvedScopeLock });

  return (
    <section
      ref={barRef}
      data-testid="filter-bar"
      data-view={view ?? "default"}
      className={`w-full rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4 backdrop-blur-sm transition-all duration-300 ease-in-out ${condensed ? "py-2" : "py-4"}`}
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {visibility.scope && (
              <ScopeSection
                effectiveScopeIds={effectiveScopeIds}
                filters={filters}
                openMenu={openMenu}
                scopeEmptyLabel={scopeEmptyLabel}
                scopeLabel={scopeLabel}
                scopeLevel={scopeLevel}
                scopeLock={scopeLock}
                scopeOptions={scopeOptions}
                scopeValue={scopeValue}
                setOpenMenu={setOpenMenu}
                toggleValue={toggleValue}
                updateFilters={updateFilters}
              />
            )}

            {visibility.date && (
              <TimeRangeSection
                dateValue={dateValue}
                endDate={endDate}
                filters={filters}
                isCustomDateRange={isCustomDateRange}
                onDatePreset={handleDatePreset}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
                startDate={startDate}
                updateFilters={updateFilters}
              />
            )}

            {visibility.repo && (
              <QuickFilterMenu
                active={repos}
                emptyLabel="All"
                items={options.repos}
                label="Repo"
                menuKey="repo"
                onChange={(next) =>
                  updateFilters({
                    ...filters,
                    what: { ...filters.what, repos: next },
                  })
                }
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
                toggleValue={toggleValue}
              />
            )}

            {visibility.developer && (
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
            )}

            {visibility.workType && (
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
            )}

            {visibility.flowStage && (
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
            )}
          </div>

          <ToolbarActions
            allowAdvanced={allowAdvanced}
            copyFilters={copyFilters}
            peopleQuery={peopleQuery}
            resetFilters={resetFilters}
            setShowAdvanced={setShowAdvanced}
            showAdvanced={showAdvanced}
            updatePeopleQuery={updatePeopleQuery}
            view={view}
          />
        </div>

        <ActiveFilterPills
          artifacts={artifacts}
          blocked={filters.how.blocked ?? false}
          developers={developers}
          flowStage={flowStage}
          issueType={issueType}
          onClearArtifact={(value) =>
            updateFilters({
              ...filters,
              what: {
                ...filters.what,
                artifacts: toggleValue(artifacts, value) as MetricFilter["what"]["artifacts"],
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

        {allowAdvanced && showAdvanced && (
          <AdvancedFiltersPanel
            artifacts={artifacts}
            blocked={filters.how.blocked ?? false}
            developers={developers}
            filters={filters}
            flowStage={flowStage}
            issueType={issueType}
            repos={repos}
            roles={roles}
            updateFilters={updateFilters}
            workCategory={workCategory}
          />
        )}
      </div>
    </section>
  );
}
