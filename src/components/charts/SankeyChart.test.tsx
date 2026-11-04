import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { SankeyChart } from "./SankeyChart";
import type { SankeyLink, SankeyNode } from "@/lib/types";

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

const { chartSpy } = vi.hoisted(() => ({
    chartSpy: vi.fn(),
}));

vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
}));

vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="sankey-chart" />;
    },
}));

const sampleNodes: SankeyNode[] = [{ name: "Backlog" }, { name: "In Progress" }, { name: "Done" }];

const sampleLinks: SankeyLink[] = [
    { source: "Backlog", target: "In Progress", value: 12 },
    { source: "In Progress", target: "Done", value: 9 },
];

describe("SankeyChart", () => {
    beforeEach(() => {
        chartSpy.mockClear();
    });

    it("renders without crashing", () => {
        render(<SankeyChart nodes={sampleNodes} links={sampleLinks} />);

        expect(screen.getByTestId("sankey-chart")).toBeInTheDocument();
        expect(chartSpy).toHaveBeenCalledTimes(1);
    });

    it("renders with sample data and accepts click callbacks", () => {
        const onItemClick = vi.fn();
        render(
            <SankeyChart
                nodes={sampleNodes}
                links={sampleLinks}
                className="flow-view"
                onItemClickAction={onItemClick}
            />,
        );

        const props = chartSpy.mock.calls[0][0] as {
            className: string;
            option: { series: Array<{ data: unknown[]; links: unknown[] }> };
            onEvents?: { click: (params: unknown) => void };
        };

        expect(props.className).toBe("flow-view");
        expect(props.option.series[0]?.data).toHaveLength(3);
        expect(props.option.series[0]?.links).toHaveLength(2);

        props.onEvents?.click({
            dataType: "edge",
            data: { source: "Backlog", target: "In Progress", value: 12 },
        });
        expect(onItemClick).toHaveBeenCalledWith({
            type: "link",
            name: "",
            source: "Backlog",
            target: "In Progress",
            value: 12,
        });
    });

    it("draws theme keys as theme names and appends the node value, from the served flow only (CHAOS-8565)", () => {
        const nodes: SankeyNode[] = [
            { name: "Fullchaos", group: "team" },
            { name: "feature_delivery", group: "category" },
            { name: "dev-health-ops", group: "repo" },
        ];
        const links: SankeyLink[] = [
            { source: "Fullchaos", target: "feature_delivery", value: 75.34 },
            { source: "feature_delivery", target: "dev-health-ops", value: 75.34 },
        ];
        render(
            <SankeyChart
                nodes={nodes}
                links={links}
                nodeLabelAction={(label, group) =>
                    group === "category"
                        ? label.replace("feature_delivery", "Feature Delivery")
                        : label
                }
                showNodeValues
            />,
        );
        const props = chartSpy.mock.calls[0][0] as {
            option: {
                series: Array<{ label: { formatter: (p: unknown) => string } }>;
            };
        };
        const label = props.option.series[0].label.formatter;
        expect(label({ name: "category:feature_delivery", value: 75.34 })).toBe(
            "Feature Delivery 75.3",
        );
        // A node value the chart did not give is the larger of its in/out flow, as the tooltip.
        expect(label({ name: "repo:dev-health-ops" })).toBe("dev-health-ops 75.3");
    });

    it("a node with a value below the shown precision reads <0.1, a true zero reads 0", () => {
        const nodes: SankeyNode[] = [{ name: "A" }, { name: "B" }, { name: "C" }];
        const links: SankeyLink[] = [
            { source: "A", target: "B", value: 0.04 },
            { source: "A", target: "C", value: 0 },
        ];
        render(<SankeyChart nodes={nodes} links={links} showNodeValues />);
        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ label: { formatter: (p: unknown) => string } }> };
        };
        const label = props.option.series[0].label.formatter;
        expect(label({ name: "B", value: 0.04 })).toBe("B <0.1");
        expect(label({ name: "C", value: 0 })).toBe("C 0");
        expect(label({ name: "A", value: 0.05 })).toBe("A 0.1");
    });

    it("keeps the bare label when node values are off", () => {
        render(<SankeyChart nodes={sampleNodes} links={sampleLinks} />);
        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ label: { formatter: (p: unknown) => string } }> };
        };
        expect(props.option.series[0].label.formatter({ name: "Backlog", value: 12 })).toBe(
            "Backlog",
        );
    });

    it("handles empty data and null click payload gracefully", () => {
        const onItemClick = vi.fn();
        render(<SankeyChart nodes={[]} links={[]} onItemClickAction={onItemClick} />);

        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ data: unknown[]; links: unknown[] }> };
            onEvents?: { click: (params: unknown) => void };
        };

        expect(props.option.series[0]?.data).toHaveLength(0);
        expect(props.option.series[0]?.links).toHaveLength(0);
        expect(() => props.onEvents?.click(null)).not.toThrow();
        expect(onItemClick).not.toHaveBeenCalled();
    });

    it("degrades a raw UUID node name to Unresolved (A7)", () => {
        const UUID = "550e8400-e29b-41d4-a716-446655440000";
        render(<SankeyChart nodes={[{ name: UUID }]} links={[]} />);

        const props = chartSpy.mock.calls[0][0] as {
            option: {
                series: Array<{ label: { formatter: (params: unknown) => string } }>;
            };
        };

        const label = props.option.series[0].label.formatter({ name: UUID });
        expect(label).toBe("Unresolved");
        expect(label).not.toContain(UUID);
    });

    it("resolves a degraded node label in the click callback (A7)", () => {
        const UUID = "550e8400-e29b-41d4-a716-446655440000";
        const onItemClick = vi.fn();
        render(<SankeyChart nodes={[{ name: UUID }]} links={[]} onItemClickAction={onItemClick} />);

        const props = chartSpy.mock.calls[0][0] as {
            onEvents?: { click: (params: unknown) => void };
        };

        props.onEvents?.click({ dataType: "node", data: { name: UUID } });
        expect(onItemClick).toHaveBeenCalledWith(
            expect.objectContaining({ type: "node", name: "Unresolved" }),
        );
    });
    it("cuts a path-like name to its last segment by default (A7)", () => {
        render(<SankeyChart nodes={[{ id: "r1", name: "acme/web" }]} links={[]} />);
        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ label: { formatter: (params: unknown) => string } }> };
        };
        expect(props.option.series[0].label.formatter({ name: "r1" })).toBe("web");
    });

    it("draws a served name as given under verbatimNodeNames (CHAOS-12581)", () => {
        // Two repositories that end in the same segment stay two words, and a served word is
        // never rewritten (CHAOS-4690).
        render(
            <SankeyChart
                nodes={[
                    { id: "r1", name: "acme/web" },
                    { id: "r2", name: "other/web" },
                ]}
                links={[]}
                verbatimNodeNames
            />,
        );
        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ label: { formatter: (params: unknown) => string } }> };
        };
        const label = props.option.series[0].label.formatter;
        expect(label({ name: "r1" })).toBe("acme/web");
        expect(label({ name: "r2" })).toBe("other/web");
    });

    it("leaves animation to the theme by default, and turns it off when asked (CHAOS-12581)", () => {
        render(<SankeyChart nodes={sampleNodes} links={sampleLinks} />);
        const first = chartSpy.mock.calls[0][0] as { option: Record<string, unknown> };
        expect("animation" in first.option).toBe(false);
        chartSpy.mockClear();
        render(<SankeyChart nodes={sampleNodes} links={sampleLinks} animation={false} />);
        const second = chartSpy.mock.calls[0][0] as { option: { animation?: boolean } };
        expect(second.option.animation).toBe(false);
    });
    it("places a column's labels by depth only when asked (CHAOS-12581)", () => {
        render(<SankeyChart nodes={sampleNodes} links={sampleLinks} />);
        const plain = chartSpy.mock.calls[0][0] as {
            option: { series: Array<Record<string, unknown>> };
        };
        expect("levels" in plain.option.series[0]!).toBe(false);
        chartSpy.mockClear();
        render(
            <SankeyChart
                nodes={sampleNodes}
                links={sampleLinks}
                labelPositionByDepth={[{ depth: 1, position: "left" }]}
            />,
        );
        const placed = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ levels?: unknown }> };
        };
        expect(placed.option.series[0]!.levels).toEqual([
            { depth: 1, label: { position: "left" } },
        ]);
    });
});
