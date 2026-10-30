"use client";

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
        </div>
    );
}
