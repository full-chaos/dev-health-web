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
  ChordChart: ({ dataset, onItemClick }: { dataset: { nodes: Array<{ label: string }> }; onItemClick?: (item: { type: "node"; name: string }) => void }) => (
    <div data-testid="mock-chord-chart">
      <span>nodes:{dataset.nodes.length}</span>
      <button type="button" onClick={() => onItemClick?.({ type: "node", name: dataset.nodes[0]?.label ?? "" })}>
        click-chart
      </button>
    </div>
  ),
}));

vi.mock("@/components/charts/ChordSummaryPanel", () => ({
  ChordSummaryPanel: ({ loading, onEntitySelect }: { loading?: boolean; onEntitySelect?: (id: string) => void }) => (
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
          why: { work_category: [], issue_type: [] },
          how: { flow_stage: [] },
        }}
        dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
        effortUnit="hours"
      />
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
          why: { work_category: [], issue_type: [] },
          how: { flow_stage: [] },
        }}
        dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
        effortUnit="hours"
      />
    );

    await user.selectOptions(screen.getByLabelText(/group by/i), "repo");

    expect(mockUseChordFlow).toHaveBeenLastCalledWith(
      expect.objectContaining({ grouping: "repo", orgId: "org-123" })
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
          why: { work_category: [], issue_type: [] },
          how: { flow_stage: [] },
        }}
        dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
        effortUnit="hours"
      />
    );

    await user.click(screen.getByRole("button", { name: /highlight-team-b/i }));

    expect(screen.getByTestId("team-exchange-chord-chart")).toHaveAttribute("data-highlighted-entity", "team-b");
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
          why: { work_category: [], issue_type: [] },
          how: { flow_stage: [] },
        }}
        dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
        effortUnit="hours"
      />
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
          why: { work_category: [], issue_type: [] },
          how: { flow_stage: [] },
        }}
        dateRange={{ startDate: "2026-04-01", endDate: "2026-04-30" }}
        effortUnit="hours"
      />
    );

    expect(screen.getByText(/unable to load exchange view/i)).toBeInTheDocument();
  });
});
