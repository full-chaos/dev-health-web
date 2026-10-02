import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@/test/utils";

const { mockUseAIRiskBreakdown, mockUseAIGovernanceSummary } = vi.hoisted(() => ({
    mockUseAIRiskBreakdown: vi.fn(),
    mockUseAIGovernanceSummary: vi.fn(),
}));

vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }],
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/graphql/hooks/useAIReviewRisk")>();
    return {
        ...actual,
        useAIRiskBreakdown: mockUseAIRiskBreakdown,
        useAIGovernanceSummary: mockUseAIGovernanceSummary,
    };
});
vi.mock("../AIEvidenceExplorer", () => ({
    AIEvidenceExplorer: () => <div data-testid="explorer-stub" />,
}));

import { AIRiskDashboard } from "../AIRiskDashboard";

describe("AIRiskDashboard drawer (CHAOS-7775)", () => {
    beforeEach(() => {
        mockUseAIGovernanceSummary.mockReturnValue({
            data: undefined,
            fetching: false,
            error: undefined,
        });
        mockUseAIRiskBreakdown.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiRiskBreakdown: {
                    dataAvailable: true,
                    byBucket: [],
                    hotspotOverlap: [],
                    complexityOverlap: [],
                    missingStates: [],
                },
                aiComparison: { delta: {} },
            },
        });
    });

    const filter = { startDate: "2026-04-01", endDate: "2026-05-01" };

    it("opens the shared wide Drawer with the metric as its eyebrow", () => {
        render(<AIRiskDashboard filter={filter} />);
        fireEvent.click(screen.getAllByRole("button", { name: "Open evidence" })[0]);
        const dialog = screen.getByRole("dialog", { name: "Evidence by pull request" });
        expect(dialog).toHaveAttribute("data-size", "wide");
        expect(within(dialog).getByText("Rework rate")).toBeInTheDocument();
    });

    it("closes on Escape and returns focus to the opener", () => {
        render(<AIRiskDashboard filter={filter} />);
        const opener = screen.getAllByRole("button", { name: "Open evidence" })[0];
        opener.focus();
        fireEvent.click(opener);
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });

    it("closes on a backdrop click", () => {
        render(<AIRiskDashboard filter={filter} />);
        fireEvent.click(screen.getAllByRole("button", { name: "Open evidence" })[0]);
        fireEvent.click(screen.getByTestId("drawer-backdrop"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
