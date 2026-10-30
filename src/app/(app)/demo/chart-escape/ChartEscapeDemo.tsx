"use client";

import { HeatmapChart } from "@/components/charts/HeatmapChart";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { VerticalBarChart } from "@/components/charts/VerticalBarChart";

// Test-mode fixture: served names are attacker-controlled text (synced provider data).
// The tooltip must show them as literal text. Used by tests/chart-tooltip-escape.spec.ts.
const HOSTILE_NAMES = [
    "<img src=x onerror=alert(1)>",
    "</div><a href=javascript:alert(1)>x</a>",
    "&amp;",
];

export function ChartEscapeDemo() {
    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
            <div data-testid="escape-vertical-bar">
                <VerticalBarChart
                    categories={HOSTILE_NAMES}
                    series={[
                        { name: HOSTILE_NAMES[0], data: [3, 5, 4] },
                        { name: HOSTILE_NAMES[1], data: [2, 4, 6] },
                    ]}
                />
            </div>
            <div data-testid="escape-timeseries">
                <TimeseriesChart
                    data={HOSTILE_NAMES.map((label, i) => ({
                        day: `2026-10-0${i + 1}`,
                        label,
                        value: i + 1,
                    }))}
                />
            </div>
            <div data-testid="escape-heatmap">
                <HeatmapChart
                    data={{
                        axes: { x: [HOSTILE_NAMES[0], "Tue"], y: [HOSTILE_NAMES[1], "Bob"] },
                        cells: [
                            { x: HOSTILE_NAMES[0], y: HOSTILE_NAMES[1], value: 3 },
                            { x: "Tue", y: "Bob", value: 7 },
                        ],
                        legend: { unit: HOSTILE_NAMES[2], scale: "linear" },
                    }}
                />
            </div>
            <div data-testid="escape-sankey">
                <SankeyChart
                    nodes={[{ name: HOSTILE_NAMES[0] }, { name: HOSTILE_NAMES[1] }]}
                    links={[{ source: HOSTILE_NAMES[0], target: HOSTILE_NAMES[1], value: 5 }]}
                />
            </div>
        </div>
    );
}
