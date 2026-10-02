import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@/test/utils";

import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIReviewLoad } = vi.hoisted(() => ({ mockUseAIReviewLoad: vi.fn() }));

vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }],
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/graphql/hooks/useAIReviewRisk")>();
    return { ...actual, useAIReviewLoad: mockUseAIReviewLoad };
});
vi.mock("../AIReviewAmplificationTrend", () => ({
    AIReviewAmplificationTrend: () => <div data-testid="trend" />,
}));
vi.mock("../AIEvidenceExplorer", () => ({
    AIEvidenceExplorer: () => <div data-testid="explorer-stub" />,
}));

import { AIReviewLoadDashboard } from "../AIReviewLoadDashboard";

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };

describe("AIReviewLoadDashboard drawer (CHAOS-7770)", () => {
    beforeEach(() => {
        mockUseAIReviewLoad.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiReviewLoad: {
                    dataAvailable: true,
                    byBucket: [],
                    daily: [],
                    reviewerConcentration: {
                        dataAvailable: true,
                        reviewerCount: 5,
                        reviewerGini: 0.4,
                    },
                    missingStates: [],
                },
            },
        });
    });

    it("opens the shared wide Drawer with the metric as its eyebrow", () => {
        render(<AIReviewLoadDashboard filter={filter} />);
        fireEvent.click(screen.getAllByRole("button", { name: "Open evidence" })[0]);
        const dialog = screen.getByRole("dialog", { name: "Evidence by pull request" });
        expect(dialog).toHaveAttribute("data-size", "wide");
        expect(within(dialog).getByText("Pickup latency")).toBeInTheDocument();
    });

    it("closes on Escape and returns focus to the opener", () => {
        render(<AIReviewLoadDashboard filter={filter} />);
        const opener = screen.getAllByRole("button", { name: "Open evidence" })[0];
        opener.focus();
        fireEvent.click(opener);
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });

    it("closes on a backdrop click", () => {
        render(<AIReviewLoadDashboard filter={filter} />);
        fireEvent.click(screen.getAllByRole("button", { name: "Open evidence" })[0]);
        fireEvent.click(screen.getByTestId("drawer-backdrop"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
