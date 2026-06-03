import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";

import { QuadrantChart, buildQuadrantOption } from "./QuadrantChart";
import type { QuadrantResponse } from "@/lib/types";

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

const chartColors = ["#2563eb", "#14b8a6", "#f97316"];

const { chartSpy } = vi.hoisted(() => ({
	chartSpy: vi.fn(),
}));

vi.mock("./chartTheme", () => ({
	useChartTheme: () => chartTheme,
	useChartColors: () => chartColors,
}));

vi.mock("./Chart", () => ({
	Chart: (props: unknown) => {
		chartSpy(props);
		return <div data-testid="quadrant-chart" />;
	},
}));

const sampleData: QuadrantResponse = {
	axes: {
		x: { metric: "cycle_time", label: "Cycle Time", unit: "days" },
		y: { metric: "throughput", label: "Throughput", unit: "items" },
	},
	points: [
		{
			entity_id: "team-a",
			entity_label: "Team A",
			x: 4.2,
			y: 18,
			window_start: "2026-01-01",
			window_end: "2026-01-31",
			evidence_link: "/evidence/team-a",
		},
	],
	annotations: [],
};

describe("QuadrantChart", () => {
	beforeEach(() => {
		chartSpy.mockClear();
	});

	it("renders without crashing", () => {
		render(<QuadrantChart data={sampleData} />);

		expect(screen.getByTestId("quadrant-chart")).toBeInTheDocument();
		expect(chartSpy).toHaveBeenCalledTimes(1);
	});

	it("renders with sample data and forwards props", () => {
		render(
			<QuadrantChart data={sampleData} className="chart-shell" height={420} />,
		);

		const props = chartSpy.mock.calls[0][0] as {
			option: {
				xAxis: { name: string };
				series: Array<{ data: unknown[] }>;
			};
			className: string;
			style: { height: number; width: string };
			onEvents: { click: (params: unknown) => void };
		};

		expect(props.className).toBe("chart-shell");
		expect(props.style).toMatchObject({ height: 420, width: "100%" });
		expect(props.option.xAxis.name).toContain("Cycle Time (days)");
		expect(props.option.series[0]?.data).toHaveLength(1);
		expect(typeof props.onEvents.click).toBe("function");
	});

	it("handles empty data and null click payload gracefully", () => {
		render(
			<QuadrantChart
				data={{
					...sampleData,
					points: [],
					annotations: [],
				}}
			/>,
		);

		const props = chartSpy.mock.calls[0][0] as {
			option: { series: Array<{ data: unknown[] }> };
			onEvents: { click: (params: unknown) => void };
		};

		expect(props.option.series[0]?.data).toHaveLength(0);
		expect(() => props.onEvents.click(null)).not.toThrow();
	});

	it("degrades a raw UUID entity_label to a stable short token in the tooltip (A7)", () => {
		const UUID = "550e8400-e29b-41d4-a716-446655440000";
		const option = buildQuadrantOption({
			data: {
				axes: {
					x: { metric: "x", label: "Cycle Time", unit: "days" },
					y: { metric: "y", label: "Throughput", unit: "items" },
				},
				points: [
					{
						entity_id: UUID,
						entity_label: UUID,
						x: 1,
						y: 2,
						window_start: "",
						window_end: "",
						evidence_link: "",
					},
				],
				annotations: [],
			},
			chartTheme,
			colors: chartColors,
			scopeType: "repo",
		});

		const formatter = (
			option.tooltip as { formatter: (params: unknown) => string }
		).formatter;
		const html = formatter({
			componentType: "scatter",
			data: { point: { entity_id: UUID, entity_label: UUID, x: 1, y: 2 } },
		});

		expect(html).toContain("#550e8400");
		expect(html).not.toContain(UUID);
	});

	it("renders a readable entity_label unchanged in the tooltip", () => {
		const option = buildQuadrantOption({
			data: sampleData,
			chartTheme,
			colors: chartColors,
			scopeType: "team",
		});

		const formatter = (
			option.tooltip as { formatter: (params: unknown) => string }
		).formatter;
		const html = formatter({
			componentType: "scatter",
			data: { point: sampleData.points[0] },
		});

		expect(html).toContain("Team A");
	});
});
