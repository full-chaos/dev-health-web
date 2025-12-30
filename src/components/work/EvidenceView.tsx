"use client";

import Link from "next/link";
import { buildExploreUrl } from "@/lib/filters/url";
import { formatDelta } from "@/lib/formatters";
import type { MetricFilter, ExplainResponse } from "@/lib/types";

type EvidenceViewProps = {
    filters: MetricFilter;
    activeRole?: string;
    wipExplain: ExplainResponse | null;
    blockedExplain: ExplainResponse | null;
};

export function EvidenceView({
    filters,
    activeRole,
    wipExplain,
    blockedExplain,
}: EvidenceViewProps) {
    return (
        <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="flex items-center justify-between">
                    <h2 className="font-(--font-display) text-xl">WIP Drivers</h2>
                    <Link
                        href={buildExploreUrl({ metric: "wip_saturation", filters, role: activeRole })}
                        className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                    >
                        Inspect causes
                    </Link>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                    {(wipExplain?.drivers ?? []).slice(0, 10).map((driver) => (
                        <Link
                            key={driver.id}
                            href={buildExploreUrl({ api: driver.evidence_link, filters, role: activeRole })}
                            className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                        >
                            <span>{driver.label}</span>
                            <span className="text-xs text-(--ink-muted)">
                                {formatDelta(driver.delta_pct)}
                            </span>
                        </Link>
                    ))}
                    {!wipExplain?.drivers?.length && (
                        <p className="text-sm text-(--ink-muted)">
                            WIP driver detail will appear once data is ingested.
                        </p>
                    )}
                </div>
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="flex items-center justify-between">
                    <h2 className="font-(--font-display) text-xl">Blocked Drivers</h2>
                    <Link
                        href={buildExploreUrl({ metric: "blocked_work", filters, role: activeRole })}
                        className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                    >
                        Inspect causes
                    </Link>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                    {(blockedExplain?.drivers ?? []).slice(0, 10).map((driver) => (
                        <Link
                            key={driver.id}
                            href={buildExploreUrl({ api: driver.evidence_link, filters, role: activeRole })}
                            className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                        >
                            <span>{driver.label}</span>
                            <span className="text-xs text-(--ink-muted)">
                                {formatDelta(driver.delta_pct)}
                            </span>
                        </Link>
                    ))}
                    {!blockedExplain?.drivers?.length && (
                        <p className="text-sm text-(--ink-muted)">
                            Blocked driver detail will appear once data is ingested.
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
