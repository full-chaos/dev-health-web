"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

type PersonRangeBarProps = {
  rangeDays: number;
  compareDays: number;
};

export function PersonRangeBar({ rangeDays, compareDays }: PersonRangeBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rangeParam = Number(searchParams.get("range_days") ?? rangeDays);
  const range = Number.isFinite(rangeParam) && rangeParam > 0 ? rangeParam : 14;

  const startDateParam = searchParams.get("start_date");
  const endDateParam = searchParams.get("end_date");

  const today = toLocalDate(new Date());
  const parsedStart = startDateParam ? parseDateInput(startDateParam) : null;
  const parsedEnd = endDateParam ? parseDateInput(endDateParam) : null;
  const resolvedEnd = toLocalDate(parsedEnd ?? today);
  const resolvedStart = toLocalDate(
    parsedStart ?? addDays(resolvedEnd, -(range - 1))
  );
  const startDate = resolvedStart > resolvedEnd ? resolvedEnd : resolvedStart;
  const endDate = resolvedStart > resolvedEnd ? resolvedStart : resolvedEnd;

  const updateParams = (nextStart: Date, nextEnd: Date) => {
    const nextRangeDays = diffDaysInclusive(nextStart, nextEnd);
    const params = new URLSearchParams(searchParams.toString());
    params.set("range_days", String(nextRangeDays));
    params.set("compare_days", String(nextRangeDays));
    params.set("start_date", formatDateInput(nextStart));
    params.set("end_date", formatDateInput(nextEnd));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="rounded-3xl border border-(--card-stroke) bg-(--card-90) p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
            Date range
          </p>
          <p className="mt-1 text-sm text-(--ink-muted)">
            Applies to this individual only.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-xs text-(--ink-muted)">Start date</span>
          <input
            className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
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
              updateParams(nextStart, nextEnd);
            }}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-xs text-(--ink-muted)">End date</span>
          <input
            className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
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
              updateParams(nextStart, nextEnd);
            }}
          />
        </label>
      </div>
    </section>
  );
}
