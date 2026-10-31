"use client";

import { Component, useCallback, useId, useMemo, type ReactNode } from "react";

import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import type { Cohort, RenderShape } from "@/lib/ask-dev/render/contracts";
import type { Outcome } from "@/lib/ask-dev/render/placement";
import {
    chartHeight,
    seriesOption,
    shapePositions,
    type ShapePosition,
} from "@/lib/ask-dev/render/series-option";

import { AskDevEChart, type ChartFailure } from "./AskDevEChart";
import { ShapeValueTable } from "./ShapeValueTable";

export const FIGURE_COPY = {
    drawing: "Drawing chart…",
    line: "Line chart",
    bars: "Bar chart",
    stackedBars: "Stacked bar chart",
    over: "over",
    by: "by",
    noTotal: "No total is shown.",
    position: "position",
    positions: "positions",
    series: "series",
    window: "Window",
} as const;

export type FigureSettle = (
    index: number,
    outcome: Exclude<Outcome, { kind: "PENDING" }>,
    elapsedMs?: number,
) => void;

type FigureProps = {
    readonly index: number;
    readonly shape: RenderShape;
    readonly cohort: Cohort | undefined;
    /** The answer window in words (`windowText`), "Window not stated" when absent. */
    readonly windowText: string;
    readonly drawn: boolean;
    readonly onSettle: FigureSettle;
    /** E8 §7.4: the coverage caption of a cohort chart (counts of members, never chart numbers). */
    readonly caption?: readonly string[];
};

/** §9 summary: presentation, axis, counts and the window. Counts only: no value, minimum or trend. */
export function figureSummary(
    shape: RenderShape,
    positions: readonly ShapePosition[],
    windowText: string,
    caption: readonly string[] = [],
): string {
    const count = positions.length;
    const line = shape.presentation === "line";
    const stacked = shape.presentation === "stacked_bars";
    const word = line ? FIGURE_COPY.line : stacked ? FIGURE_COPY.stackedBars : FIGURE_COPY.bars;
    return [
        `${word} of ${shape.value_label} ${line ? FIGURE_COPY.over : FIGURE_COPY.by} ` +
            `${shape.axis_label}: ${count} ` +
            `${count === 1 ? FIGURE_COPY.position : FIGURE_COPY.positions}, ` +
            `${shape.series.length} ${FIGURE_COPY.series}. ${FIGURE_COPY.window}: ${windowText}.`,
        ...caption,
        // G3: the stack's height is a sum the view would compute; it is never stated.
        ...(stacked ? [FIGURE_COPY.noTotal] : []),
    ].join(" ");
}

function Figure({ index, shape, cohort, windowText, drawn, onSettle, caption }: FigureProps) {
    const captionId = useId();
    const describedId = useId();
    const themeColors = useChartColors();
    const themeTokens = useChartTheme();
    const reducedMotion = usePrefersReducedMotion();
    // Keyed by value: the theme store hands out a new array when it re-reads the same tokens, and a
    // new option re-runs the chart's whole init attempt.
    const colorKey = themeColors.join(",");
    const colors = useMemo(() => colorKey.split(","), [colorKey]);
    const { text, muted, grid } = themeTokens;
    const positions = useMemo(() => shapePositions(shape, cohort), [shape, cohort]);
    const option = useMemo(
        () =>
            seriesOption(shape, positions, { colors, theme: { text, muted, grid }, reducedMotion }),
        [shape, positions, colors, text, muted, grid, reducedMotion],
    );
    const onReady = useCallback(() => onSettle(index, { kind: "DRAWN" }), [index, onSettle]);
    const onError = useCallback(
        (reason: ChartFailure, elapsedMs: number) =>
            onSettle(index, { kind: "WITHHELD", reason }, elapsedMs),
        [index, onSettle],
    );

    return (
        // The native figure role: axe rejects `role="group"` on <figure> (aria-allowed-role).
        <figure
            aria-labelledby={captionId}
            aria-describedby={describedId}
            className="space-y-1"
            data-testid="ask-dev-render-figure"
            data-shape-index={index}
            data-state={drawn ? "drawn" : "pending"}
        >
            <figcaption id={captionId} className="text-xs font-semibold text-foreground">
                {shape.title}
            </figcaption>
            <p id={describedId} className="text-xs text-(--ink-muted)">
                {drawn ? figureSummary(shape, positions, windowText, caption) : FIGURE_COPY.drawing}
            </p>
            <div aria-hidden="true">
                <AskDevEChart
                    option={option}
                    onReady={onReady}
                    onError={onError}
                    className="w-full"
                    height={chartHeight(shape)}
                />
            </div>
            {drawn ? <ShapeValueTable shape={shape} positions={positions} /> : null}
        </figure>
    );
}

type BoundaryProps = {
    readonly index: number;
    readonly onSettle: FigureSettle;
    readonly children: ReactNode;
};

/** A React error inside one figure withholds that figure only (render_error), never the answer. */
class FigureBoundary extends Component<BoundaryProps, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
    }

    componentDidCatch(): void {
        this.props.onSettle(this.props.index, { kind: "WITHHELD", reason: "render_error" });
    }

    render(): ReactNode {
        return this.state.failed ? null : this.props.children;
    }
}

/**
 * One verified, placed shape (CHAOS-11942, E8 design §4.1, §9): caption = the shape title, a
 * counts-only summary, the chart (hidden from assistive tech) and the value table. While PENDING it
 * shows the title and "Drawing chart…" and no number. It settles its ledger entry once: DRAWN on the
 * chart's `finished`, WITHHELD on an init/setOption error, a timeout or a React error.
 */
export function RenderShapeFigure(props: FigureProps) {
    return (
        <FigureBoundary index={props.index} onSettle={props.onSettle}>
            <Figure {...props} />
        </FigureBoundary>
    );
}
