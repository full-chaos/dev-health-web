"use client";

import { useId, useState } from "react";

import type { RenderShape } from "@/lib/ask-dev/render/contracts";
import { formatExact } from "@/lib/ask-dev/render/format";
import { pointAt, type ShapePosition } from "@/lib/ask-dev/render/series-option";

export const VALUE_TABLE_COPY = {
    show: "Show values",
    hide: "Hide values",
    values: "values",
    noPoint: "no point",
} as const;

/**
 * Every verified point of one chart as a table (CHAOS-11942, E8 design §9; port of ask-dev
 * `ShapeDataTable`): caption = the shape title, header = axis label then series labels, one row per
 * position in the chart's own order, each cell the exact served value or "—" for a series with no
 * point there (never 0). The table is always in the accessibility tree; "Show values" only makes it
 * visible, and that button is the chart's one keyboard stop.
 */
export function ShapeValueTable({
    shape,
    positions,
}: {
    readonly shape: RenderShape;
    readonly positions: readonly ShapePosition[];
}) {
    const [shown, setShown] = useState(false);
    const boxId = useId();
    return (
        <div className="space-y-1">
            <button
                type="button"
                className="text-xs font-semibold text-(--accent-2) underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                aria-expanded={shown}
                aria-controls={boxId}
                data-testid="ask-dev-shape-values-toggle"
                onClick={() => setShown((value) => !value)}
            >
                {shown ? VALUE_TABLE_COPY.hide : VALUE_TABLE_COPY.show}
            </button>
            <div
                id={boxId}
                className={shown ? "overflow-x-auto" : "sr-only"}
                data-testid="ask-dev-shape-values"
                data-shown={shown ? "true" : "false"}
                {...(shown
                    ? {
                          role: "group",
                          "aria-label": `${shape.title} ${VALUE_TABLE_COPY.values}`,
                          tabIndex: 0,
                      }
                    : {})}
            >
                <table className="w-full border-collapse text-left text-xs text-foreground">
                    <caption className="sr-only">{shape.title}</caption>
                    <thead>
                        <tr className="border-b border-(--card-stroke)">
                            <th scope="col" className="whitespace-nowrap px-2 py-1 font-semibold">
                                {shape.axis_label}
                            </th>
                            {shape.series.map((series) => (
                                <th
                                    key={series.key}
                                    scope="col"
                                    className="whitespace-nowrap px-2 py-1 font-semibold"
                                >
                                    {series.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {positions.map((position) => (
                            <tr key={position.key} className="border-b border-(--card-stroke)">
                                <th scope="row" className="whitespace-nowrap px-2 py-1 font-normal">
                                    {position.label}
                                </th>
                                {shape.series.map((series) => {
                                    const point = pointAt(series, position);
                                    return point === undefined ? (
                                        <td
                                            key={series.key}
                                            aria-label={VALUE_TABLE_COPY.noPoint}
                                            className="px-2 py-1 text-(--ink-muted)"
                                        >
                                            —
                                        </td>
                                    ) : (
                                        <td key={series.key} className="px-2 py-1 tabular-nums">
                                            {formatExact(point.value)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
