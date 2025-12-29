"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type PersonRangeBarProps = {
  rangeDays: number;
  compareDays: number;
};

export function PersonRangeBar({ rangeDays, compareDays }: PersonRangeBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [range, setRange] = useState(rangeDays);
  const [compare, setCompare] = useState(compareDays);

  useEffect(() => {
    setRange(rangeDays);
    setCompare(compareDays);
  }, [rangeDays, compareDays]);

  const updateParams = (nextRange: number, nextCompare: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range_days", String(nextRange));
    params.set("compare_days", String(nextCompare));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-90)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Time range
          </p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Applies to this individual only.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-xs text-[var(--ink-muted)]">Range days</span>
          <input
            className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
            type="number"
            min={1}
            value={range}
            onChange={(event) => {
              const next = Number(event.target.value || 1);
              setRange(next);
              updateParams(next, compare);
            }}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-xs text-[var(--ink-muted)]">
            Compare days (previous window)
          </span>
          <input
            className="rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
            type="number"
            min={1}
            value={compare}
            onChange={(event) => {
              const next = Number(event.target.value || 1);
              setCompare(next);
              updateParams(range, next);
            }}
          />
        </label>
      </div>
    </section>
  );
}
