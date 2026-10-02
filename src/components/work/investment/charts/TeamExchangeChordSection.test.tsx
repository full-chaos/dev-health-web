import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { TeamExchangeChordSection } from "./TeamExchangeChordSection";
import type { ChordRecord } from "@/lib/types";

const mockUseChordFlow = vi.fn();

let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
    useSearchParams: () => currentSearchParams,
}));

vi.mock("@/lib/graphql/hooks/useChordFlow", () => ({
    useChordFlow: (args: unknown) => mockUseChordFlow(args),
}));

vi.mock("@/components/charts/ChordChart", () => ({
    ChordChart: ({
        dataset,
        onItemClick,
    }: {
        dataset: { nodes: Array<{ label: string }> };
        onItemClick?: (item: { type: "node"; name: string }) => void;
    }) => (
        <div data-testid="mock-chord-chart">
            <span>nodes:{dataset.nodes.length}</span>
            <button
                type="button"
                onClick={() => onItemClick?.({ type: "node", name: dataset.nodes[0]?.label ?? "" })}
            >
                click-chart
            </button>
        </div>
    ),
}));

vi.mock("@/components/charts/ChordSummaryPanel", () => ({
    ChordSummaryPanel: ({
        loading,
        onEntitySelect,
    }: {
        loading?: boolean;
        onEntitySelect?: (id: string) => void;
    }) => (
        <div data-testid="mock-chord-summary">
            {loading ? <span>summary-loading</span> : <span>summary-ready</span>}
            <button type="button" onClick={() => onEntitySelect?.("team-b")}>
                highlight-team-b
            </button>
        </div>
    ),
}));

const records: ChordRecord[] = [
    { source: "Team A", target: "Team B", value: 5 },
    { source: "Team B", target: "Team C", value: 3 },
    { source: "Team C", target: "Team A", value: 2 },
];

describe("TeamExchangeChordSection", () => {
    beforeEach(() => {
        currentSearchParams = new URLSearchParams();
        mockUseChordFlow.mockReset();
        window.history.replaceState({}, "", "/work");
    });

    it("renders chart, summary, and controls when data is available", () => {
        mockUseChordFlow.mockReturnValue({ data: records, fetching: false, error: null });

        render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={{
                    scope: { level: "org", ids: ["org-123"] },
                    time: { range_days: 30, compare_days: 30 },
                    who: { developers: [] },
                    what: { repos: [] },
                    why: { work_category: [] },
                    how: {},
                }}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="hours"
            />,
        );

        expect(screen.getByRole("heading", { name: /team exchange chord/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/group by/i)).toBeInTheDocument();
        expect(screen.getByTestId("mock-chord-chart")).toBeInTheDocument();
        expect(screen.getByTestId("mock-chord-summary")).toBeInTheDocument();
    });

    it("propagates grouping changes into useChordFlow args", async () => {
        mockUseChordFlow.mockReturnValue({ data: records, fetching: false, error: null });
        const user = userEvent.setup();

        render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={{
                    scope: { level: "org", ids: ["org-123"] },
                    time: { range_days: 30, compare_days: 30 },
                    who: { developers: [] },
                    what: { repos: [] },
                    why: { work_category: [] },
                    how: {},
                }}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="hours"
            />,
        );

        await user.selectOptions(screen.getByLabelText(/group by/i), "repo");

        expect(mockUseChordFlow).toHaveBeenLastCalledWith(
            expect.objectContaining({ grouping: "repo", orgId: "org-123" }),
        );
    });

    it("updates highlighted state when a summary row is clicked", async () => {
        mockUseChordFlow.mockReturnValue({ data: records, fetching: false, error: null });
        const user = userEvent.setup();

        render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={{
                    scope: { level: "org", ids: ["org-123"] },
                    time: { range_days: 30, compare_days: 30 },
                    who: { developers: [] },
                    what: { repos: [] },
                    why: { work_category: [] },
                    how: {},
                }}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="hours"
            />,
        );

        await user.click(screen.getByRole("button", { name: /highlight-team-b/i }));

        expect(screen.getByTestId("team-exchange-chord-chart")).toHaveAttribute(
            "data-highlighted-entity",
            "team-b",
        );
    });

    it("shows skeleton loading state", () => {
        mockUseChordFlow.mockReturnValue({ data: null, fetching: true, error: null });
        const { container } = render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={{
                    scope: { level: "org", ids: ["org-123"] },
                    time: { range_days: 30, compare_days: 30 },
                    who: { developers: [] },
                    what: { repos: [] },
                    why: { work_category: [] },
                    how: {},
                }}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="hours"
            />,
        );

        expect(screen.getByText(/summary-loading/i)).toBeInTheDocument();
        expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });

    it("renders error UI when the query fails", () => {
        mockUseChordFlow.mockReturnValue({ data: null, fetching: false, error: new Error("boom") });

        render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={{
                    scope: { level: "org", ids: ["org-123"] },
                    time: { range_days: 30, compare_days: 30 },
                    who: { developers: [] },
                    what: { repos: [] },
                    why: { work_category: [] },
                    how: {},
                }}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="hours"
            />,
        );

        expect(screen.getByText(/unable to load exchange view/i)).toBeInTheDocument();
    });
    // A read that produced nothing (no error, not loading) is unavailable,
    // never a measured "no flows match" empty chart; a produced empty list is.
    const renderChord = () =>
        render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={{
                    scope: { level: "org", ids: ["org-123"] },
                    time: { range_days: 30, compare_days: 30 },
                    who: { developers: [] },
                    what: { repos: [] },
                    why: { work_category: [] },
                    how: {},
                }}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="hours"
            />,
        );

    it("renders the unavailable state when the read produced nothing and did not error", () => {
        mockUseChordFlow.mockReturnValue({ data: null, fetching: false, error: null });
        renderChord();
        expect(screen.getByText(/unable to load exchange view/i)).toBeInTheDocument();
        expect(screen.queryByTestId("mock-chord-chart")).not.toBeInTheDocument();
    });

    it("keeps the single-team note, worded for within-team flow, once self-links are on", () => {
        currentSearchParams = new URLSearchParams("chord.self=true");
        mockUseChordFlow.mockReturnValue({
            data: [{ source: "CHAOS", target: "CHAOS", value: 7 }],
            fetching: false,
            error: null,
        });
        render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={filters}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="units"
            />,
        );
        const note = screen.getByTestId("team-exchange-chord-single-entity");
        expect(note).toHaveTextContent(/all within-team flow/i);
        expect(note).not.toHaveTextContent(/turn on include self-links/i);
    });

    it("renders the unavailable state when the read errored even if records are present", () => {
        mockUseChordFlow.mockReturnValue({ data: records, fetching: false, error: new Error("x") });
        renderChord();
        expect(screen.getByText(/unable to load exchange view/i)).toBeInTheDocument();
        expect(screen.queryByTestId("mock-chord-chart")).not.toBeInTheDocument();
    });

    it("renders the chart, not the unavailable state, for a produced empty list", () => {
        mockUseChordFlow.mockReturnValue({ data: [], fetching: false, error: null });
        renderChord();
        expect(screen.queryByText(/unable to load exchange view/i)).not.toBeInTheDocument();
        expect(screen.getByTestId("mock-chord-chart")).toBeInTheDocument();
    });

    const filters = {
        scope: { level: "org" as const, ids: ["org-123"] },
        time: { range_days: 30, compare_days: 30 },
        who: { developers: [] },
        what: { repos: [] },
        why: { work_category: [] },
        how: {},
    };

    it("says only one team has effort when every edge is a self-edge", () => {
        mockUseChordFlow.mockReturnValue({
            data: [{ source: "CHAOS", target: "CHAOS", value: 7 }],
            fetching: false,
            error: null,
        });

        render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={filters}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="units"
            />,
        );

        const note = screen.getByTestId("team-exchange-chord-single-entity");
        expect(note).toHaveTextContent(/only one team has effort in this window/i);
        expect(note).toHaveTextContent("CHAOS");
        expect(note).toHaveTextContent("7 units");
        expect(note).toHaveTextContent(/include self-links/i);
        expect(screen.queryByTestId("mock-chord-chart")).not.toBeInTheDocument();
    });

    it("keeps the chart when distinct teams exchange effort", async () => {
        mockUseChordFlow.mockReturnValue({
            data: [
                { source: "A", target: "B", value: 2 },
                { source: "A", target: "A", value: 9 },
            ],
            fetching: false,
            error: null,
        });
        render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={filters}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="units"
            />,
        );
        expect(screen.queryByTestId("team-exchange-chord-single-entity")).not.toBeInTheDocument();
        expect(screen.getByTestId("mock-chord-chart")).toBeInTheDocument();
    });

    it("words the single-entity note for the selected grouping, not always as a team", () => {
        currentSearchParams = new URLSearchParams("chord.self=true&chord.group=repo");
        mockUseChordFlow.mockReturnValue({
            data: [{ source: "payments", target: "payments", value: 7 }],
            fetching: false,
            error: null,
        });
        render(
            <TeamExchangeChordSection
                orgId="org-123"
                filters={filters}
                dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
                effortUnit="units"
            />,
        );
        const note = screen.getByTestId("team-exchange-chord-single-entity");
        expect(note).toHaveTextContent(/only one repo has effort/i);
        expect(note).toHaveTextContent(/within-repo flow/i);
        expect(note).not.toHaveTextContent(/within-team flow/i);
    });
});
