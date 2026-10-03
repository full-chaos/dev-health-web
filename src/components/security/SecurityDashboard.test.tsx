/** SecurityDashboard component tests — CHAOS-1240. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, within } from "@/test/utils";

const { mockUseSecurityOverview } = vi.hoisted(() => ({
    mockUseSecurityOverview: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useSecurity", () => ({
    useSecurityOverview: mockUseSecurityOverview,
}));

vi.mock("./SeverityStackedBar", () => ({
    SeverityStackedBar: ({ loading }: { loading?: boolean }) => (
        <div data-testid="severity-stacked-bar">{loading ? "loading" : "ready"}</div>
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
        // Each slot shows the shared loading block, never a value or a pill.
        for (const id of ["kpi-open", "kpi-critical", "kpi-high", "kpi-mttf"]) {
            expect(
                within(screen.getByTestId(id)).getByTestId("data-state-loading"),
            ).toBeInTheDocument();
        }
        expect(screen.queryByText("0")).toBeNull();
        expect(screen.queryByTestId("kpi-pill")).toBeNull();
    });

    it("renders a banner and degraded tiles when the query errors", () => {
        mockUseSecurityOverview.mockReturnValue({
            data: undefined,
            fetching: false,
            error: new Error("boom"),
        });

        render(<SecurityDashboard filter={filter} />);

        expect(screen.getByText(/Failed to load security overview/i)).toBeInTheDocument();
        expect(screen.getByText(/boom/i)).toBeInTheDocument();
        expect(screen.getAllByText(/could not be loaded/i).length).toBeGreaterThanOrEqual(4);
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
        expect(screen.getByTestId("severity-stacked-bar")).toHaveTextContent("ready");
        expect(screen.getByTestId("top-repos-inner")).toHaveTextContent("ready");
        expect(screen.getByTestId("trend-chart")).toHaveTextContent("ready");
    });

    it("shows 'Not reported', never 0, when securityOverview.kpis is missing (missing is not zero)", () => {
        mockUseSecurityOverview.mockReturnValue({
            data: { securityOverview: {} },
            fetching: false,
            error: undefined,
        });

        render(<SecurityDashboard filter={filter} />);

        for (const id of ["kpi-open", "kpi-critical", "kpi-high"]) {
            const value = within(screen.getByTestId(id)).getByTestId("metric-value");
            expect(value).toHaveTextContent("Not reported");
            expect(value).not.toHaveTextContent("0");
        }
        expect(screen.getByText("No data")).toBeInTheDocument();
    });

    it("keeps a served 0 as 0", () => {
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

        for (const id of ["kpi-open", "kpi-critical", "kpi-high"]) {
            expect(within(screen.getByTestId(id)).getByTestId("metric-value")).toHaveTextContent(
                /^0$/,
            );
        }
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

        expect(screen.queryByText(/Failed to load security overview/i)).not.toBeInTheDocument();
    });

    describe("KPI tiles are the shared metric tile (KpiTile folded into MetricCard)", () => {
        const loaded = (kpis: Record<string, number | null>) => ({
            data: {
                securityOverview: {
                    kpis,
                    severityBreakdown: [],
                    topRepos: [],
                    trend: [],
                },
            },
            fetching: false,
            error: undefined,
        });
        const kpis = (over: Record<string, number | null> = {}) => ({
            openTotal: 25,
            openDelta30d: 3,
            critical: 4,
            high: 10,
            meanDaysToFix30d: 7.5,
            ...over,
        });

        it("draws the four tiles in one joined 4-column metric strip, without a sparkline slot", () => {
            mockUseSecurityOverview.mockReturnValue(loaded(kpis()));
            render(<SecurityDashboard filter={filter} />);
            const strip = screen.getByTestId("security-kpi-strip");
            expect(strip).toHaveAttribute("data-columns", "4");
            for (const id of ["kpi-open", "kpi-critical", "kpi-high", "kpi-mttf"]) {
                expect(strip).toContainElement(screen.getByTestId(id));
            }
            // No series is served for these tiles: no "No trend yet" text.
            expect(screen.queryByText("No trend yet")).toBeNull();
            // The approved tile has no colored left edge.
            expect(strip.innerHTML).not.toMatch(/border-l-/);
        });

        it("shows the 30-day change of the open COUNT: up, down, no change", () => {
            mockUseSecurityOverview.mockReturnValue(loaded(kpis({ openDelta30d: 3 })));
            const { unmount } = render(<SecurityDashboard filter={filter} />);
            expect(within(screen.getByTestId("kpi-open")).getByText("↑ +3")).toBeInTheDocument();
            unmount();

            mockUseSecurityOverview.mockReturnValue(loaded(kpis({ openDelta30d: -6 })));
            const second = render(<SecurityDashboard filter={filter} />);
            expect(within(screen.getByTestId("kpi-open")).getByText("↓ -6")).toBeInTheDocument();
            second.unmount();

            mockUseSecurityOverview.mockReturnValue(loaded(kpis({ openDelta30d: 0 })));
            render(<SecurityDashboard filter={filter} />);
            expect(
                within(screen.getByTestId("kpi-open")).getByText("· no change"),
            ).toBeInTheDocument();
            // A count change is never printed as a percent.
            expect(screen.getByTestId("kpi-open")).not.toHaveTextContent("%");
        });

        it("shows the Critical and High pills with icon and word, only when the count is above 0", () => {
            mockUseSecurityOverview.mockReturnValue(loaded(kpis()));
            const { unmount } = render(<SecurityDashboard filter={filter} />);
            const critical = within(screen.getByTestId("kpi-critical")).getByTestId("kpi-pill");
            expect(critical).toHaveTextContent("Critical");
            expect(critical).toHaveAttribute("data-tone", "negative");
            expect(critical.querySelector("svg")).not.toBeNull();
            const high = within(screen.getByTestId("kpi-high")).getByTestId("kpi-pill");
            expect(high).toHaveTextContent("High");
            expect(high).toHaveAttribute("data-tone", "caution");
            unmount();

            mockUseSecurityOverview.mockReturnValue(loaded(kpis({ critical: 0, high: 0 })));
            render(<SecurityDashboard filter={filter} />);
            expect(screen.queryByTestId("kpi-pill")).toBeNull();
        });

        it("puts nothing in the change slot of Critical, High and Mean Days to Fix (no 'No prior period')", () => {
            mockUseSecurityOverview.mockReturnValue(loaded(kpis({ critical: 0, high: 0 })));
            render(<SecurityDashboard filter={filter} />);
            for (const id of ["kpi-critical", "kpi-high", "kpi-mttf"]) {
                expect(screen.getByTestId(id)).not.toHaveTextContent("No prior period");
            }
        });

        it("keeps Mean Days to Fix as text: 'x.xd' or 'No data', never 0", () => {
            mockUseSecurityOverview.mockReturnValue(loaded(kpis({ meanDaysToFix30d: 7.5 })));
            const { unmount } = render(<SecurityDashboard filter={filter} />);
            expect(within(screen.getByTestId("kpi-mttf")).getByText("7.5d")).toBeInTheDocument();
            unmount();

            mockUseSecurityOverview.mockReturnValue(loaded(kpis({ meanDaysToFix30d: null })));
            render(<SecurityDashboard filter={filter} />);
            expect(within(screen.getByTestId("kpi-mttf")).getByText("No data")).toBeInTheDocument();
            expect(screen.getByTestId("kpi-mttf")).not.toHaveTextContent(/^0/);
        });
    });
});
