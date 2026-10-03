import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@/test/utils";

import type { WorkGraphEdge } from "@/lib/graphql/types";
import { MARGIN_LEFT, MARGIN_RIGHT } from "@/lib/workGraphLayout";
import {
    WorkGraphExplorer,
    WorkGraphLayerToggles,
    WorkGraphLegend,
    ZOOM_LEVELS,
} from "./WorkGraphExplorer";

const chartTheme = {
    text: "#111111",
    grid: "#222222",
    muted: "#333333",
    background: "#ffffff",
    stroke: "#444444",
    accent1: "#555555",
    accent2: "#666666",
    accent3: "#777777",
};
const palette = Array.from({ length: 10 }, (_, i) => `#00000${i}`);
const tokens = { negative: "#a00000", positive: "#00a000", info: "#0000a0", caution: "#a0a000" };

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));
vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => palette,
    useChartTokens: () => tokens,
}));
vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

const edge = (
    sourceType: WorkGraphEdge["sourceType"],
    sourceId: string,
    targetType: WorkGraphEdge["targetType"],
    targetId: string,
): WorkGraphEdge =>
    ({
        sourceType,
        sourceId,
        targetType,
        targetId,
        edgeType: "FIXES",
        confidence: 0.8,
    }) as WorkGraphEdge;

const edges = [
    edge("ISSUE", "I1", "PR", "P1"),
    edge("ISSUE", "I2", "PR", "P1"),
    edge("ISSUE", "I2", "PR", "P2"),
];

type Series = {
    layout: string;
    roam: boolean;
    draggable: boolean;
    data: Array<{ id: string; value?: number[]; label: { position: string } }>;
    coordinateSystem?: string;
    links: Array<{ source: string; target: string; lineStyle: { curveness: number } }>;
};
type ChartProps = {
    option: { series: Series[]; dataZoom?: unknown; xAxis?: { max: number } };
    style: { height: number; width: number | string };
    onEvents: { click: (p: unknown) => void; datazoom?: (p: unknown) => void };
};
const chartProps = () => chartSpy.mock.calls.at(-1)?.[0] as ChartProps;
const series = () => chartProps().option.series[0];

describe("WorkGraphExplorer layout modes", () => {
    beforeEach(() => chartSpy.mockClear());

    it("defaults to the layered mode for a small graph: fixed coordinates, every node placed", () => {
        render(<WorkGraphExplorer edges={edges} />);
        const s = series();
        expect(s.layout).toBe("none");
        expect(s.data).toHaveLength(4);
        expect(s.coordinateSystem).toBe("cartesian2d");
        for (const node of s.data) {
            expect(node.value).toHaveLength(2);
        }
        // two columns: issues at x=0, pull requests to the right
        const x = (id: string) => s.data.find((d) => d.id === id)!.value![0];
        expect(x("ISSUE:I1")).toBe(0);
        expect(x("PR:P1")).toBeGreaterThan(0);
    });

    it("shows the column strip with counts and a hint when fewer than three columns", () => {
        render(<WorkGraphExplorer edges={edges} />);
        expect(screen.getByTestId("work-graph-columns").textContent).toBe("Issue · 2PR · 2");
        expect(screen.getByTestId("work-graph-columns-hint").textContent).toContain("two columns");
    });

    it("no hint with three or more columns", () => {
        render(<WorkGraphExplorer edges={[...edges, edge("PR", "P1", "COMMIT", "C1")]} />);
        expect(screen.queryByTestId("work-graph-columns-hint")).toBeNull();
    });

    it("layered mode scrolls inside its own area and turns off roam so nothing fights the scroll", () => {
        render(<WorkGraphExplorer edges={edges} />);
        expect(screen.getByTestId("work-graph-scroll")).toBeTruthy();
        expect(series().roam).toBe(false);
    });

    it("a tall graph opens in Network by default; the switch still reaches Layered and the canvas grows without hiding a node", () => {
        const many = Array.from({ length: 60 }, (_, i) => edge("ISSUE", `I${i}`, "PR", `P${i}`));
        render(<WorkGraphExplorer edges={many} />);
        expect(series().layout).not.toBe("none");
        expect(screen.queryByTestId("work-graph-scroll")).toBeNull();
        fireEvent.click(screen.getByRole("radio", { name: "Layered" }));
        expect(series().layout).toBe("none");
        expect(series().data).toHaveLength(120);
        const props = chartSpy.mock.calls.at(-1)![0] as { style: { height: number } };
        expect(props.style.height).toBe(60 * 14 + 96);
    });

    it("an explicit choice survives data changes", () => {
        const many = Array.from({ length: 60 }, (_, i) => edge("ISSUE", `I${i}`, "PR", `P${i}`));
        const { rerender } = render(<WorkGraphExplorer edges={many} />);
        fireEvent.click(screen.getByRole("radio", { name: "Layered" }));
        rerender(<WorkGraphExplorer edges={edges} />);
        expect(series().layout).toBe("none");
    });

    it("Network mode keeps production's force layout and drops coordinates", () => {
        render(<WorkGraphExplorer edges={edges} />);
        fireEvent.click(screen.getByRole("radio", { name: "Network" }));
        const s = series();
        expect(s.layout).toBe("force");
        expect(s.draggable).toBe(true);
        expect(s.data.every((d) => d.value === undefined)).toBe(true);
        expect(s.coordinateSystem).toBeUndefined();
        expect(screen.queryByTestId("work-graph-columns")).toBeNull();
    });

    it("node click still reports type and id in both modes", () => {
        const onClick = vi.fn();
        render(<WorkGraphExplorer edges={edges} onNodeClickAction={onClick} />);
        const props = () =>
            chartSpy.mock.calls.at(-1)![0] as { onEvents: { click: (p: unknown) => void } };
        props().onEvents.click({ dataType: "node", data: { id: "PR:P1" } });
        expect(onClick).toHaveBeenCalledWith("P1", "PR");
        fireEvent.click(screen.getByRole("radio", { name: "Network" }));
        props().onEvents.click({ dataType: "node", data: { id: "ISSUE:I2" } });
        expect(onClick).toHaveBeenLastCalledWith("I2", "ISSUE");
    });
});

// The Dependencies tab links issue to issue, so every link stays inside ONE column. In the layered
// mode such a graph sat at the left canvas edge with its links cut off, and could not be moved.
describe("layered mode with links inside a column", () => {
    beforeEach(() => chartSpy.mockClear());

    const id = (i: number) => `I${String(i).padStart(2, "0")}`;
    // 60 issues in one column, each linked to the issue 7 rows on (the last ones wrap to the top:
    // long links in both directions), and one feature flag.
    const inner = [
        ...Array.from({ length: 60 }, (_, i) => edge("ISSUE", id(i), "ISSUE", id((i + 7) % 60))),
        edge("ISSUE", id(0), "FEATURE_FLAG", "F1"),
    ];
    const open = () => {
        render(<WorkGraphExplorer edges={inner} />);
        fireEvent.click(screen.getByRole("radio", { name: "Layered" }));
    };
    // jsdom has no layout: the explorer keeps its start width of 900 px.
    const usable = 900 - MARGIN_LEFT - MARGIN_RIGHT;
    const strip = () =>
        Array.from(screen.getByTestId("work-graph-columns").querySelectorAll("span")).map(
            (span) => ({ text: span.textContent, left: span.style.left }),
        );

    it("no link inside the column leaves the canvas on the left or crosses the labels on the right", () => {
        open();
        const s = series();
        const at = new Map(s.data.map((node) => [node.id, node.value!]));
        const inside = s.links.filter(
            (link) => at.get(link.source)![0] === at.get(link.target)![0],
        );
        expect(inside).toHaveLength(60);
        for (const link of inside) {
            const [x, y1] = at.get(link.source)!;
            const y2 = at.get(link.target)![1];
            // ECharts: control point x = mid x - (y1 - y2) * curveness, in canvas px. The curve
            // reaches half of that distance from the column: its outermost point.
            const peakX = MARGIN_LEFT + x - ((y1 - y2) * link.lineStyle.curveness) / 2;
            expect(peakX, `${link.source} to ${link.target}`).toBeGreaterThanOrEqual(0);
            expect(peakX, `${link.source} to ${link.target}`).toBeLessThanOrEqual(MARGIN_LEFT + x);
        }
    });

    it("the drawing is centred: the columns sit in the middle of their bands, not at the canvas edges", () => {
        open();
        expect(x("ISSUE:I00")).toBe(usable / 4);
        expect(x("FEATURE_FLAG:F1")).toBe((3 * usable) / 4);
        expect(strip()).toEqual([
            { text: "Issue · 60", left: `${MARGIN_LEFT + usable / 4 - 6}px` },
            { text: "Feature Flag · 1", left: `${MARGIN_LEFT + (3 * usable) / 4 - 6}px` },
        ]);
    });

    const box = () => screen.getByTestId("work-graph-scroll");
    const chart = () => screen.getByTestId("chart");
    const x = (nodeId: string) => series().data.find((d) => d.id === nodeId)!.value![0];
    const namesShift = () =>
        (screen.getByTestId("work-graph-columns").firstElementChild as HTMLElement).style.transform;
    const wheel = (init: WheelEventInit) => {
        const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
        act(() => {
            chart().dispatchEvent(event);
        });
        return event;
    };

    // Seen in a real browser: an "inside" data zoom of the chart library stops EVERY wheel event
    // over the chart, so the box (thousands of px high) could not be scrolled with the wheel.
    it("the chart library's own pan and zoom are not used: they take the wheel from the scroll box", () => {
        open();
        expect(chartProps().option.dataZoom).toBeUndefined();
        expect(series().roam).toBe(false);
        expect(chartProps().onEvents.datazoom).toBeUndefined();
        // the box scrolls both ways
        expect(box().className).toContain("overflow-auto");
        expect(box().className).not.toContain("overflow-x-hidden");
        expect(screen.getByTestId("work-graph-move-hint")).toHaveTextContent(
            "Drag or scroll to move. Zoom with the buttons or Ctrl + wheel.",
        );
    });

    it("the plain wheel is left to the box: it does not zoom and its scroll is not stopped", () => {
        open();
        const event = wheel({ deltaY: 300 });
        expect(event.defaultPrevented).toBe(false);
        expect(box().dataset.zoom).toBe("1");
        expect(chartProps().style.width).toBe("100%");
    });

    it("Ctrl + wheel (a pinch) zooms one step and stops the page zoom of the browser; a burst of events is one step", () => {
        vi.useFakeTimers();
        try {
            open();
            const first = wheel({ deltaY: -100, ctrlKey: true });
            expect(first.defaultPrevented).toBe(true);
            expect(box().dataset.zoom).toBe("1.5");
            // the next event of the same pinch: no second step, and the page still does not zoom
            const second = wheel({ deltaY: -100, ctrlKey: true });
            expect(second.defaultPrevented).toBe(true);
            expect(box().dataset.zoom).toBe("1.5");
            // later: the Command key works too, and the other direction zooms out
            vi.advanceTimersByTime(200);
            wheel({ deltaY: -100, metaKey: true });
            expect(box().dataset.zoom).toBe("2");
            vi.advanceTimersByTime(200);
            wheel({ deltaY: 100, ctrlKey: true });
            expect(box().dataset.zoom).toBe("1.5");
        } finally {
            vi.useRealTimers();
        }
    });

    it("a zoom step makes the drawing wider: the columns spread, the names follow, no node is left out; Reset zoom puts it back", () => {
        open();
        const before = strip();
        expect(chartProps().style.width).toBe("100%");
        expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        const wide = 900 * 1.5 - MARGIN_LEFT - MARGIN_RIGHT;
        expect(chartProps().style.width).toBe(1350);
        expect(chartProps().option.xAxis!.max).toBe(wide);
        expect(x("ISSUE:I00")).toBe(wide / 4);
        expect(x("FEATURE_FLAG:F1")).toBe((3 * wide) / 4);
        expect(strip()).toEqual([
            { text: "Issue · 60", left: `${MARGIN_LEFT + wide / 4 - 6}px` },
            { text: "Feature Flag · 1", left: `${MARGIN_LEFT + (3 * wide) / 4 - 6}px` },
        ]);
        expect(series().data).toHaveLength(61);
        expect(series().links).toHaveLength(61);

        fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
        expect(chartProps().style.width).toBe("100%");
        expect(strip()).toEqual(before);
        expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull();
    });

    it("each zoom button has its icon before its label (the icon is not part of the name)", () => {
        open();
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        for (const name of ["Zoom in", "Zoom out", "Reset zoom"]) {
            const button = screen.getByRole("button", { name });
            const icon = button.firstElementChild as HTMLElement;
            expect(icon.getAttribute("aria-hidden"), name).toBe("true");
            expect(icon.querySelector("svg"), name).not.toBeNull();
            expect(button.lastChild?.textContent, name).toBe(name);
        }
    });

    it("the zoom has an end on both sides", () => {
        open();
        expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
        for (let step = 1; step < ZOOM_LEVELS.length; step += 1) {
            fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        }
        expect(box().dataset.zoom).toBe(String(ZOOM_LEVELS.at(-1)));
        expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
        expect(box().dataset.zoom).toBe(String(ZOOM_LEVELS.at(-2)));
    });

    it("a zoom with a button keeps the middle of the box in place, and the column names follow", () => {
        open();
        // jsdom has no layout: give the box the width the browser gives it
        Object.defineProperty(box(), "clientWidth", { configurable: true, value: 900 });
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        // the middle was at 450 of 900 px; it is at 675 of 1350 px, so the box is scrolled by 225
        expect(box().scrollLeft).toBe(225);
        expect(namesShift()).toBe("translateX(-225px)");
    });

    it("a zoom with the wheel keeps the point under the pointer in place", () => {
        open();
        // the pointer is 300 px from the left edge of the box (jsdom: the box is at x = 0)
        wheel({ deltaY: -100, ctrlKey: true, clientX: 300 });
        // 300 of 900 px is 450 of 1350 px: scrolled by 150, so the point is still at 300
        expect(box().scrollLeft).toBe(150);
        expect(namesShift()).toBe("translateX(-150px)");
    });

    it("a drag moves the drawing: the box scrolls with the pointer, both ways, and stops at the end of the drag", () => {
        open();
        box().scrollLeft = 300;
        box().scrollTop = 500;
        fireEvent.mouseDown(chart(), { button: 0, clientX: 400, clientY: 200 });
        fireEvent.mouseMove(window, { clientX: 560, clientY: 120 });
        // pointer 160 px to the right and 80 px up: the drawing goes with it
        expect(box().scrollLeft).toBe(140);
        expect(box().scrollTop).toBe(580);
        fireEvent.scroll(box());
        expect(namesShift()).toBe("translateX(-140px)");

        fireEvent.mouseUp(window);
        fireEvent.mouseMove(window, { clientX: 0, clientY: 0 });
        expect(box().scrollLeft).toBe(140);
        expect(box().scrollTop).toBe(580);
    });

    it("the click that ends a drag does not reach the chart (a drag selects no node); a plain click does", () => {
        open();
        const reached = vi.fn();
        chart().addEventListener("click", reached);

        fireEvent.mouseDown(chart(), { button: 0, clientX: 400, clientY: 200 });
        fireEvent.mouseMove(window, { clientX: 440, clientY: 200 });
        fireEvent.mouseUp(window);
        fireEvent.click(chart());
        expect(reached).not.toHaveBeenCalled();

        // a press with a move of less than 4 px is a click: the box does not move
        const left = box().scrollLeft;
        fireEvent.mouseDown(chart(), { button: 0, clientX: 400, clientY: 200 });
        fireEvent.mouseMove(window, { clientX: 402, clientY: 201 });
        fireEvent.mouseUp(window);
        expect(box().scrollLeft).toBe(left);
        fireEvent.click(chart());
        expect(reached).toHaveBeenCalledTimes(1);
    });

    it("a drag that ended with no click does not eat the next click", () => {
        open();
        const reached = vi.fn();
        chart().addEventListener("click", reached);
        fireEvent.mouseDown(chart(), { button: 0, clientX: 400, clientY: 200 });
        fireEvent.mouseMove(window, { clientX: 440, clientY: 200 });
        fireEvent.mouseUp(window); // released outside: the browser sends no click
        fireEvent.mouseDown(chart(), { button: 0, clientX: 400, clientY: 200 });
        fireEvent.mouseUp(window);
        fireEvent.click(chart());
        expect(reached).toHaveBeenCalledTimes(1);
    });

    it("the other mouse buttons and the scroll bar of the box start no drag", () => {
        open();
        fireEvent.mouseDown(chart(), { button: 2, clientX: 400, clientY: 200 });
        fireEvent.mouseMove(window, { clientX: 300, clientY: 100 });
        fireEvent.mouseUp(window);
        // a press on the box itself is a press on its scroll bar
        fireEvent.mouseDown(box(), { button: 0, clientX: 400, clientY: 200 });
        fireEvent.mouseMove(window, { clientX: 300, clientY: 100 });
        fireEvent.mouseUp(window);
        expect(box().scrollLeft).toBe(0);
        expect(box().scrollTop).toBe(0);
    });

    it("Network mode keeps its own pan and zoom (roam): no hint, no zoom buttons", () => {
        render(<WorkGraphExplorer edges={inner} />);
        expect(series().roam).toBe(true);
        expect(chartProps().option.dataZoom).toBeUndefined();
        expect(screen.queryByTestId("work-graph-move-hint")).toBeNull();
        expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    });
});

describe("today: the Show checkboxes (Release, Feature Flag) and the legend", () => {
    beforeEach(() => chartSpy.mockClear());

    const layered = [
        edge("ISSUE", "I1", "PR", "P1"),
        edge("PR", "P1", "RELEASE", "R1"),
        edge("PR", "P1", "FEATURE_FLAG", "F1"),
    ];
    const ids = () =>
        series()
            .data.map((d) => d.id)
            .sort();

    it("both layers are shown by default and each checkbox hides and restores its nodes", () => {
        render(<WorkGraphExplorer edges={layered} />);
        expect(ids()).toEqual(["FEATURE_FLAG:F1", "ISSUE:I1", "PR:P1", "RELEASE:R1"]);
        fireEvent.click(screen.getByRole("checkbox", { name: /release/i }));
        expect(ids()).toEqual(["FEATURE_FLAG:F1", "ISSUE:I1", "PR:P1"]);
        fireEvent.click(screen.getByRole("checkbox", { name: /feature flag/i }));
        expect(ids()).toEqual(["ISSUE:I1", "PR:P1"]);
        fireEvent.click(screen.getByRole("checkbox", { name: /release/i }));
        fireEvent.click(screen.getByRole("checkbox", { name: /feature flag/i }));
        expect(ids()).toHaveLength(4);
    });

    it("both modes obey the checkboxes", () => {
        render(<WorkGraphExplorer edges={layered} />);
        fireEvent.click(screen.getByRole("checkbox", { name: /release/i }));
        fireEvent.click(screen.getByRole("radio", { name: "Network" }));
        expect(ids()).not.toContain("RELEASE:R1");
        fireEvent.click(screen.getByRole("radio", { name: "Layered" }));
        expect(ids()).not.toContain("RELEASE:R1");
    });

    it("the legend names its content and the toggle calls the handler (collapsed and open)", () => {
        const toggle = vi.fn();
        const { rerender } = render(<WorkGraphLegend collapsed onToggleAction={toggle} />);
        fireEvent.click(screen.getByRole("button", { name: /legend/i }));
        expect(toggle).toHaveBeenCalledTimes(1);
        rerender(<WorkGraphLegend collapsed={false} onToggleAction={toggle} />);
        expect(screen.getByText("Node colors + edge styles")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button"));
        expect(toggle).toHaveBeenCalledTimes(2);
    });
});

describe("layer visibility owned by the page", () => {
    beforeEach(() => chartSpy.mockClear());
    const layered = [
        edge("ISSUE", "I1", "PR", "P1"),
        edge("PR", "P1", "RELEASE", "R1"),
        edge("PR", "P1", "FEATURE_FLAG", "F1"),
    ];
    const ids = () =>
        series()
            .data.map((d) => d.id)
            .sort();

    it("with a controlled set the explorer shows no checkbox row of its own and obeys the set in both modes", () => {
        render(
            <WorkGraphExplorer
                edges={layered}
                hiddenNodeTypes={new Set(["RELEASE"] as const)}
                onToggleNodeTypeAction={() => {}}
            />,
        );
        expect(screen.queryByRole("checkbox")).toBeNull();
        expect(ids()).not.toContain("RELEASE:R1");
        fireEvent.click(screen.getByRole("radio", { name: "Network" }));
        expect(ids()).not.toContain("RELEASE:R1");
        expect(ids()).toContain("FEATURE_FLAG:F1");
    });

    it("the toggles component lists every hideable layer, checked unless hidden, and reports a click", () => {
        const toggle = vi.fn();
        render(
            <WorkGraphLayerToggles
                hiddenNodeTypes={new Set(["FEATURE_FLAG"] as const)}
                onToggleAction={toggle}
            />,
        );
        expect(screen.getAllByRole("checkbox")).toHaveLength(2);
        expect(screen.getByRole("checkbox", { name: /release/i })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: /feature flag/i })).not.toBeChecked();
        fireEvent.click(screen.getByRole("checkbox", { name: /release/i }));
        expect(toggle).toHaveBeenCalledWith("RELEASE");
    });

    it("the legend in row orientation keeps its toggle and stops using the vertical rail text", () => {
        const toggle = vi.fn();
        const { container } = render(
            <WorkGraphLegend orientation="row" collapsed onToggleAction={toggle} />,
        );
        expect(container.innerHTML).not.toContain("writing-mode");
        fireEvent.click(screen.getByRole("button", { name: /legend/i }));
        expect(toggle).toHaveBeenCalledTimes(1);
    });
});
