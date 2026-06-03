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

const sampleNodes: SankeyNode[] = [
	{ name: "Backlog" },
	{ name: "In Progress" },
	{ name: "Done" },
];

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
				onItemClick={onItemClick}
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

	it("handles empty data and null click payload gracefully", () => {
		const onItemClick = vi.fn();
		render(<SankeyChart nodes={[]} links={[]} onItemClick={onItemClick} />);

		const props = chartSpy.mock.calls[0][0] as {
			option: { series: Array<{ data: unknown[]; links: unknown[] }> };
			onEvents?: { click: (params: unknown) => void };
		};

		expect(props.option.series[0]?.data).toHaveLength(0);
		expect(props.option.series[0]?.links).toHaveLength(0);
		expect(() => props.onEvents?.click(null)).not.toThrow();
		expect(onItemClick).not.toHaveBeenCalled();
	});

	it("degrades a raw UUID node name to a stable short token (A7)", () => {
		const UUID = "550e8400-e29b-41d4-a716-446655440000";
		render(<SankeyChart nodes={[{ name: UUID }]} links={[]} />);

		const props = chartSpy.mock.calls[0][0] as {
			option: {
				series: Array<{ label: { formatter: (params: unknown) => string } }>;
			};
		};

		const label = props.option.series[0].label.formatter({ name: UUID });
		expect(label).toBe("#550e8400");
		expect(label).not.toContain(UUID);
	});

	it("resolves a degraded node label in the click callback (A7)", () => {
		const UUID = "550e8400-e29b-41d4-a716-446655440000";
		const onItemClick = vi.fn();
		render(
			<SankeyChart
				nodes={[{ name: UUID }]}
				links={[]}
				onItemClick={onItemClick}
			/>,
		);

		const props = chartSpy.mock.calls[0][0] as {
			onEvents?: { click: (params: unknown) => void };
		};

		props.onEvents?.click({ dataType: "node", data: { name: UUID } });
		expect(onItemClick).toHaveBeenCalledWith(
			expect.objectContaining({ type: "node", name: "#550e8400" }),
		);
	});
});
