"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

const WINDOW_OPTIONS = [7, 14, 30, 90] as const;

type GlobalContextBarProps = {
  filters: MetricFilter;
  origin?: string | null;
  orgName?: string;
};

const formatSelection = (values: string[] | undefined, emptyLabel: string) => {
  if (!values?.length) return emptyLabel;
  if (values.length === 1) return values[0];
  return `${values.length} selected`;
};

export function GlobalContextBar({ filters, origin, orgName = "Meridian" }: GlobalContextBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const clearRepo = useCallback(() => {
    updateFilters({
      ...filters,
      what: { ...filters.what, repos: [] },
    });
  }, [filters, updateFilters]);

  const teamLabel =
    filters.scope.level === "team" ? formatSelection(filters.scope.ids, "All") : "All";
  const repoValues = filters.what.repos?.length
    ? filters.what.repos
    : filters.scope.level === "repo"
      ? filters.scope.ids
      : [];
  const repoLabel = formatSelection(repoValues, "All");
  const isOrgScope = filters.scope.level === "org";
  const isTeamScope = filters.scope.level === "team";
  const hasRepoScope = filters.scope.level === "repo" || repoValues.length > 0;

  return (
    <section
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
            {orgName}
          </button>
        </div>

        <span aria-hidden="true" className="text-(--ink-muted)/60">
          ·
        </span>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
            Team
          </span>
          <button
            type="button"
            onClick={() => setScopeLevel("team")}
            className={`rounded-full border px-3 py-1.5 font-medium transition-colors ${
              isTeamScope
                ? "border-(--accent-2) bg-(--accent-2)/15 text-foreground"
                : "border-(--card-stroke) bg-(--card-80) text-(--ink-muted) hover:text-foreground"
            }`}
          >
            {teamLabel}
          </button>
        </div>

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
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active ? "bg-(--accent) text-white" : "text-(--ink-muted) hover:text-foreground"
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

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
            Repo
          </span>
          <button
            type="button"
            onClick={clearRepo}
            className={`rounded-full border px-3 py-1.5 font-medium transition-colors ${
              hasRepoScope
                ? "border-(--accent-2) bg-(--accent-2)/15 text-foreground"
                : "border-(--card-stroke) bg-(--card-80) text-(--ink-muted) hover:text-foreground"
            }`}
          >
            {repoLabel}
          </button>
        </div>

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
