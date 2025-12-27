"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

const toList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const toValue = (value?: string[]) => (value && value.length ? value.join(", ") : "");

type FilterBarProps = {
  condensed?: boolean;
};

export function FilterBar({ condensed }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const encoded = searchParams.get("f");
  const initialFilters = useMemo(() => decodeFilter(encoded), [encoded]);
  const [filters, setFilters] = useState<MetricFilter>(initialFilters);

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

  const updateUrl = (nextFilters: MetricFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("f", encodeFilterParam(nextFilters));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const updateFilters = (nextFilters: MetricFilter) => {
    setFilters(nextFilters);
    updateUrl(nextFilters);
  };

  const resetFilters = () => {
    updateFilters(defaultMetricFilter);
  };

  const copyFilters = async () => {
    const payload = JSON.stringify(filters, null, 2);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
    }
  };

  return (
    <section
      className={`rounded-[28px] border border-[var(--card-stroke)] bg-[var(--card-90)] p-5 shadow-sm ${
        condensed ? "" : "sticky top-4"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Filters
          </p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Share or paste the filter JSON from this bar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={copyFilters}
            className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-2 uppercase tracking-[0.2em]"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-2 uppercase tracking-[0.2em]"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
        <div className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Time
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Range days</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                type="number"
                min={1}
                value={filters.time.range_days}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    time: {
                      ...filters.time,
                      range_days: Number(event.target.value || 1),
                    },
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Compare days</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                type="number"
                min={1}
                value={filters.time.compare_days}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    time: {
                      ...filters.time,
                      compare_days: Number(event.target.value || 1),
                    },
                  })
                }
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Scope
          </p>
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Level</span>
              <select
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                value={filters.scope.level}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    scope: {
                      ...filters.scope,
                      level: event.target.value as MetricFilter["scope"]["level"],
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
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">IDs</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                placeholder="team-a, team-b"
                value={toValue(filters.scope.ids)}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    scope: { ...filters.scope, ids: toList(event.target.value) },
                  })
                }
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Inspectable Filter
          </p>
          <pre className="mt-3 max-h-48 overflow-auto rounded-xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-3 text-[11px] text-[var(--ink-muted)]">
            {JSON.stringify(filters, null, 2)}
          </pre>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <details className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-4">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Who
          </summary>
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Developers</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                placeholder="alice, bob"
                value={toValue(filters.who.developers)}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    who: { ...filters.who, developers: toList(event.target.value) },
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Roles</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                placeholder="maintainer, reviewer"
                value={toValue(filters.who.roles)}
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

        <details className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-4">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            What
          </summary>
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Repos</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                placeholder="org/api, org/ui"
                value={toValue(filters.what.repos)}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    what: { ...filters.what, repos: toList(event.target.value) },
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Artifacts</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                placeholder="pr, issue"
                value={toValue(filters.what.artifacts)}
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

        <details className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-4">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Why
          </summary>
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Work category</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                placeholder="feature, maintenance"
                value={toValue(filters.why.work_category)}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    why: { ...filters.why, work_category: toList(event.target.value) },
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Issue type</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                placeholder="bug, story"
                value={toValue(filters.why.issue_type)}
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

        <details className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-4">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            How
          </summary>
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-[var(--ink-muted)]">Flow stage</span>
              <input
                className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                placeholder="review, build"
                value={toValue(filters.how.flow_stage)}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    how: { ...filters.how, flow_stage: toList(event.target.value) },
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
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
    </section>
  );
}
