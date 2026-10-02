import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

const { mockOpps } = vi.hoisted(() => ({ mockOpps: vi.fn() }));

vi.mock("@/lib/graphql/hooks/useAIImpact", () => ({ useAIOpportunities: mockOpps }));
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({
    useAIWorkflowDrilldown: () => ({ data: undefined, fetching: false, error: undefined }),
}));

import { AIAutomationsDashboard } from "../AIAutomationsDashboard";

describe("Automations look (CHAOS-7772)", () => {
    beforeEach(() => {
        mockOpps.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiOpportunities: {
                    detectorReady: true,
                    recommendations: [1, 2].map((n) => ({
                        opportunityId: `o${n}`,
                        title: `Candidate ${n}`,
                        rationale: "r",
                        score: 0.72,
                        kind: "repeat_work",
                        repoId: null,
                        teamId: null,
                        workGraphDrilldowns: [],
                    })),
                },
            },
        });
    });

    it("numbers the candidates in order", () => {
        render(<AIAutomationsDashboard filter={{ startDate: "a", endDate: "b" }} />);
        const items = screen.getAllByRole("listitem");
        expect(items[0]).toHaveTextContent(/^1Candidate 1/);
        expect(items[1]).toHaveTextContent(/^2Candidate 2/);
    });

    it("shows the score as a neutral Fit chip, never as a green pass mark", () => {
        render(<AIAutomationsDashboard filter={{ startDate: "a", endDate: "b" }} />);
        const chip = screen.getAllByText("Fit 72%")[0];
        expect(chip.className).not.toMatch(/emerald|green/);
        expect(chip.className).toContain("border-(--card-stroke)");
    });

    it("never prints raw repo or team ids: short token plus Unresolved badge (A7)", () => {
        mockOpps.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiOpportunities: {
                    detectorReady: true,
                    recommendations: [
                        {
                            opportunityId: "o1",
                            title: "Candidate",
                            rationale: "r",
                            score: 0.5,
                            kind: "repeat_work",
                            repoId: "11111111-2222-3333-4444-555555555555",
                            teamId: "66666666-7777-8888-9999-000000000000",
                            workGraphDrilldowns: [],
                        },
                    ],
                },
            },
        });
        render(<AIAutomationsDashboard filter={{ startDate: "a", endDate: "b" }} />);
        const item = screen.getByRole("listitem");
        expect(item).not.toHaveTextContent("11111111-2222-3333-4444-555555555555");
        expect(item).not.toHaveTextContent("66666666-7777-8888-9999-000000000000");
        expect(item).toHaveTextContent("Unresolved");
    });
});
