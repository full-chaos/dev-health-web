import Link from "next/link";

import { HierarchicalFlameGraph } from "@/components/charts/HierarchicalFlameGraph";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getAggregatedFlame } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import type { AggregatedFlameMode } from "@/lib/types";

type FlamePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FlamePage({ searchParams }: FlamePageProps) {
    const health = await checkApiHealth();
    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter
        ? decodeFilter(encodedFilter)
        : filterFromQueryParams(params);

    const modeParam = (Array.isArray(params.mode) ? params.mode[0] : params.mode) ?? "cycle_breakdown";
    const mode: AggregatedFlameMode =
        modeParam === "code_hotspots" ? "code_hotspots" : "cycle_breakdown";

    const teamId = filters.scope.level === "team" && filters.scope.ids.length
        ? filters.scope.ids[0]
        : undefined;
    const repoId = filters.scope.level === "repo" && filters.scope.ids.length
        ? filters.scope.ids[0]
        : undefined;

    const flameData = await getAggregatedFlame({
        mode,
        range_days: filters.time.range_days,
        start_date: filters.time.start_date,
        end_date: filters.time.end_date,
        team_id: teamId,
        repo_id: repoId,
    }).catch(() => null);

    const modeLabels: Record<AggregatedFlameMode, string> = {
        cycle_breakdown: "Cycle-Time Breakdown",
        code_hotspots: "Code Hotspots",
    };

    const modeDescriptions: Record<AggregatedFlameMode, string> = {
        cycle_breakdown: "Shows where time is spent across work states. Drill into categories to see individual status durations.",
        code_hotspots: "Shows where code churn concentrates by file path. Drill into repos and directories to identify hotspots.",
    };

    const hasData = flameData && flameData.root.value > 0;
    const notes = flameData?.meta.notes ?? [];

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                                Investigation
                            </p>
                            <h1 className="mt-2 font-[var(--font-display)] text-3xl">
                                Flame Diagram
                            </h1>
                            <p className="mt-2 text-sm text-[var(--ink-muted)]">
                                Drill into hierarchical breakdowns to understand where time or change concentrates.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href={withFilterParam("/", filters)}
                                className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
                            >
                                Back to cockpit
                            </Link>
                        </div>
                    </header>

                    {/* Mode Selector */}
                    <section className="flex flex-wrap gap-3">
                        {(["cycle_breakdown", "code_hotspots"] as AggregatedFlameMode[]).map((m) => (
                            <Link
                                key={m}
                                href={withFilterParam(`/flame?mode=${m}`, filters)}
                                className={`
                  rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em]
                  ${m === mode
                                        ? "border-[var(--accent-2)] bg-[var(--accent-2)] text-white"
                                        : "border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)]"
                                    }
                `}
                            >
                                {modeLabels[m]}
                            </Link>
                        ))}
                    </section>

                    {/* Context Card */}
                    <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                                    Mode
                                </p>
                                <p className="mt-1 text-sm font-semibold">{modeLabels[mode]}</p>
                                <p className="mt-2 text-sm text-[var(--ink-muted)]">
                                    {modeDescriptions[mode]}
                                </p>
                            </div>
                            <div className="text-right text-xs text-[var(--ink-muted)]">
                                <p>
                                    {flameData?.meta.window_start} – {flameData?.meta.window_end}
                                </p>
                                <p className="mt-1">
                                    Unit: {flameData?.unit ?? "—"}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Notes/Empty State */}
                    {notes.length > 0 && (
                        <section className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] p-4 text-sm text-[var(--ink-muted)]">
                            {notes.map((note, idx) => (
                                <p key={idx}>{note}</p>
                            ))}
                        </section>
                    )}

                    {/* Flame Graph */}
                    {hasData && flameData ? (
                        <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
                            <HierarchicalFlameGraph
                                root={flameData.root}
                                unit={flameData.unit}
                                height={450}
                            />
                        </section>
                    ) : (
                        <section className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] p-8 text-center">
                            <p className="text-sm text-[var(--ink-muted)]">
                                No data available for this window and scope.
                            </p>
                            <p className="mt-2 text-xs text-[var(--ink-muted)]">
                                Try adjusting the date range or scope filters.
                            </p>
                        </section>
                    )}

                    {/* Filter Context */}
                    <section className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-4">
                        <details>
                            <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                                Active filters
                            </summary>
                            <pre className="mt-3 max-h-48 overflow-auto rounded-xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 text-xs text-[var(--ink-muted)]">
                                {JSON.stringify(filters, null, 2)}
                            </pre>
                        </details>
                    </section>
                </main>
            </div>
        </div>
    );
}
