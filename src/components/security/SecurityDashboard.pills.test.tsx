import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { mockUseSecurityOverview } = vi.hoisted(() => ({ mockUseSecurityOverview: vi.fn() }));

vi.mock("@/lib/graphql/hooks/useSecurity", () => ({
    useSecurityOverview: mockUseSecurityOverview,
}));
vi.mock("./SeverityStackedBar", () => ({ SeverityStackedBar: () => null }));
vi.mock("./TopReposChart", () => ({ TopReposChart: () => null }));
vi.mock("./TrendChart", () => ({ TrendChart: () => null }));

import { SecurityDashboard } from "./SecurityDashboard";

const overview = (kpis: Record<string, number | null>) => ({
    data: {
        securityOverview: { kpis, severityBreakdown: [], topRepos: [], trend: [] },
    },
    fetching: false,
    error: undefined,
});

describe("SecurityDashboard KPI pills", () => {
    beforeEach(() => mockUseSecurityOverview.mockReset());

    it("shows the Critical and High pills only when their count is above zero, and none on Open Alerts", () => {
        mockUseSecurityOverview.mockReturnValue(
            overview({
                openTotal: 9,
                critical: 2,
                high: 3,
                meanDaysToFix30d: null,
                openDelta30d: 1,
            }),
        );
        render(<SecurityDashboard filter={{ openOnly: true }} />);

        expect(within(screen.getByTestId("kpi-open")).queryByTestId("kpi-pill")).toBeNull();
        const critical = within(screen.getByTestId("kpi-critical")).getByTestId("kpi-pill");
        expect(critical).toHaveTextContent("Critical");
        expect(critical).toHaveAttribute("data-tone", "negative");
        const high = within(screen.getByTestId("kpi-high")).getByTestId("kpi-pill");
        expect(high).toHaveTextContent("High");
        expect(high).toHaveAttribute("data-tone", "caution");
        // CHAOS-8214: both pills sit in the tile head slot, not in the meta line.
        expect(critical.closest("[data-testid=metric-head-action]")).not.toBeNull();
        expect(high.closest("[data-testid=metric-head-action]")).not.toBeNull();
        // Missing is not zero: no mean time to fix reads as text.
        expect(within(screen.getByTestId("kpi-mttf")).getByText("No data")).toBeInTheDocument();
    });

    it("shows no pill when there are no critical or high alerts", () => {
        mockUseSecurityOverview.mockReturnValue(
            overview({ openTotal: 0, critical: 0, high: 0, meanDaysToFix30d: 2, openDelta30d: 0 }),
        );
        render(<SecurityDashboard filter={{ openOnly: true }} />);

        expect(screen.queryAllByTestId("kpi-pill")).toHaveLength(0);
    });
});
