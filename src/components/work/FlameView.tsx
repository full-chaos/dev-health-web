"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAggregatedFlame } from "@/lib/api/visuals";
import type { AggregatedFlameMode, MetricFilter, AggregatedFlameResponse } from "@/lib/types";
import { HierarchicalFlameGraph } from "@/components/charts/HierarchicalFlameGraph";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { Section } from "@/components/ui/Section";

const MODES: AggregatedFlameMode[] = ["cycle_breakdown", "throughput", "code_hotspots"];

const modeLabels: Record<AggregatedFlameMode, string> = {
    cycle_breakdown: "Elapsed Time Breakdown",
    code_hotspots: "Code Hotspots",
    throughput: "Throughput Breakdown",
};

type FlameViewProps = {
    filters: MetricFilter;
};

export function FlameView({ filters }: FlameViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const modeParam = searchParams.get("mode") as AggregatedFlameMode | null;
    const initialMode: AggregatedFlameMode =
        modeParam && MODES.includes(modeParam) ? modeParam : "cycle_breakdown";

    const [mode, setMode] = useState<AggregatedFlameMode>(initialMode);
    const [flameData, setFlameData] = useState<AggregatedFlameResponse | null>(null);
    const [loading, setLoading] = useState(true);

    const contextNode = searchParams.get("context_node");

    const handleModeChange = (nextMode: AggregatedFlameMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", "flame");
        params.set("mode", nextMode);
        router.replace(`/complexity?${params.toString()}`);
    };

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
            } catch {
                if (active) {
                    setFlameData(null);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            active = false;
        };
    }, [mode, filters]);

    const hasData = flameData && flameData.root.value > 0;

    // The mode switch is the shared segmented control (prototype `.segments`, sentence case),
    // drawn left of the chart's search.
    const modeSwitch = (
        <SegmentedControl
            options={MODES.map((m) => ({ id: m, label: modeLabels[m] }))}
            value={mode}
            onChange={handleModeChange}
            ariaLabel="Breakdown"
            testId="flame-mode-switch"
        />
    );

    return (
        <div className="flex flex-col gap-6">
            <Section
                title={modeLabels[mode]}
                description="Analyze decomposition and bottlenecks in this surface."
            >
                <div className="relative min-h-48" data-testid="chart-flame">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-card/50 backdrop-blur-sm">
                            <p className="text-sm text-(--ink-muted) animate-pulse">
                                Loading flame data...
                            </p>
                        </div>
                    )}
                    {hasData ? (
                        <HierarchicalFlameGraph
                            // A new mode is a new tree: zoom and search start again.
                            key={mode}
                            root={flameData.root}
                            unit={flameData.unit}
                            colorBy={mode === "cycle_breakdown" ? "branch" : "single"}
                            toolbar={modeSwitch}
                        />
                    ) : (
                        <>
                            {modeSwitch}
                            {!loading && (
                                <div className="mt-3.5 flex h-48 items-center justify-center rounded-md border border-dashed border-(--card-stroke) bg-(--card-70) text-sm text-(--ink-muted)">
                                    No flame data available for this scope and window.
                                </div>
                            )}
                        </>
                    )}
                </div>

                {contextNode && (
                    <div className="mt-4 rounded-xl border border-(--accent-2)/20 bg-(--accent-2)/10 p-3 text-xs text-(--ink-muted)">
                        <span className="font-semibold text-(--accent-2) uppercase tracking-wider mr-2">
                            Context:
                        </span>{" "}
                        Analyzing decomposition starting from node{" "}
                        <span className="text-foreground font-mono">{contextNode}</span>
                    </div>
                )}
            </Section>
        </div>
    );
}
