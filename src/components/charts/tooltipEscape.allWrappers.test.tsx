import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { render } from "@/test/utils";

import { buildTooltipHtml } from "@/lib/chartUtils";
import { useInvestmentColorMaps } from "@/components/work/investment/charts/useInvestmentColorMaps";
import { ChordChart } from "./ChordChart";
import { CompletionRangeChart } from "./CompletionRangeChart";
import { FlameDiagram } from "./FlameDiagram";
import { HeatmapChart } from "./HeatmapChart";
import { HorizontalBarChart } from "./HorizontalBarChart";
import { InvestmentMixSunburst } from "./InvestmentMixSunburst";
import { NestedPieChart2D } from "./NestedPieChart2D";
import { QuadrantChart } from "./QuadrantChart";
import { SankeyChart } from "./SankeyChart";
import { SparklineChart } from "./SparklineChart";
import { StackedAreaChart } from "./StackedAreaChart";
import { SunburstChart } from "./SunburstChart";
import { TransitionHeatmapChart } from "./TransitionHeatmapChart";
import { TreemapChart } from "./TreemapChart";
import { WorkGraphExplorer } from "./WorkGraphExplorer";

const chartTheme = {
    text: "#111827",
    grid: "#e5e7eb",
    muted: "#6b7280",
    background: "#ffffff",
    stroke: "#d1d5db",
    accent1: "#2563eb",
    accent2: "#7c3aed",
    accent3: "#ef4444",
};
const palette = Array.from({ length: 10 }, (_, i) => `#00000${i}`);

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock("./chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./chartTheme")>();
    return {
        ...actual,
        useChartTheme: () => chartTheme,
        useChartColors: () => palette,
        useChartTokens: () => actual.fallbackTokens,
    };
});
vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

const WG_EDGES = [
    {
        sourceType: "ISSUE",
        sourceId: "I1",
        targetType: "PR",
        targetId: "P1",
        edgeType: "FIXES",
        confidence: 0.8,
    },
] as never;

const HOSTILE = [
    "<img src=x onerror=alert(1)>",
    "</div><a href=javascript:alert(1)>x</a>",
    "&amp;",
];
const MARKER = '<span style="display:inline-block;width:10px"></span>';

type Formatter = (params: unknown) => string;
const tooltipFormatter = (): Formatter => {
    const props = chartSpy.mock.calls.at(-1)?.[0] as {
        option: { tooltip: { formatter: Formatter } };
    };
    return props.option.tooltip.formatter;
};

type Case = {
    name: string;
    /** Returns the formatter output for a hostile name `h`. */
    run: (h: string) => string;
};

const fromChart = (element: ReactElement, params: unknown): string => {
    chartSpy.mockClear();
    render(element);
    return tooltipFormatter()(params);
};

const CASES: Case[] = [
    {
        name: "ChordChart edge",
        run: (h) =>
            fromChart(
                <ChordChart
                    dataset={{
                        grouping: "team",
                        nodes: [
                            { id: h, label: h, isOther: false },
                            { id: "b", label: "B", isOther: false },
                        ],
                        matrix: [
                            [0, 1],
                            [1, 0],
                        ],
                        totalFlow: 2,
                        summary: {
                            topImporters: [],
                            topExporters: [],
                            strongestBilateral: [],
                            otherShare: 0,
                        },
                    }}
                />,
                { dataType: "edge", data: { source: h, target: h, value: 1 } },
            ),
    },
    {
        name: "ChordChart node",
        run: (h) =>
            fromChart(
                <ChordChart
                    dataset={{
                        grouping: "team",
                        nodes: [
                            { id: h, label: h, isOther: false },
                            { id: "b", label: "B", isOther: false },
                        ],
                        matrix: [
                            [0, 1],
                            [1, 0],
                        ],
                        totalFlow: 2,
                        summary: {
                            topImporters: [],
                            topExporters: [],
                            strongestBilateral: [],
                            otherShare: 0,
                        },
                    }}
                />,
                { data: { name: h, value: 1 } },
            ),
    },
    {
        name: "SankeyChart edge",
        run: (h) =>
            fromChart(
                <SankeyChart
                    nodes={[{ name: h }, { name: "b" }]}
                    links={[{ source: h, target: "b", value: 1 }]}
                />,
                { dataType: "edge", data: { source: h, target: h, value: 1 } },
            ),
    },
    {
        name: "SankeyChart node",
        run: (h) =>
            fromChart(<SankeyChart nodes={[{ name: h }]} links={[]} />, {
                data: { name: h, value: 1 },
            }),
    },
    {
        name: "CompletionRangeChart",
        run: (h) =>
            fromChart(
                <CompletionRangeChart
                    points={[{ day: 1, share: 0.5 }]}
                    markers={[]}
                    chanceAxisName="Chance"
                    dayLabel={() => h}
                    tooltipLines={() => [h]}
                />,
                { data: [1, 0.5] },
            ),
    },
    {
        name: "FlameDiagram",
        run: (h) =>
            fromChart(
                <FlameDiagram
                    frames={[
                        {
                            id: "f",
                            parent_id: null,
                            label: h,
                            start: "2026-01-01T00:00:00Z",
                            end: "2026-01-02T00:00:00Z",
                            state: "active",
                            category: "planned",
                        },
                    ]}
                    start="2026-01-01T00:00:00Z"
                    end="2026-01-02T00:00:00Z"
                />,
                { value: ["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", 0, h, h, h] },
            ),
    },
    {
        name: "HeatmapChart",
        run: (h) =>
            fromChart(
                <HeatmapChart
                    data={{
                        axes: { x: [h], y: [h] },
                        cells: [{ x: h, y: h, value: 3 }],
                        legend: { unit: h, scale: "linear" },
                    }}
                />,
                { value: [h, h, 3] },
            ),
    },
    {
        name: "HorizontalBarChart",
        run: (h) =>
            fromChart(<HorizontalBarChart categories={[h]} values={[1]} categoryTitles={[h]} />, [
                { name: h, dataIndex: 0, value: 1, marker: MARKER },
            ]),
    },
    {
        name: "NestedPieChart2D",
        run: (h) =>
            fromChart(
                <NestedPieChart2D
                    categories={[{ key: "k", name: h, value: 1 }]}
                    subtypes={[{ name: h, value: 1, parentKey: "k" }]}
                    unit={h}
                />,
                { seriesName: h, name: h, percent: 50, value: h },
            ),
    },
    {
        name: "QuadrantChart",
        run: (h) => {
            const point = {
                entity_id: "e",
                entity_label: h,
                x: 1,
                y: 2,
                window_start: "2026-01-01",
                window_end: "2026-01-31",
                evidence_link: "/e",
            };
            return fromChart(
                <QuadrantChart
                    data={{
                        axes: {
                            x: { metric: "m", label: h, unit: "days" },
                            y: { metric: "n", label: h, unit: "items" },
                        },
                        points: [point],
                        annotations: [],
                    }}
                />,
                { data: { point } },
            );
        },
    },
    {
        name: "SparklineChart",
        run: (h) =>
            fromChart(<SparklineChart data={[1, 2]} categories={[h, h]} />, [
                { axisValue: h, value: 1, marker: MARKER },
            ]),
    },
    {
        name: "StackedAreaChart",
        run: (h) =>
            fromChart(
                <StackedAreaChart
                    data={[{ date: h, values: { [h]: 1 } }]}
                    series={[{ name: h }]}
                    unit={h}
                />,
                [{ axisValue: h, dataIndex: 0, seriesName: h, value: 1, color: h }],
            ),
    },
    {
        name: "TransitionHeatmapChart",
        run: (h) =>
            fromChart(
                <TransitionHeatmapChart
                    data={[{ fromStatus: h, toStatus: h, count: 5 }]}
                    unit={h}
                    showSmallTransitions
                />,
                { value: [0, 0, 5, 0, h, h] },
            ),
    },
    {
        name: "SunburstChart",
        run: (h) =>
            fromChart(
                <SunburstChart
                    data={{ name: h, value: 1, children: [{ name: h, value: 1 }] }}
                    unit={h}
                />,
                { data: { name: h, value: 1 }, treePathInfo: [{ name: h }, { name: h }] },
            ),
    },
    {
        name: "TreemapChart",
        run: (h) =>
            fromChart(
                <TreemapChart
                    data={{ name: h, value: 1, children: [{ name: h, value: 1 }] }}
                    unit={h}
                />,
                { data: { name: h, value: 1 }, treePathInfo: [{ name: "root" }, { name: h }] },
            ),
    },
    {
        name: "InvestmentMixSunburst",
        run: (h) =>
            fromChart(
                <InvestmentMixSunburst
                    themeDistribution={{ quality: 1 }}
                    subcategoryDistribution={{}}
                    unit={h}
                />,
                { data: { name: h, value: 1 } },
            ),
    },
    {
        name: "WorkGraphExplorer",
        run: (h) => {
            chartSpy.mockClear();
            render(<WorkGraphExplorer edges={WG_EDGES} />);
            return (
                chartSpy.mock.calls.at(-1)?.[0] as { option: { tooltip: { formatter: Formatter } } }
            ).option.tooltip.formatter({ dataType: "node", data: { id: `${h}:1`, name: h } });
        },
    },
    {
        name: "WorkGraphExplorer edge",
        run: (h) => {
            chartSpy.mockClear();
            render(<WorkGraphExplorer edges={WG_EDGES} />);
            return (
                chartSpy.mock.calls.at(-1)?.[0] as { option: { tooltip: { formatter: Formatter } } }
            ).option.tooltip.formatter({ dataType: "edge", data: { edgeType: h } });
        },
    },
    {
        name: "lib/chartUtils buildTooltipHtml",
        run: (h) => buildTooltipHtml({ title: h, subtitle: h, value: h, unit: h, percent: 1 }),
    },
    {
        name: "investment sankey formatter (edge)",
        run: (h) =>
            sankeyFormatter(h)({ dataType: "edge", data: { source: h, target: h, value: 1 } }),
    },
    {
        name: "investment sankey formatter (node)",
        run: (h) => sankeyFormatter(h)({ data: { name: h, value: 1 } }),
    },
];

function sankeyFormatter(h: string): Formatter {
    const { result } = renderHook(() =>
        useInvestmentColorMaps({
            investmentMix: null,
            workUnits: [],
            selectedThemeKey: null,
        } as never),
    );
    const nodeMap = new Map([[h, { name: h, group: "team" }]]);
    const metrics = { totalFlow: 2, nodeValueByName: new Map([[h, 1]]) };
    const f = result.current.buildSankeyTooltipFormatter({
        nodeMap,
        metrics,
        timeRange: { start_date: h, end_date: h },
    } as never);
    return (params) => f(params, h);
}

const asDom = (html: string): HTMLElement => {
    const el = document.createElement("div");
    el.innerHTML = html; // ECharts assigns the formatter string to innerHTML
    return el;
};

describe.each(HOSTILE)("hostile name %s in every tooltip formatter", (hostile) => {
    beforeEach(() => chartSpy.mockClear());

    it.each(CASES)("$name creates no element from a served name", ({ run }) => {
        const el = asDom(run(hostile));
        expect(el.querySelector("img, a, script, iframe")).toBeNull();
    });
});

describe("tooltip formatters still show the name as text", () => {
    it.each(CASES.filter((c) => !/Sparkline|WorkGraphExplorer edge/.test(c.name)))(
        "$name",
        ({ run }) => {
            const hostile = HOSTILE[0];
            expect(asDom(run(hostile)).textContent).toContain(hostile);
        },
    );
});
