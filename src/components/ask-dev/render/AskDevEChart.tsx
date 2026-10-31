"use client";

import type { EChartsOption } from "echarts";
import { LineChart } from "echarts/charts";
import { useEffect, useRef, useState } from "react";

import { echarts } from "@/lib/echartsInit";

echarts.use([LineChart]);

/** How long a chart may take to report `finished` before it is WITHHELD (E8 design §4.1). */
export const CHART_READY_TIMEOUT_MS = 5000;

export type ChartFailure = "render_error" | "render_timeout";

type Props = {
    readonly option: EChartsOption;
    readonly onReady: () => void;
    readonly onError: (reason: ChartFailure, elapsedMs: number) => void;
    readonly className?: string;
};

/**
 * The E8 ECharts adapter (CHAOS-11942, E8 design §4.1). The shared `Chart` wrapper reports no
 * ready or error state, so Ask Dev charts do not use it, and it stays unchanged.
 *
 * One attempt per option, in this order: `echarts.init`; the `finished` listener and the timer;
 * then `setOption`. ECharts can emit `finished` inside `setOption` when animation is off, so a
 * listener added after it would miss the event and the chart would time out while drawn. The
 * attempt settles once, on the first of `finished` (ready), a throw (render_error) or the timer
 * (render_timeout); a later event is ignored. `data-chart-ready="true"` only after `finished`.
 */
export function AskDevEChart({ option, onReady, onError, className }: Props) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [ready, setReady] = useState(false);
    const callbacks = useRef({ onReady, onError });

    useEffect(() => {
        callbacks.current = { onReady, onError };
    }, [onReady, onError]);

    useEffect(() => {
        const element = ref.current;
        if (element === null) return;
        const started = Date.now();
        let chart: ReturnType<typeof echarts.init>;
        try {
            chart = echarts.init(element, null, { renderer: "canvas" });
        } catch {
            callbacks.current.onError("render_error", Date.now() - started);
            return;
        }

        let settled = false;
        // (2) before (3): the listener and the timer exist before setOption can emit `finished`.
        const onFinished = () => settle("ready");
        chart.on("finished", onFinished);
        const timer = setTimeout(() => settle("render_timeout"), CHART_READY_TIMEOUT_MS);
        function settle(outcome: "ready" | ChartFailure) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            chart.off("finished", onFinished);
            if (outcome === "ready") {
                setReady(true);
                callbacks.current.onReady();
            } else {
                callbacks.current.onError(outcome, Date.now() - started);
            }
        }
        try {
            chart.setOption(option, { notMerge: true });
        } catch {
            settle("render_error");
        }

        const observer =
            typeof ResizeObserver === "undefined"
                ? undefined
                : new ResizeObserver(() => chart.resize());
        observer?.observe(element);
        return () => {
            settled = true;
            clearTimeout(timer);
            observer?.disconnect();
            chart.off("finished", onFinished);
            chart.dispose();
        };
    }, [option]);

    return (
        <div
            ref={ref}
            className={className}
            data-testid="ask-dev-echart"
            data-chart-ready={ready ? "true" : "false"}
            data-animation={option.animation === false ? "off" : "on"}
        />
    );
}
