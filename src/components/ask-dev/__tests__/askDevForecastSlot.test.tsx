import type { RenderShape } from "@full-chaos/ask-dev/render";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompletionRange } from "@/components/capacity/CompletionRange";
import type { CapacityForecast } from "@/lib/graphql/types";

import { askDevShapeChart } from "../askDevShapeCharts";
import { forecastSlotInput, type ForecastShapeDetail } from "../forecastSlotInput";
import pageForecast from "./fixtures/page-forecast-curve.json";
import slotForecast from "./fixtures/slot-forecast-curve.json";

// CHAOS-4613: the Ask Dev forecast slot draws one stored forecast as the capacity page does. Both
// fixtures are the SAME stored capacity_forecasts row:
// - page: through ops' real `scanForecastRow` (the GraphQL model the page reads);
// - slot: through acr's real fact writer, claim attach, summary, selector and encoder, then
//   ask-dev's real `shapeDetail` (what ask-dev hands the slot).

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));
vi.mock("@/components/charts/chartTheme", () => ({
    useChartTheme: () => ({
        text: "#111111",
        grid: "#222222",
        muted: "#333333",
        background: "#ffffff",
        stroke: "#444444",
        accent1: "#aa0001",
        accent2: "#aa0002",
        accent3: "#aa0003",
    }),
    useChartColors: () => ["#0b8fb0", "#c98500"],
}));
vi.mock("@/components/charts/Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

// DRAFT: web's ask-dev pin types the slot with one argument until it exports the forecast detail.
const slot = askDevShapeChart as (
    shape: RenderShape,
    detail?: ForecastShapeDetail,
) => ReactElement | null;

const shape = slotForecast.shape as unknown as RenderShape;
const detail = slotForecast.detail as unknown as ForecastShapeDetail;
const page = pageForecast as unknown as CapacityForecast;

type Formatter<T> = (value: T) => string;
type DrawnOption = {
    xAxis: { max: number; axisLabel: { formatter: Formatter<number> } };
    yAxis: { axisLabel: { formatter: Formatter<number> } };
    tooltip: { formatter: Formatter<unknown> };
    series: Array<{ data: Array<[number, number]>; markLine?: { data: Array<{ xAxis: number }> } }>;
};

/** The option as data, each formatter called on each value the chart draws. */
function drawn(option: DrawnOption) {
    const series = option.series[0]!;
    const days = new Set<number>([0, 1, 7, option.xAxis.max]);
    for (const [day] of series.data) days.add(day);
    for (const mark of series.markLine?.data ?? []) days.add(mark.xAxis);
    return {
        option: JSON.parse(
            JSON.stringify(option, (_key, value: unknown) =>
                typeof value === "function" ? "[formatter]" : value,
            ),
        ) as unknown,
        dayAxis: [...days]
            .sort((a, b) => a - b)
            .map((day) => [day, option.xAxis.axisLabel.formatter(day)]),
        chanceAxis: [0, 0.5, 1].map((share) => option.yAxis.axisLabel.formatter(share)),
        tooltips: series.data.map((data) => option.tooltip.formatter({ data })),
    };
}

const lastOption = () => (chartSpy.mock.calls.at(-1)?.[0] as { option: DrawnOption }).option;

beforeEach(() => {
    chartSpy.mockClear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

async function slotDrawing(slotDetail: ForecastShapeDetail = detail) {
    const element = slot(shape, slotDetail);
    expect(element).not.toBeNull();
    const { container } = render(element as ReactElement);
    await screen.findByTestId("chart");
    return { markup: container.innerHTML, chart: drawn(lastOption()) };
}

function pageDrawing() {
    const { container } = render(<CompletionRange forecast={page} />);
    return { markup: container.innerHTML, chart: drawn(lastOption()) };
}

describe("the Ask Dev forecast slot draws a stored forecast as the capacity page does (CHAOS-4613)", () => {
    it("the fixtures are one stored row: the same bins, runs and percentiles", () => {
        expect(page.completionDistribution?.days?.map((bin) => [bin.value, bin.count])).toEqual(
            detail.rows.map((row) => [row.day, row.runs]),
        );
        expect([page.p50Days, page.p85Days, page.p95Days]).toEqual([
            detail.summary.forecast_p50_days,
            detail.summary.forecast_p85_days,
            detail.summary.forecast_p95_days,
        ]);
    });

    it("draws the same chart and the same words from the slot as from the page", async () => {
        const fromPage = pageDrawing();
        cleanup();
        const fromSlot = await slotDrawing();
        expect(fromSlot.chart).toEqual(fromPage.chart);
        expect(fromSlot.markup).toBe(fromPage.markup);
    });

    it("a slot that drops a served value no longer draws what the page draws", async () => {
        const fromPage = pageDrawing();
        cleanup();
        const { unfinished_runs: _dropped, ...summary } = detail.summary;
        const fromSlot = await slotDrawing({ ...detail, summary });
        expect(fromSlot.markup).not.toBe(fromPage.markup);
    });

    it("reads only served fields: no item count, since acr serves none", () => {
        expect(forecastSlotInput(detail).targetItems).toBeUndefined();
        expect(forecastSlotInput(detail).bins).toEqual(
            detail.rows.map((row) => ({
                day: row.day,
                count: row.runs,
                cumulativeShare: row.cumulativeShare,
            })),
        );
    });

    it("gives no chart for a forecast with no detail, so ask-dev shows its table", () => {
        expect(slot(shape)).toBeNull();
        expect(slot(shape, { ...detail, rows: [] })).toBeNull();
    });
});
