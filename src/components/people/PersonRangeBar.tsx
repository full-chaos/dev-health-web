"use client";

import { useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
    addDays,
    diffDaysInclusive,
    formatDateInput,
    parseDateInput,
    toLocalDate,
} from "@/lib/dateUtils";

// Two-pass hydration guard: `getServerSnapshot` returns false so SSR never
// takes the client branch, avoiding mismatches when the server and client
// read `new Date()` at different moments. Same pattern as ClientTimestamp.
// Ref: https://react.dev/reference/react-dom/client/hydrateRoot#hydrating-server-rendered-html
const subscribe = () => () => {};
const getIsClientSnapshot = () => true;
const getServerSnapshot = () => false;

type PersonRangeBarProps = {
    rangeDays: number;
};

export function PersonRangeBar({ rangeDays }: PersonRangeBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const isClient = useSyncExternalStore(subscribe, getIsClientSnapshot, getServerSnapshot);

    const rangeParam = Number(searchParams.get("range_days") ?? rangeDays);
    const range = Number.isFinite(rangeParam) && rangeParam > 0 ? rangeParam : 14;

    const startDateParam = searchParams.get("start_date");
    const endDateParam = searchParams.get("end_date");

    const today = toLocalDate(new Date());
    const parsedStart = startDateParam ? parseDateInput(startDateParam) : null;
    const parsedEnd = endDateParam ? parseDateInput(endDateParam) : null;
    const resolvedEnd = toLocalDate(parsedEnd ?? today);
    const resolvedStart = toLocalDate(parsedStart ?? addDays(resolvedEnd, -(range - 1)));
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
        <section className="rounded-3xl border border-(--border) bg-(--card-90) p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                        Date range
                    </p>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        Applies to this individual only.
                    </p>
                </div>
            </div>
            {isClient ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm">
                        <span className="text-xs text-(--ink-muted)">Start date</span>
                        <input
                            className="rounded-xl border border-(--border) bg-card px-3 py-2"
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
                            className="rounded-xl border border-(--border) bg-card px-3 py-2"
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
            ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-hidden="true">
                    <div className="flex flex-col gap-2">
                        <div className="h-3 w-16 rounded bg-(--card-70) animate-pulse" />
                        <div className="h-10 rounded-xl border border-(--border) bg-(--card-70) animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="h-3 w-16 rounded bg-(--card-70) animate-pulse" />
                        <div className="h-10 rounded-xl border border-(--border) bg-(--card-70) animate-pulse" />
                    </div>
                </div>
            )}
        </section>
    );
}
