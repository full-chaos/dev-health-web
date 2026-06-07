import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphView } from "@/components/work/GraphView";
import type { MetricFilter } from "@/lib/filters/types";

const { mockUseSearchParams, mockUseWorkGraphEdges, mockUseOrgId } = vi.hoisted(() => ({
    mockUseSearchParams: vi.fn(() => new URLSearchParams()),
    mockUseWorkGraphEdges: vi.fn(),
    mockUseOrgId: vi.fn(() => "org-1"),
}));

vi.mock("next/navigation", () => ({
    useSearchParams: mockUseSearchParams,
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
        time: { range_days: 30 },
        what: { repos: ["repo-1"] },
    } as unknown as MetricFilter;

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseSearchParams.mockReturnValue(new URLSearchParams());
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
        expect(screen.getByTestId("work-graph-legend")).toBeInTheDocument();
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
        expect(screen.getByTestId("work-graph-legend")).toBeInTheDocument();
        expect(screen.getByText(/1 edges/i)).toBeInTheDocument();
        expect(mockUseWorkGraphEdges).toHaveBeenCalledWith({
            orgId: "org-1",
            filters: { repoIds: ["repo-1"], limit: 1000 },
            pause: false,
        });
    });

    it("caps the interactive render and explains partial graph output", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: Array.from({ length: 760 }, (_, index) => ({
                edgeId: `e${index}`,
                sourceType: "ISSUE",
                sourceId: `ISS-${index}`,
                targetType: "PR",
                targetId: `PR-${index}`,
                edgeType: "FIXES",
                provenance: "NATIVE",
                confidence: 1.0,
                evidence: "test",
            })),
            loading: false,
            error: null,
            totalCount: 1200,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        expect(
            screen.getByText(/Showing 750 edges for browser responsiveness/i),
        ).toBeInTheDocument();
        expect(screen.getByText(/additional backend edges are available/i)).toBeInTheDocument();
    });

    it("defaults to a connection hierarchy slice instead of rendering every edge type", () => {
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
                {
                    edgeId: "e2",
                    sourceType: "COMMIT",
                    sourceId: "sha-1",
                    targetType: "FILE",
                    targetId: "app.ts",
                    edgeType: "TOUCHES",
                    provenance: "NATIVE",
                    confidence: 1.0,
                    evidence: "test",
                },
            ],
            loading: false,
            error: null,
            totalCount: 2,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        expect(screen.getByLabelText(/Connection type/i)).toHaveValue("work-to-change");
        // The TOUCHES edge is sliced out by the default work-to-change connection,
        // leaving a single FIXES edge counted in the active view.
        expect(screen.getByText(/1 edges/i)).toBeInTheDocument();
    });

    it("shows theme and subcategory filter context without recomputing graph data", async () => {
        const user = userEvent.setup();
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
                    evidence: "Fixes ISS-1",
                },
            ],
            loading: false,
            error: null,
            totalCount: 1,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        await user.selectOptions(screen.getByLabelText(/Theme/i), "quality");
        await user.selectOptions(screen.getByLabelText(/Subcategory/i), "quality.bugfix");

        expect(screen.getByText(/Quality \/ Quality \/ Bugfix/i)).toBeInTheDocument();
        expect(
            screen.getByText(/persisted distributions drive the selected theme context/i),
        ).toBeInTheDocument();
    });

    it("hydrates graph drilldown state from URL search params", () => {
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({
                graph_connection: "change-to-code",
                graph_theme: "quality",
                graph_subcategory: "quality.bugfix",
                graph_node: "FILE:src/app/page.tsx",
            }),
        );
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [
                {
                    edgeId: "e1",
                    sourceType: "COMMIT",
                    sourceId: "sha-1",
                    targetType: "FILE",
                    targetId: "src/app/page.tsx",
                    edgeType: "TOUCHES",
                    provenance: "NATIVE",
                    confidence: 1.0,
                    evidence: "Touches src/app/page.tsx",
                },
            ],
            loading: false,
            error: null,
            totalCount: 1,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        expect(screen.getByLabelText(/Connection type/i)).toHaveValue("change-to-code");
        expect(screen.getByLabelText(/Theme/i)).toHaveValue("quality");
        expect(screen.getByLabelText(/Subcategory/i)).toHaveValue("quality.bugfix");
        expect(screen.getByText(/Quality \/ Quality \/ Bugfix/i)).toBeInTheDocument();
        expect(screen.getByText("src/app/page.tsx")).toBeInTheDocument();
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

    // ── Per-tab branching (CHAOS-2149) ──────────────────────────────────────────

    it("dependencies tab shows only dependency edges and hides the connection selector", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [
                {
                    edgeId: "e1",
                    sourceType: "ISSUE",
                    sourceId: "ISS-1",
                    targetType: "ISSUE",
                    targetId: "ISS-2",
                    edgeType: "BLOCKS",
                    provenance: "NATIVE",
                    confidence: 1,
                    evidence: null,
                },
                {
                    edgeId: "e2",
                    sourceType: "ISSUE",
                    sourceId: "ISS-3",
                    targetType: "PR",
                    targetId: "PR-1",
                    edgeType: "FIXES",
                    provenance: "NATIVE",
                    confidence: 1,
                    evidence: null,
                },
            ],
            loading: false,
            error: null,
            totalCount: 2,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="dependencies" />);

        expect(screen.getByText(/Dependency network/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/Connection type/i)).not.toBeInTheDocument();
        // Only the BLOCKS edge is a dependency; FIXES is excluded.
        expect(screen.getByText(/1 edges/i)).toBeInTheDocument();
        expect(screen.getByTestId("work-graph-explorer")).toBeInTheDocument();
    });

    it("inflow-outflow tab renders a per-entity-type table instead of the canvas", () => {
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
                    confidence: 1,
                    evidence: null,
                },
            ],
            loading: false,
            error: null,
            totalCount: 1,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        expect(screen.getByTestId("inflow-outflow-panel")).toBeInTheDocument();
        // Issue (outflow) + PR (inflow) → 2 rows.
        expect(screen.getAllByTestId("inflow-outflow-row").length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByTestId("work-graph-explorer")).not.toBeInTheDocument();
    });

    it("artifacts tab ranks entities by connection count", () => {
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
                    confidence: 1,
                    evidence: "Fixes ISS-1",
                },
            ],
            loading: false,
            error: null,
            totalCount: 1,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="artifacts" />);

        expect(screen.getByTestId("artifacts-panel")).toBeInTheDocument();
        expect(screen.getAllByTestId("artifact-row").length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByTestId("work-graph-explorer")).not.toBeInTheDocument();
    });

    it("review-network tab shows an honest empty state when no review edges exist", () => {
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
                    confidence: 1,
                    evidence: null,
                },
            ],
            loading: false,
            error: null,
            totalCount: 1,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="review-network" />);

        expect(screen.getByText(/No review-network relationships/i)).toBeInTheDocument();
        expect(screen.queryByTestId("work-graph-explorer")).not.toBeInTheDocument();
    });
});
