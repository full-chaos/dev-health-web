import type { MetricFilter } from "@/lib/filters/types";
import { OptionList } from "./OptionList";

type ScopeSectionProps = {
  effectiveScopeIds: string[];
  filters: MetricFilter;
  openMenu: string | null;
  scopeEmptyLabel: string;
  scopeLabel: string;
  scopeLevel: MetricFilter["scope"]["level"];
  scopeLock: MetricFilter["scope"]["level"] | null;
  scopeOptions: string[];
  scopeValue: string;
  setOpenMenu: (value: string | null) => void;
  toggleValue: (values: string[], value: string) => string[];
  updateFilters: (nextFilters: MetricFilter) => void;
};

export function ScopeSection({
  effectiveScopeIds,
  filters,
  openMenu,
  scopeEmptyLabel,
  scopeLabel,
  scopeLevel,
  scopeLock,
  scopeOptions,
  scopeValue,
  setOpenMenu,
  toggleValue,
  updateFilters,
}: ScopeSectionProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpenMenu(openMenu === "scope" ? null : "scope")}
        className="flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs"
        aria-expanded={openMenu === "scope"}
      >
        <span className="uppercase tracking-[0.2em] text-(--ink-muted)">{scopeLabel}:</span>
        <span className="text-foreground">{scopeValue}</span>
        <span className="text-(--ink-muted)">▾</span>
      </button>
      {openMenu === "scope" && (
        <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
          {!scopeLock && (
            <label className="flex flex-col gap-2 text-xs">
              <span className="uppercase tracking-[0.2em] text-(--ink-muted)">Scope level</span>
              <select
                className="rounded-xl border border-(--card-stroke) bg-(--card-60) px-3 py-2 text-sm"
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
            <OptionList
              emptyLabel={scopeEmptyLabel}
              items={scopeOptions}
              onChange={(next) =>
                updateFilters({
                  ...filters,
                  scope: { ...filters.scope, level: scopeLevel, ids: next },
                })
              }
              selected={effectiveScopeIds}
              toggleValue={toggleValue}
            />
          </div>
        </div>
      )}
    </div>
  );
}
