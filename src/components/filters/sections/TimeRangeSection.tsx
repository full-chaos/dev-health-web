import {
  diffDaysInclusive,
  formatDateInput,
  parseDateInput,
  toLocalDate,
} from "@/lib/dateUtils";
import type { MetricFilter } from "@/lib/filters/types";
import { DATE_PRESETS } from "../filterBarUtils";

type TimeRangeSectionProps = {
  dateValue: string;
  endDate: Date;
  filters: MetricFilter;
  isCustomDateRange: boolean;
  onDatePreset: (days: number) => void;
  openMenu: string | null;
  setOpenMenu: (value: string | null) => void;
  startDate: Date;
  updateFilters: (nextFilters: MetricFilter) => void;
};

export function TimeRangeSection({
  dateValue,
  endDate,
  filters,
  isCustomDateRange,
  onDatePreset,
  openMenu,
  setOpenMenu,
  startDate,
  updateFilters,
}: TimeRangeSectionProps) {
  return (
    <div className="flex items-center rounded-full border border-(--card-stroke) bg-card p-1">
      {DATE_PRESETS.map((preset) => (
        <button
          key={preset.days}
          type="button"
          onClick={() => onDatePreset(preset.days)}
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
            isCustomDateRange
              ? "bg-(--accent) text-white"
              : "text-(--ink-muted) hover:text-foreground"
          }`}
        >
          {isCustomDateRange ? dateValue : "Custom"}
        </button>
        {openMenu === "date" && (
          <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
            <div className="grid gap-3 text-xs">
              <label className="flex flex-col gap-2">
                <span className="uppercase tracking-[0.2em] text-(--ink-muted)">
                  Start date
                </span>
                <input
                  className="rounded-xl border border-(--card-stroke) bg-(--card-60) px-3 py-2 text-sm"
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
                  className="rounded-xl border border-(--card-stroke) bg-(--card-60) px-3 py-2 text-sm"
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
  );
}
