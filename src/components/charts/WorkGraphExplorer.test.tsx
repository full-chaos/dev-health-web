import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@/test/utils";

import type { WorkGraphEdge } from "@/lib/graphql/types";
import { WorkGraphExplorer, WorkGraphLegend } from "./WorkGraphExplorer";

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
    links: Array<{ source: string; target: string }>;
};
const series = () =>
    (chartSpy.mock.calls.at(-1)?.[0] as { option: { series: Series[] } }).option.series[0];

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
