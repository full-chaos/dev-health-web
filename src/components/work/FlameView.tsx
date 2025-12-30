"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getAggregatedFlame } from "@/lib/api";
import type { AggregatedFlameMode, MetricFilter, AggregatedFlameResponse } from "@/lib/types";
import { HierarchicalFlameGraph } from "@/components/charts/HierarchicalFlameGraph";

type FlameViewProps = {
    filters: MetricFilter;
};

export function FlameView({ filters }: FlameViewProps) {
    const searchParams = useSearchParams();
    const useSampleData = process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    // State from URL or defaults
    const modeParam = searchParams.get("mode") as AggregatedFlameMode | null;
    const initialMode: AggregatedFlameMode = (modeParam && ["cycle_breakdown", "throughput", "code_hotspots"].includes(modeParam))
        ? modeParam
        : "cycle_breakdown";

    const [mode, setMode] = useState<AggregatedFlameMode>(initialMode);
    const [flameData, setFlameData] = useState<AggregatedFlameResponse | null>(null);
    const [loading, setLoading] = useState(true);

    const contextNode = searchParams.get("context_node");

    useEffect(() => {
        let active = true;

        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await getAggregatedFlame({
                    mode,
                    range_days: filters.time.range_days,
                    start_date: filters.time.start_date,
                    end_date: filters.time.end_date,
                    team_id: filters.scope.level === "team" ? filters.scope.ids[0] : undefined,
                    repo_id: filters.scope.level === "repo" ? filters.scope.ids[0] : undefined,
                });
                if (!active) return;
                setFlameData(response);
                setLoading(false);
            } catch {
                if (active) {
                    setFlameData(null);
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => { active = false; };
    }, [mode, filters]);

    const modeLabels: Record<AggregatedFlameMode, string> = {
        cycle_breakdown: "Elapsed Time Breakdown",
        code_hotspots: "Code Hotspots",
        throughput: "Throughput Breakdown",
    };

    const hasData = flameData && flameData.root.value > 0;

    return (
        <div className="flex flex-col gap-6">
            <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-xl font-[var(--font-display)]">{modeLabels[mode]}</h2>
                        <p className="mt-1 text-sm text-[var(--ink-muted)]">
                            Analyze decomposition and bottlenecks in this surface.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(["cycle_breakdown", "throughput", "code_hotspots"] as AggregatedFlameMode[]).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${mode === m
                                    ? "border-[var(--accent-2)] bg-[var(--accent-2)] text-white"
                                    : "border-[var(--card-stroke)] text-[var(--ink-muted)] hover:border-[var(--card-stroke)]/60"
                                    }`}
                            >
                                {modeLabels[m]}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="relative min-h-[400px]">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--card)]/50 backdrop-blur-sm rounded-2xl">
                            <p className="text-sm text-[var(--ink-muted)] animate-pulse">Loading flame data...</p>
                        </div>
                    )}
                    {hasData ? (
                        <HierarchicalFlameGraph
                            root={flameData.root}
                            unit={flameData.unit}
                            height={500}
                        />
                    ) : !loading && (
                        <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] text-sm text-[var(--ink-muted)]">
                            No flame data available for this scope and window.
                        </div>
                    )}
                </div>

                {contextNode && hasData && (
                    <div className="mt-4 p-3 rounded-xl bg-[var(--accent-2)]/10 border border-[var(--accent-2)]/20 text-[11px] text-[var(--ink-muted)]">
                        <span className="font-semibold text-[var(--accent-2)] uppercase tracking-wider mr-2">Context:</span>
                        Analyzing decomposition starting from node <span className="text-[var(--foreground)] font-mono">{contextNode}</span>
                    </div>
                )}
            </section>
        </div>
    );
}
