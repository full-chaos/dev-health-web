import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@/test/utils";

const { mockOpps, mockDrill } = vi.hoisted(() => ({ mockOpps: vi.fn(), mockDrill: vi.fn() }));

vi.mock("@/lib/graphql/hooks/useAIImpact", () => ({ useAIOpportunities: mockOpps }));
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({ useAIWorkflowDrilldown: mockDrill }));

import { AIAutomationsDashboard } from "../AIAutomationsDashboard";

const filter = { startDate: "2026-04-01", endDate: "2026-05-01" };

function rec(n: number, extra: Record<string, unknown> = {}) {
    return {
        opportunityId: `o${n}`,
        title: `Candidate ${n}`,
        rationale: `Rationale ${n}`,
        score: 0.72,
        kind: "repeat_work",
        repoId: "sample/web-app",
        teamId: null,
        workGraphDrilldowns: [],
        ...extra,
    };
}

function ready(recommendations: unknown[], detectorReady = true) {
    mockOpps.mockReturnValue({
        fetching: false,
        error: undefined,
        data: { aiOpportunities: { detectorReady, recommendations } },
    });
}

describe("AIAutomationsDashboard", () => {
    beforeEach(() => {
        mockOpps.mockReset();
        mockDrill.mockReset();
        mockDrill.mockReturnValue({ data: undefined, fetching: false, error: undefined });
    });

    it("keeps the panel title, description and test id", () => {
        ready([rec(1)]);
        render(<AIAutomationsDashboard filter={filter} />);
        expect(screen.getByTestId("ai-automations-dashboard")).toBeInTheDocument();
        expect(screen.getByText("Best-fit automation opportunities")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Repeatable work patterns that may be good candidates for responsible automation, scoped to your current selection.",
            ),
        ).toBeInTheDocument();
    });

    it("keeps the loading skeleton and the error card", () => {
        mockOpps.mockReturnValue({ fetching: true, error: undefined, data: undefined });
        const { unmount } = render(<AIAutomationsDashboard filter={filter} />);
        expect(screen.getByTestId("ai-automations-loading")).toBeInTheDocument();
        unmount();
        mockOpps.mockReturnValue({ fetching: false, error: new Error("boom"), data: undefined });
        render(<AIAutomationsDashboard filter={filter} />);
        expect(screen.getByText("AI automation opportunities could not load")).toBeInTheDocument();
        expect(screen.queryByText("boom")).toBeNull();
        expect(screen.getByText("Could not be read")).toBeInTheDocument();
    });

    it("keeps the two honest empty states apart", () => {
        ready([], false);
        const { unmount } = render(<AIAutomationsDashboard filter={filter} />);
        expect(screen.getByText("No automation candidates in this scope yet")).toBeInTheDocument();
        expect(screen.getByText(/As more repeatable work patterns accumulate/)).toBeInTheDocument();
        unmount();
        ready([], true);
        render(<AIAutomationsDashboard filter={filter} />);
        expect(screen.getByText("No automation candidates in this scope yet.")).toBeInTheDocument();
    });

    it("lists at most 5 candidates with title, rationale, percent score and kind line", () => {
        ready([1, 2, 3, 4, 5, 6].map((n) => rec(n)));
        render(<AIAutomationsDashboard filter={filter} />);
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(5);
        expect(within(items[0]).getByText("Candidate 1")).toBeInTheDocument();
        expect(within(items[0]).getByText("Rationale 1")).toBeInTheDocument();
        expect(within(items[0]).getByText(/72%/)).toBeInTheDocument();
        expect(items[0]).toHaveTextContent("repeat work");
        // The fixture serves no repository name: the line says so and shows no part of the id.
        expect(within(items[0]).getByTestId("ai-opportunity-scope")).toHaveTextContent(
            "Repository: Not reported",
        );
        expect(items[0]).not.toHaveTextContent("web-app");
        expect(screen.queryByText("Candidate 6")).not.toBeInTheDocument();
    });

    it("toggles Work Graph evidence per candidate and loads it by the ref", () => {
        const ref = { rootType: "pr", rootId: "r1", label: "PR 12" };
        ready([rec(1, { workGraphDrilldowns: [ref] })]);
        render(<AIAutomationsDashboard filter={filter} />);
        const button = screen.getByRole("button", { name: "Work Graph: PR 12" });
        fireEvent.click(button);
        expect(mockDrill).toHaveBeenLastCalledWith("pr", "r1", { limit: 25 });
        fireEvent.click(button);
        expect(mockDrill).toHaveBeenLastCalledWith(null, null, { limit: 25 });
    });

    it("shows the evidence box with node and edge counts when edges exist", () => {
        const ref = { rootType: "pr", rootId: "r1", label: "PR 12" };
        ready([rec(1, { workGraphDrilldowns: [ref] })]);
        mockDrill.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                dataAvailable: true,
                nodes: [{}, {}],
                edges: [{ edgeId: "e1", edgeType: "references", evidence: "Links the issue." }],
            },
        });
        render(<AIAutomationsDashboard filter={filter} />);
        fireEvent.click(screen.getByRole("button", { name: "Work Graph: PR 12" }));
        const box = screen.getByTestId("ai-opportunity-workgraph-evidence");
        expect(box).toHaveTextContent("2 nodes · 1 edges");
        expect(box).toHaveTextContent("References");
        expect(box).toHaveTextContent("Links the issue.");
    });
});
