import { render, screen } from "@/test/utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphView } from "@/components/work/GraphView";
import type { MetricFilter } from "@/lib/filters/types";

const { mockUseWorkGraphEdges, mockUseOrgId } = vi.hoisted(() => ({
  mockUseWorkGraphEdges: vi.fn(),
  mockUseOrgId: vi.fn(() => "org-1"),
}));

vi.mock("@/lib/graphql/hooks", () => ({
  useWorkGraphEdges: mockUseWorkGraphEdges,
}));

vi.mock("@/lib/graphql/provider", () => ({
  useOrgId: mockUseOrgId,
}));

vi.mock("@/components/charts/WorkGraphExplorer", () => ({
  WorkGraphExplorer: () => <div data-testid="work-graph-explorer" />,
  WorkGraphLegend: () => <div data-testid="work-graph-legend" />,
}));

describe("GraphView", () => {
  const filters = {
    scope: { level: "org" as const, ids: ["org-1"] },
    dateRange: { start: "2024-01-01", end: "2024-12-31" },
  } as unknown as MetricFilter;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no edges returned", () => {
    mockUseWorkGraphEdges.mockReturnValue({
      edges: [],
      loading: false,
      error: null,
      totalCount: 0,
      refetch: vi.fn(),
    });

    render(<GraphView filters={filters} />);

    expect(screen.getByText(/No work graph data available/i)).toBeInTheDocument();
    expect(screen.getByText(/0 edges/i)).toBeInTheDocument();
  });

  it("renders WorkGraphExplorer when edges exist", () => {
    mockUseWorkGraphEdges.mockReturnValue({
      edges: [
        {
          edgeId: "e1",
          sourceType: "ISSUE",
          sourceId: "ISS-1",
          targetType: "PR",
          targetId: "PR-1",
          edgeType: "FIXES",
          provenance: "NATIVE",
          confidence: 1.0,
          evidence: "test",
        },
      ],
      loading: false,
      error: null,
      totalCount: 1,
      refetch: vi.fn(),
    });

    render(<GraphView filters={filters} />);

    expect(screen.getByTestId("work-graph-explorer")).toBeInTheDocument();
    expect(screen.getByText(/1 edges/i)).toBeInTheDocument();
  });

  it("does NOT fall back to sample data when edges are empty", () => {
    mockUseWorkGraphEdges.mockReturnValue({
      edges: [],
      loading: false,
      error: null,
      totalCount: 0,
      refetch: vi.fn(),
    });

    render(<GraphView filters={filters} />);

    expect(screen.queryByText("PROJ-101")).not.toBeInTheDocument();
  });
});
