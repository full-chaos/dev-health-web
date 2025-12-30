"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

const toList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const toValue = (value?: string[]) =>
  value && value.length ? value.join(", ") : "";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toLocalDate = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const formatDateInput = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateInput = (value: string) => {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const addDays = (value: Date, days: number) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);

const diffDaysInclusive = (start: Date, end: Date) => {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((endUtc - startUtc) / MS_PER_DAY) + 1);
};

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

type FilterBarProps = {
  condensed?: boolean;
  view?: FilterBarView;
  tab?: string;
};

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

export function FilterBar({ condensed, view, tab }: FilterBarProps) {
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
    const url = new URL("/api/v1/filters/options", API_BASE);
    fetch(url.toString())
      .then((response) => (response.ok ? response.json() : Promise.reject()))
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

  const visibility = resolveVisibility(view, tab);
  const allowAdvanced = view !== "people";
  const scopeLock: MetricFilter["scope"]["level"] | null =
    view === "metrics" ||
      view === "quality" ||
      view === "work" ||
      view === "investment" ||
      view === "opportunities" ||
      view === "home" ||
      view === "people"
      ? "team"
      : null;
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
  const repoValue = formatSelection(repos, "All");
  const developerValue = formatSelection(developers, "All");
  const workValue = formatSelection(workCategory, "All");
  const flowValue = formatSelection(flowStage, "All");
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
      className={`rounded-[28px] border border-(--card-stroke) p-4 shadow-sm ${condensed ? "bg-(--card-80)" : "bg-(--card-90)"
        } ${condensed ? "" : "sticky top-4"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
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
                className="w-56 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs"
              />
            </label>
          )}
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
                <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
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

          {visibility.repo && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === "repo" ? null : "repo")}
                className="flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs"
                aria-expanded={openMenu === "repo"}
              >
                <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                  Repo:
                </span>
                <span className="text-foreground">{repoValue}</span>
                <span className="text-(--ink-muted)">▾</span>
              </button>
              {openMenu === "repo" && (
                <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
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
                className="flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs"
                aria-expanded={openMenu === "developer"}
              >
                <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                  Developer:
                </span>
                <span className="text-foreground">{developerValue}</span>
                <span className="text-(--ink-muted)">▾</span>
              </button>
              {openMenu === "developer" && (
                <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
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
                className="flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs"
                aria-expanded={openMenu === "work"}
              >
                <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                  Work:
                </span>
                <span className="text-foreground">{workValue}</span>
                <span className="text-(--ink-muted)">▾</span>
              </button>
              {openMenu === "work" && (
                <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
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
                className="flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs"
                aria-expanded={openMenu === "flow"}
              >
                <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                  Flow:
                </span>
                <span className="text-foreground">{flowValue}</span>
                <span className="text-(--ink-muted)">▾</span>
              </button>
              {openMenu === "flow" && (
                <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
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

          {visibility.date && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === "date" ? null : "date")}
                className="flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs"
                aria-expanded={openMenu === "date"}
              >
                <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                  Date:
                </span>
                <span className="text-foreground">{dateValue}</span>
                <span className="text-(--ink-muted)">▾</span>
              </button>
              {openMenu === "date" && (
                <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
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
          )}
        </div>

        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          {allowAdvanced && (
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="rounded-full border border-(--card-stroke) bg-(--card-70) px-4 py-2 uppercase tracking-[0.2em]"
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? "Hide advanced" : "Advanced filters"}
            </button>
          )}
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-4 py-2 uppercase tracking-[0.2em]"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={copyFilters}
            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-4 py-2 uppercase tracking-[0.2em]"
          >
            Copy
          </button>
        </div>
      </div>

      {allowAdvanced && showAdvanced && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
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
            <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
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
            <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
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
            <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
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
    </section>
  );
}
