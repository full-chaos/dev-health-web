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
import { useTrackEvent } from "@/lib/telemetry/useTrackEvent";

export { resolveVisibility } from "./filterBarConfig";
export type { FilterBarView } from "./filterBarConfig";

export function FilterBarClient({
  condensed,
  view,
  tab,
  resolvedVisibility,
  resolvedScopeLock,
}: FilterBarClientProps) {
  const trackEvent = useTrackEvent();
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
  const telemetryView = view ?? "default";
  const emitFilterChange = (
    filterKey: "scope" | "date" | "repo" | "developer" | "work" | "flow" | "artifact" | "blocked" | "issueType",
    valueCount: number,
    customDateRange: boolean | null = null,
  ) => {
    trackEvent("filter_changed", {
      view: telemetryView,
      filterKey,
      valueCount,
      isCustomDateRange: customDateRange,
    });
  };
  const updateFiltersWithTelemetry = (next: MetricFilter) => {
    updateFilters(next);
    if (next.scope.ids !== filters.scope.ids || next.scope.level !== filters.scope.level) {
      emitFilterChange("scope", next.scope.ids?.length ?? 0);
    } else if (next.what.repos !== filters.what.repos) {
      emitFilterChange("repo", next.what.repos?.length ?? 0);
    } else if (next.who.developers !== filters.who.developers) {
      emitFilterChange("developer", next.who.developers?.length ?? 0);
    } else if (next.why.work_category !== filters.why.work_category) {
      emitFilterChange("work", next.why.work_category?.length ?? 0);
    } else if (next.how.flow_stage !== filters.how.flow_stage) {
      emitFilterChange("flow", next.how.flow_stage?.length ?? 0);
    } else if (next.what.artifacts !== filters.what.artifacts) {
      emitFilterChange("artifact", next.what.artifacts?.length ?? 0);
    } else if (next.how.blocked !== filters.how.blocked) {
      emitFilterChange("blocked", next.how.blocked ? 1 : 0);
    } else if (next.why.issue_type !== filters.why.issue_type) {
      emitFilterChange("issueType", next.why.issue_type?.length ?? 0);
    } else if (next.time !== filters.time) {
      emitFilterChange("date", 1, Boolean(next.time.start_date || next.time.end_date));
    }
  };
  const handleDatePresetWithTelemetry = (days: number) => {
    handleDatePreset(days);
    emitFilterChange("date", 1, false);
  };

  return (
    <section
      ref={barRef}
      data-testid="filter-bar"
      data-view={view ?? "default"}
      className={`w-full border-b border-(--card-stroke) bg-(--card-90)/80 p-4 backdrop-blur-sm transition-all duration-300 ease-in-out ${condensed ? "py-2" : "py-4"}`}
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
                updateFilters={updateFiltersWithTelemetry}
              />
            )}

            {visibility.date && (
              <TimeRangeSection
                dateValue={dateValue}
                endDate={endDate}
                filters={filters}
                isCustomDateRange={isCustomDateRange}
                onDatePreset={handleDatePresetWithTelemetry}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
                startDate={startDate}
                updateFilters={updateFiltersWithTelemetry}
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
                  updateFiltersWithTelemetry({
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
                  updateFiltersWithTelemetry({
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
                  updateFiltersWithTelemetry({
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
                  updateFiltersWithTelemetry({
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
            updateFiltersWithTelemetry({
              ...filters,
              what: {
                ...filters.what,
                artifacts: toggleValue(artifacts, value) as MetricFilter["what"]["artifacts"],
              },
            })
          }
          onClearBlocked={() =>
            updateFiltersWithTelemetry({
              ...filters,
              how: { ...filters.how, blocked: false },
            })
          }
          onClearDeveloper={(value) =>
            updateFiltersWithTelemetry({
              ...filters,
              who: { ...filters.who, developers: toggleValue(developers, value) },
            })
          }
          onClearFlowStage={(value) =>
            updateFiltersWithTelemetry({
              ...filters,
              how: { ...filters.how, flow_stage: toggleValue(flowStage, value) },
            })
          }
          onClearIssueType={(value) =>
            updateFiltersWithTelemetry({
              ...filters,
              why: { ...filters.why, issue_type: toggleValue(issueType, value) },
            })
          }
          onClearRepo={(value) =>
            updateFiltersWithTelemetry({
              ...filters,
              what: { ...filters.what, repos: toggleValue(repos, value) },
            })
          }
          onClearRole={(value) =>
            updateFiltersWithTelemetry({
              ...filters,
              who: { ...filters.who, roles: toggleValue(roles, value) },
            })
          }
          onClearWorkCategory={(value) =>
            updateFiltersWithTelemetry({
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
            updateFilters={updateFiltersWithTelemetry}
            workCategory={workCategory}
          />
        )}
      </div>
    </section>
  );
}
