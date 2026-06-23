/**
 * InvestmentGatedBody tests (CHAOS-2608 / CS7).
 *
 * Guards the feature-entitlement boundary: when `investment_view` is disabled
 * the data-fetching `InvestmentView` subtree (which mounts `useInvestmentData`
 * and `useWorkUnitTeamAttributions`) must NOT mount, so no org-scoped investment
 * queries fire from the locked UpgradeGate preview.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

// Mock the data-fetching subtree with a marker so we can assert whether it mounts.
const investmentViewSpy = vi.fn();
vi.mock("@/components/work/InvestmentView", () => ({
    InvestmentView: (props: unknown) => {
        investmentViewSpy(props);
        return <div data-testid="investment-view-mounted" />;
    },
}));

import { InvestmentGatedBody } from "./InvestmentGatedBody";
import type { MetricFilter } from "@/lib/filters/types";

const baseFilters = {
    scope: { level: "org", ids: [] },
    time: { range_days: 30, start_date: null, end_date: null },
    who: {},
    what: {},
    why: {},
    how: {},
} as unknown as MetricFilter;

describe("InvestmentGatedBody", () => {
    it("does NOT mount the InvestmentView data subtree when disabled", () => {
        investmentViewSpy.mockClear();
        render(<InvestmentGatedBody enabled={false} filters={baseFilters} activeTab="evidence" />);

        expect(investmentViewSpy).not.toHaveBeenCalled();
        expect(screen.queryByTestId("investment-view-mounted")).toBeNull();
        expect(screen.getByTestId("investment-preview-placeholder")).toBeInTheDocument();
    });

    it("mounts InvestmentView when enabled", () => {
        investmentViewSpy.mockClear();
        render(<InvestmentGatedBody enabled={true} filters={baseFilters} activeTab="evidence" />);

        expect(investmentViewSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("investment-view-mounted")).toBeInTheDocument();
        expect(screen.queryByTestId("investment-preview-placeholder")).toBeNull();
    });
});
