"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";
import { apiClient } from "@/lib/apiClient";
import {
  addDays,
  diffDaysInclusive,
  formatDateInput,
  parseDateInput,
  toLocalDate,
} from "@/lib/dateUtils";
import { FilterPill } from "./FilterPill";

const DATE_PRESETS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const toList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const toValue = (value?: string[]) =>
  value && value.length ? value.join(", ") : "";

type FilterOptions = {
  teams: string[];
  repos: string[];
  services: string[];
  developers: string[];
  work_category: string[];
  issue_type: string[];
  flow_stage: string[];
};

type FilterBarView =
  | "people"
  | "home"
  | "metrics"
  | "work"
  | "investment"
  | "code"
  | "quality"
  | "opportunities"
  | "explore";

type FilterVisibility = {
  scope?: boolean;
  repo?: boolean;
  developer?: boolean;
  workType?: boolean;
  flowStage?: boolean;
  date?: boolean;
};

const DEFAULT_VISIBILITY: FilterVisibility = {
  scope: true,
  repo: true,
  developer: true,
  workType: true,
  flowStage: false,
  date: true,
};

const METRICS_DEFAULT_VISIBILITY: FilterVisibility = {
  scope: true,
  repo: true,
  developer: false,
  workType: false,
  flowStage: false,
  date: true,
};

const METRICS_FLOW_VISIBILITY: FilterVisibility = {
  scope: true,
  repo: true,
  developer: true,
  workType: false,
  flowStage: true,
  date: true,
};

const WORK_VISIBILITY: FilterVisibility = {
  scope: true,
  repo: false,
  developer: false,
  workType: true,
  flowStage: false,
  date: true,
};

const PEOPLE_VISIBILITY: FilterVisibility = {
  scope: true,
  repo: false,
  developer: true,
  workType: false,
  flowStage: false,
  date: true,
};

const CODE_VISIBILITY: FilterVisibility = {
  scope: false,
  repo: true,
  developer: true,
  workType: false,
  flowStage: false,
  date: true,
};

const EXPLORE_VISIBILITY: FilterVisibility = {
  scope: true,
  repo: true,
  developer: true,
  workType: true,
  flowStage: true,
  date: true,
};

const resolveVisibility = (
  view?: FilterBarView,
  tab?: string
): FilterVisibility => {
  if (view === "metrics") {
    if (tab === "flow") {
      return METRICS_FLOW_VISIBILITY;
    }
    return METRICS_DEFAULT_VISIBILITY;
  }
  if (view === "work" || view === "investment") {
    return WORK_VISIBILITY;
  }
  if (view === "people") {
    return PEOPLE_VISIBILITY;
  }
  if (view === "code") {
    return CODE_VISIBILITY;
  }
  if (view === "quality") {
    return METRICS_DEFAULT_VISIBILITY;
  }
  if (view === "opportunities") {
    return WORK_VISIBILITY;
  }
  if (view === "explore") {
    return EXPLORE_VISIBILITY;
  }
  return DEFAULT_VISIBILITY;
};

export type FilterBarClientProps = {
  condensed?: boolean;
  view?: FilterBarView;
  tab?: string;
  /** Pre-computed by RSC wrapper — avoids re-running on every client render */
  resolvedVisibility?: FilterVisibility;
  /** Pre-computed by RSC wrapper */
  resolvedScopeLock?: MetricFilter["scope"]["level"] | null;
};

/** @deprecated Use FilterBarClientProps instead */
type FilterBarProps = FilterBarClientProps;

const formatSelection = (values: string[], emptyLabel: string) => {
  if (!values.length) {
    return emptyLabel;
  }
  if (values.length <= 2) {
    return values.join(", ");
  }
  return `${values.length} selected`;
};

const toggleValue = (values: string[], value: string) => {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }
  return [...values, value];
};

const scopeLabelMap: Record<MetricFilter["scope"]["level"], string> = {
  org: "Org",
  team: "Team",
  repo: "Repo",
  service: "Service",
  developer: "Developer",
};

export function FilterBarClient({
  condensed,
  view,
  tab,
  resolvedVisibility,
  resolvedScopeLock,
}: FilterBarClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const encoded = searchParams.get("f");
  const initialFilters = useMemo(() => decodeFilter(encoded), [encoded]);
  const [filters, setFilters] = useState<MetricFilter>(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const queryParam = searchParams.get("q") ?? "";
  const [peopleQuery, setPeopleQuery] = useState(queryParam);
  const [options, setOptions] = useState<FilterOptions>({
    teams: [],
    repos: [],
    services: [],
    developers: [],
    work_category: [],
    issue_type: [],
    flow_stage: [],
  });

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  useEffect(() => {
    if (!encoded) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("f", encodeFilterParam(defaultMetricFilter));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [encoded, pathname, router, searchParams]);

  useEffect(() => {
    if (view !== "people") {
      return;
    }
    setPeopleQuery(queryParam);
  }, [queryParam, view]);

  useEffect(() => {
    let active = true;
    apiClient
      .getJson<FilterOptions>("/api/v1/filters/options")
      .then((payload) => {
        if (!active) {
          return;
        }
        setOptions({
          teams: payload.teams ?? [],
          repos: payload.repos ?? [],
          services: payload.services ?? [],
          developers: payload.developers ?? [],
          work_category: payload.work_category ?? [],
          issue_type: payload.issue_type ?? [],
          flow_stage: payload.flow_stage ?? [],
        });
      })
      .catch(() => {
        if (active) {
          setOptions((prev) => ({ ...prev }));
        }
      });
    return () => {
      active = false;
    };
  }, []);

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
    [pathname, router, searchParams]
  );

  const updatePeopleQuery = (nextQuery: string) => {
    setPeopleQuery(nextQuery);
    const params = new URLSearchParams(searchParams.toString());
    if (nextQuery.trim()) {
      params.set("q", nextQuery);
    } else {
      params.delete("q");
    }
    params.set("f", encodeFilterParam(filters));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const updateFilters = (nextFilters: MetricFilter) => {
    setFilters(nextFilters);
    updateUrl(nextFilters);
  };

  const resetFilters = () => {
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
  };

  const copyFilters = async () => {
    const payload = JSON.stringify(filters, null, 2);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
    }
  };

  const handleDatePreset = (days: number) => {
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
  };

  const visibility = resolvedVisibility ?? resolveVisibility(view, tab);
  const allowAdvanced = view !== "people";
  const scopeLock: MetricFilter["scope"]["level"] | null =
    resolvedScopeLock !== undefined
      ? resolvedScopeLock
      : (view === "metrics" ||
          view === "quality" ||
          view === "work" ||
          view === "investment" ||
          view === "opportunities" ||
          view === "home" ||
          view === "people"
          ? "team"
          : null);
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
  const roles = filters.who.roles ?? [];
  const repos = filters.what.repos ?? [];
  const artifacts = filters.what.artifacts ?? [];
  const workCategory = filters.why.work_category ?? [];
  const issueType = filters.why.issue_type ?? [];
  const flowStage = filters.how.flow_stage ?? [];

  const scopeLabel = scopeLabelMap[scopeLevel] ?? "Team";
  const scopeEmptyLabel = scopeLevel === "team" ? "All Teams" : "All";
  const scopeValue = formatSelection(effectiveScopeIds, scopeEmptyLabel);
  const safeRangeDays = Math.max(1, filters.time.range_days);
  const today = toLocalDate(new Date());
  const parsedStart = filters.time.start_date
    ? parseDateInput(filters.time.start_date)
    : null;
  const parsedEnd = filters.time.end_date
    ? parseDateInput(filters.time.end_date)
    : null;
  const resolvedEnd = toLocalDate(parsedEnd ?? today);
  const resolvedStart = toLocalDate(
    parsedStart ?? addDays(resolvedEnd, -(safeRangeDays - 1))
  );
  const startDate = resolvedStart > resolvedEnd ? resolvedEnd : resolvedStart;
  const endDate = resolvedStart > resolvedEnd ? resolvedStart : resolvedEnd;
  const dateValue = `${formatDateInput(startDate)} - ${formatDateInput(endDate)}`;

  const renderOptionList = (
    items: string[],
    selected: string[],
    emptyLabel: string,
    onChange: (nextValues: string[]) => void
  ) => (
    <div className="space-y-2 text-xs">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!selected.length}
          onChange={() => onChange([])}
        />
        <span>{emptyLabel}</span>
      </label>
      {items.length ? (
        items.map((item) => (
          <label key={item} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(item)}
              onChange={() => onChange(toggleValue(selected, item))}
            />
            <span>{item}</span>
          </label>
        ))
      ) : (
        <p className="text-[11px] text-(--ink-muted)">
          No options yet. Use Advanced filters to type values.
        </p>
      )}
    </div>
  );

  return (
    <section
      ref={barRef}
      className={`w-full border-b border-(--card-stroke) bg-(--card-90) p-4 transition-all duration-300 ease-in-out ${condensed ? "py-2" : "py-4"}`}
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {visibility.scope && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu(openMenu === "scope" ? null : "scope")}
                  className="flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs"
                  aria-expanded={openMenu === "scope"}
                >
                  <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                    {scopeLabel}:
                  </span>
                  <span className="text-foreground">{scopeValue}</span>
                  <span className="text-(--ink-muted)">▾</span>
                </button>
                {openMenu === "scope" && (
                  <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
                    {!scopeLock && (
                      <label className="flex flex-col gap-2 text-xs">
                        <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                          Scope level
                        </span>
                        <select
                          className="rounded-xl border border-(--card-stroke) bg-(--card-80) px-3 py-2 text-sm"
                          value={scopeLevel}
                          onChange={(event) =>
                            updateFilters({
                              ...filters,
                              scope: {
                                ...filters.scope,
                                level: event.target.value as MetricFilter["scope"]["level"],
                                ids: [],
                              },
                            })
                          }
                        >
                          <option value="org">Org</option>
                          <option value="team">Team</option>
                          <option value="repo">Repo</option>
                          <option value="service">Service</option>
                          <option value="developer">Developer</option>
                        </select>
                      </label>
                    )}
                    <div className="mt-3 max-h-56 overflow-auto">
                      {renderOptionList(scopeOptions, effectiveScopeIds, scopeEmptyLabel, (next) =>
                        updateFilters({
                          ...filters,
                          scope: { ...filters.scope, level: scopeLevel, ids: next },
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {visibility.date && (
              <div className="flex items-center rounded-full border border-(--card-stroke) bg-card p-1">
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => handleDatePreset(preset.days)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filters.time.range_days === preset.days
                        ? "bg-(--accent) text-white"
                        : "text-(--ink-muted) hover:text-foreground"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <div className="relative ml-1 border-l border-(--card-stroke) pl-1">
                  <button
                    type="button"
                    onClick={() => setOpenMenu(openMenu === "date" ? null : "date")}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      !DATE_PRESETS.some((p) => p.days === filters.time.range_days)
                        ? "bg-(--accent) text-white"
                        : "text-(--ink-muted) hover:text-foreground"
                    }`}
                  >
                    {!DATE_PRESETS.some((p) => p.days === filters.time.range_days)
                      ? dateValue
                      : "Custom"}
                  </button>
                  {openMenu === "date" && (
                    <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
                      <div className="grid gap-3 text-xs">
                        <label className="flex flex-col gap-2">
                          <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                            Start date
                          </span>
                          <input
                            className="rounded-xl border border-(--card-stroke) bg-(--card-80) px-3 py-2 text-sm"
                            type="date"
                            value={formatDateInput(startDate)}
                            onChange={(event) => {
                              const parsed = parseDateInput(event.target.value);
                              if (!parsed) {
                                return;
                              }
                              const nextStart = toLocalDate(parsed);
                              let nextEnd = endDate;
                              if (nextStart > nextEnd) {
                                nextEnd = nextStart;
                              }
                              const nextRangeDays = diffDaysInclusive(nextStart, nextEnd);
                              updateFilters({
                                ...filters,
                                time: {
                                  ...filters.time,
                                  range_days: nextRangeDays,
                                  compare_days: nextRangeDays,
                                  start_date: formatDateInput(nextStart),
                                  end_date: formatDateInput(nextEnd),
                                },
                              });
                            }}
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                            End date
                          </span>
                          <input
                            className="rounded-xl border border-(--card-stroke) bg-(--card-80) px-3 py-2 text-sm"
                            type="date"
                            value={formatDateInput(endDate)}
                            onChange={(event) => {
                              const parsed = parseDateInput(event.target.value);
                              if (!parsed) {
                                return;
                              }
                              const nextEnd = toLocalDate(parsed);
                              let nextStart = startDate;
                              if (nextEnd < nextStart) {
                                nextStart = nextEnd;
                              }
                              const nextRangeDays = diffDaysInclusive(nextStart, nextEnd);
                              updateFilters({
                                ...filters,
                                time: {
                                  ...filters.time,
                                  range_days: nextRangeDays,
                                  compare_days: nextRangeDays,
                                  start_date: formatDateInput(nextStart),
                                  end_date: formatDateInput(nextEnd),
                                },
                              });
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {visibility.repo && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu(openMenu === "repo" ? null : "repo")}
                  className={`flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs ${repos.length ? "border-(--accent) text-(--accent)" : ""}`}
                  aria-expanded={openMenu === "repo"}
                >
                  <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                    Repo
                  </span>
                  <span className="text-(--ink-muted)">▾</span>
                </button>
                {openMenu === "repo" && (
                  <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
                    <div className="max-h-56 overflow-auto">
                      {renderOptionList(options.repos, repos, "All", (next) =>
                        updateFilters({
                          ...filters,
                          what: { ...filters.what, repos: next },
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {visibility.developer && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenMenu(openMenu === "developer" ? null : "developer")
                  }
                  className={`flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs ${developers.length ? "border-(--accent) text-(--accent)" : ""}`}
                  aria-expanded={openMenu === "developer"}
                >
                  <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                    Developer
                  </span>
                  <span className="text-(--ink-muted)">▾</span>
                </button>
                {openMenu === "developer" && (
                  <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
                    <div className="max-h-56 overflow-auto">
                      {renderOptionList(options.developers, developers, "All", (next) =>
                        updateFilters({
                          ...filters,
                          who: { ...filters.who, developers: next },
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {visibility.workType && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu(openMenu === "work" ? null : "work")}
                  className={`flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs ${workCategory.length ? "border-(--accent) text-(--accent)" : ""}`}
                  aria-expanded={openMenu === "work"}
                >
                  <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                    Work
                  </span>
                  <span className="text-(--ink-muted)">▾</span>
                </button>
                {openMenu === "work" && (
                  <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
                    <div className="max-h-56 overflow-auto">
                      {renderOptionList(options.work_category, workCategory, "All", (next) =>
                        updateFilters({
                          ...filters,
                          why: { ...filters.why, work_category: next },
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {visibility.flowStage && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu(openMenu === "flow" ? null : "flow")}
                  className={`flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs ${flowStage.length ? "border-(--accent) text-(--accent)" : ""}`}
                  aria-expanded={openMenu === "flow"}
                >
                  <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                    Flow
                  </span>
                  <span className="text-(--ink-muted)">▾</span>
                </button>
                {openMenu === "flow" && (
                  <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
                    <div className="max-h-56 overflow-auto">
                      {renderOptionList(options.flow_stage, flowStage, "All", (next) =>
                        updateFilters({
                          ...filters,
                          how: { ...filters.how, flow_stage: next },
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {view === "people" && (
              <label className="flex items-center gap-2 text-xs">
                <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                  Search:
                </span>
                <input
                  value={peopleQuery}
                  onChange={(event) => updatePeopleQuery(event.target.value)}
                  placeholder="Name or handle"
                  className="w-full sm:w-56 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs"
                />
              </label>
            )}

            {allowAdvanced && (
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
                  showAdvanced
                    ? "border-(--accent) bg-(--accent-10) text-(--accent)"
                    : "border-(--card-stroke) bg-(--card-70) hover:border-(--ink-muted)"
                }`}
                aria-expanded={showAdvanced}
              >
                Filters
              </button>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-full border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={copyFilters}
              className="rounded-full border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {repos.map((repo) => (
            <FilterPill
              key={`repo-${repo}`}
              label="Repo"
              value={repo}
              onClear={() =>
                updateFilters({
                  ...filters,
                  what: { ...filters.what, repos: toggleValue(repos, repo) },
                })
              }
            />
          ))}
          {developers.map((dev) => (
            <FilterPill
              key={`dev-${dev}`}
              label="Dev"
              value={dev}
              onClear={() =>
                updateFilters({
                  ...filters,
                  who: { ...filters.who, developers: toggleValue(developers, dev) },
                })
              }
            />
          ))}
          {roles.map((role) => (
            <FilterPill
              key={`role-${role}`}
              label="Role"
              value={role}
              onClear={() =>
                updateFilters({
                  ...filters,
                  who: { ...filters.who, roles: toggleValue(roles, role) },
                })
              }
            />
          ))}
          {workCategory.map((cat) => (
            <FilterPill
              key={`cat-${cat}`}
              label="Work"
              value={cat}
              onClear={() =>
                updateFilters({
                  ...filters,
                  why: { ...filters.why, work_category: toggleValue(workCategory, cat) },
                })
              }
            />
          ))}
          {issueType.map((type) => (
            <FilterPill
              key={`type-${type}`}
              label="Type"
              value={type}
              onClear={() =>
                updateFilters({
                  ...filters,
                  why: { ...filters.why, issue_type: toggleValue(issueType, type) },
                })
              }
            />
          ))}
          {flowStage.map((stage) => (
            <FilterPill
              key={`stage-${stage}`}
              label="Stage"
              value={stage}
              onClear={() =>
                updateFilters({
                  ...filters,
                  how: { ...filters.how, flow_stage: toggleValue(flowStage, stage) },
                })
              }
            />
          ))}
          {artifacts.map((art) => (
            <FilterPill
              key={`art-${art}`}
              label="Artifact"
              value={art}
              onClear={() =>
                updateFilters({
                  ...filters,
                  what: {
                    ...filters.what,
                    artifacts: toggleValue(artifacts, art) as MetricFilter["what"]["artifacts"],
                  },
                })
              }
            />
          ))}
          {filters.how.blocked && (
            <FilterPill
              label="Status"
              value="Blocked"
              onClear={() =>
                updateFilters({
                  ...filters,
                  how: { ...filters.how, blocked: false },
                })
              }
            />
          )}
        </div>

        {allowAdvanced && showAdvanced && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
              <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Who
              </summary>
              <div className="mt-3 space-y-3 text-sm">
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-(--ink-muted)">Developers</span>
                  <input
                    className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                    placeholder="alice, bob"
                    value={toValue(developers)}
                    onChange={(event) =>
                      updateFilters({
                        ...filters,
                        who: { ...filters.who, developers: toList(event.target.value) },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-(--ink-muted)">Roles</span>
                  <input
                    className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                    placeholder="maintainer, reviewer"
                    value={toValue(roles)}
                    onChange={(event) =>
                      updateFilters({
                        ...filters,
                        who: { ...filters.who, roles: toList(event.target.value) },
                      })
                    }
                  />
                </label>
              </div>
            </details>

            <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
              <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                What
              </summary>
              <div className="mt-3 space-y-3 text-sm">
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-(--ink-muted)">Repos</span>
                  <input
                    className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                    placeholder="org/api, org/ui"
                    value={toValue(repos)}
                    onChange={(event) =>
                      updateFilters({
                        ...filters,
                        what: { ...filters.what, repos: toList(event.target.value) },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-(--ink-muted)">Artifacts</span>
                  <input
                    className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                    placeholder="pr, issue"
                    value={toValue(artifacts)}
                    onChange={(event) =>
                      updateFilters({
                        ...filters,
                        what: {
                          ...filters.what,
                          artifacts: toList(event.target.value) as MetricFilter["what"]["artifacts"],
                        },
                      })
                    }
                  />
                </label>
              </div>
            </details>

            <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
              <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Why
              </summary>
              <div className="mt-3 space-y-3 text-sm">
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-(--ink-muted)">Work category</span>
                  <input
                    className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                    placeholder="feature, maintenance"
                    value={toValue(workCategory)}
                    onChange={(event) =>
                      updateFilters({
                        ...filters,
                        why: { ...filters.why, work_category: toList(event.target.value) },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-(--ink-muted)">Issue type</span>
                  <input
                    className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                    placeholder="bug, story"
                    value={toValue(issueType)}
                    onChange={(event) =>
                      updateFilters({
                        ...filters,
                        why: { ...filters.why, issue_type: toList(event.target.value) },
                      })
                    }
                  />
                </label>
              </div>
            </details>

            <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
              <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                How
              </summary>
              <div className="mt-3 space-y-3 text-sm">
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-(--ink-muted)">Flow stage</span>
                  <input
                    className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                    placeholder="review, build"
                    value={toValue(flowStage)}
                    onChange={(event) =>
                      updateFilters({
                        ...filters,
                        how: { ...filters.how, flow_stage: toList(event.target.value) },
                      })
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-(--ink-muted)">
                  <input
                    type="checkbox"
                    checked={filters.how.blocked ?? false}
                    onChange={(event) =>
                      updateFilters({
                        ...filters,
                        how: { ...filters.how, blocked: event.target.checked },
                      })
                    }
                  />
                  Blocked only
                </label>
              </div>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
