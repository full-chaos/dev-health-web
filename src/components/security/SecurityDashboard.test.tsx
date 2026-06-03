/** SecurityDashboard component tests — CHAOS-1240. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@/test/utils";

const { mockUseSecurityOverview } = vi.hoisted(() => ({
	mockUseSecurityOverview: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useSecurity", () => ({
	useSecurityOverview: mockUseSecurityOverview,
}));

vi.mock("./KpiTile", () => ({
	KpiTile: ({
		label,
		value,
		loading,
	}: {
		label: string;
		value: string | number;
		loading?: boolean;
	}) => (
		<div data-testid="kpi-inner">
			<span>{label}</span>
			<span>{loading ? "loading" : String(value)}</span>
		</div>
	),
}));

vi.mock("./SeverityStackedBar", () => ({
	SeverityStackedBar: ({ loading }: { loading?: boolean }) => (
		<div data-testid="severity-stacked-bar">
			{loading ? "loading" : "ready"}
		</div>
	),
}));

vi.mock("./TopReposChart", () => ({
	TopReposChart: ({ loading }: { loading?: boolean }) => (
		<div data-testid="top-repos-inner">{loading ? "loading" : "ready"}</div>
	),
}));

vi.mock("./TrendChart", () => ({
	TrendChart: ({ loading }: { loading?: boolean }) => (
		<div data-testid="trend-chart">{loading ? "loading" : "ready"}</div>
	),
}));

import { SecurityDashboard } from "./SecurityDashboard";
import type { SecurityFilter } from "@/lib/filters/security";

const filter: SecurityFilter = { openOnly: true };

describe("SecurityDashboard", () => {
	beforeEach(() => {
		mockUseSecurityOverview.mockReset();
	});

	afterEach(() => cleanup());

	it("renders KPI tiles in loading state while fetching", () => {
		mockUseSecurityOverview.mockReturnValue({
			data: undefined,
			fetching: true,
			error: undefined,
		});

		render(<SecurityDashboard filter={filter} />);

		expect(screen.getByTestId("kpi-open")).toBeInTheDocument();
		expect(screen.getByTestId("kpi-critical")).toBeInTheDocument();
		expect(screen.getByTestId("kpi-high")).toBeInTheDocument();
		expect(screen.getByTestId("kpi-mttf")).toBeInTheDocument();
		const inner = screen.getAllByTestId("kpi-inner");
		expect(inner.every((el) => el.textContent?.includes("loading"))).toBe(true);
	});

	it("renders a banner and degraded tiles when the query errors", () => {
		mockUseSecurityOverview.mockReturnValue({
			data: undefined,
			fetching: false,
			error: new Error("boom"),
		});

		render(<SecurityDashboard filter={filter} />);

		expect(
			screen.getByText(/Failed to load security overview/i),
		).toBeInTheDocument();
		expect(screen.getByText(/boom/i)).toBeInTheDocument();
		expect(
			screen.getAllByText(/could not be loaded/i).length,
		).toBeGreaterThanOrEqual(4);
	});

	it("renders KPI values and charts once data is loaded", () => {
		mockUseSecurityOverview.mockReturnValue({
			data: {
				securityOverview: {
					kpis: {
						openTotal: 25,
						openDelta30d: 3,
						critical: 4,
						high: 10,
						meanDaysToFix30d: 7.5,
					},
					severityBreakdown: [
						{ severity: "critical", count: 4 },
						{ severity: "high", count: 10 },
					],
					topRepos: [{ repoId: "r1", repoName: "org/repo-a", count: 12 }],
					trend: [
						{ day: "2024-03-01", opened: 2, fixed: 1 },
						{ day: "2024-03-02", opened: 3, fixed: 2 },
					],
				},
			},
			fetching: false,
			error: undefined,
		});

		render(<SecurityDashboard filter={filter} />);

		expect(screen.getByText("25")).toBeInTheDocument();
		expect(screen.getByText("4")).toBeInTheDocument();
		expect(screen.getByText("10")).toBeInTheDocument();
		expect(screen.getByText("7.5d")).toBeInTheDocument();
		expect(screen.getByTestId("severity-stacked-bar")).toHaveTextContent(
			"ready",
		);
		expect(screen.getByTestId("top-repos-inner")).toHaveTextContent("ready");
		expect(screen.getByTestId("trend-chart")).toHaveTextContent("ready");
	});

	it("defaults KPIs to zero / no data when securityOverview.kpis is missing", () => {
		mockUseSecurityOverview.mockReturnValue({
			data: { securityOverview: {} },
			fetching: false,
			error: undefined,
		});

		render(<SecurityDashboard filter={filter} />);

		expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(3);
		expect(screen.getByText("No data")).toBeInTheDocument();
	});

	it("does not render an error banner when there is no error", () => {
		mockUseSecurityOverview.mockReturnValue({
			data: {
				securityOverview: {
					kpis: {
						openTotal: 0,
						openDelta30d: 0,
						critical: 0,
						high: 0,
						meanDaysToFix30d: null,
					},
					severityBreakdown: [],
					topRepos: [],
					trend: [],
				},
			},
			fetching: false,
			error: undefined,
		});

		render(<SecurityDashboard filter={filter} />);

		expect(
			screen.queryByText(/Failed to load security overview/i),
		).not.toBeInTheDocument();
	});
});
