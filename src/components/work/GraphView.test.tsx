import { render, screen, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphView } from "@/components/work/GraphView";
import type { MetricFilter } from "@/lib/filters/types";
import { CTA_LABELS } from "@/lib/design/cta";

const { mockUseSearchParams, mockUseWorkGraphEdges, mockUseOrgId, mockReplace, mockUsePathname } =
    vi.hoisted(() => ({
        mockUseSearchParams: vi.fn(() => new URLSearchParams()),
        mockUseWorkGraphEdges: vi.fn(),
        mockUseOrgId: vi.fn(() => "org-1"),
        mockReplace: vi.fn(),
        mockUsePathname: vi.fn(() => "/diagnose/work-graph"),
    }));

vi.mock("next/navigation", () => ({
    useSearchParams: mockUseSearchParams,
    useRouter: () => ({ replace: mockReplace, push: vi.fn(), prefetch: vi.fn() }),
    usePathname: mockUsePathname,
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
        mockUsePathname.mockReturnValue("/diagnose/work-graph");
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

    it("shows selected theme/subcategory context in summary line", async () => {
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
                    theme: "quality",
                    subcategory: "quality.bugfix",
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
            screen.queryByText(/persisted distributions drive the selected theme context/i),
        ).not.toBeInTheDocument();
    });

    // ── Theme / subcategory filter wiring (CHAOS-2431) ─────────────────────────
    //
    // Filtering is performed SERVER-SIDE: the selected theme/subcategory are
    // passed into the workGraphEdges query variables so the backend filters
    // before its 1000-edge LIMIT (a sparse theme's edges must not fall outside
    // the cap and produce a false-empty graph). These tests assert the query
    // variables, NOT a client-side post-filter of the fetched page.

    /** Returns the `filters` object from the most recent useWorkGraphEdges call. */
    function lastEdgeFilters() {
        const calls = mockUseWorkGraphEdges.mock.calls;
        return calls[calls.length - 1]?.[0]?.filters;
    }

    it("omits theme/subcategory from query variables under All themes", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        const filtersArg = lastEdgeFilters();
        expect(filtersArg).toEqual({ repoIds: ["repo-1"], limit: 1000 });
        expect(filtersArg).not.toHaveProperty("theme");
        expect(filtersArg).not.toHaveProperty("subcategory");
    });

    it("passes the selected theme into the query variables for server-side filtering", async () => {
        const user = userEvent.setup();
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        await user.selectOptions(screen.getByLabelText(/Theme/i), "quality");

        const filtersArg = lastEdgeFilters();
        expect(filtersArg).toMatchObject({ theme: "quality", limit: 1000 });
        // No subcategory selected → it must not be sent.
        expect(filtersArg).not.toHaveProperty("subcategory");
    });

    it("passes the selected subcategory into the query variables", async () => {
        const user = userEvent.setup();
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        await user.selectOptions(screen.getByLabelText(/Theme/i), "quality");
        await user.selectOptions(screen.getByLabelText(/Subcategory/i), "quality.bugfix");

        expect(lastEdgeFilters()).toMatchObject({
            theme: "quality",
            subcategory: "quality.bugfix",
        });
    });

    it("drops theme/subcategory from variables when switching back to All themes", async () => {
        const user = userEvent.setup();
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        await user.selectOptions(screen.getByLabelText(/Theme/i), "quality");
        expect(lastEdgeFilters()).toHaveProperty("theme", "quality");

        await user.selectOptions(screen.getByLabelText(/Theme/i), "all");
        const filtersArg = lastEdgeFilters();
        expect(filtersArg).not.toHaveProperty("theme");
        expect(filtersArg).not.toHaveProperty("subcategory");
    });

    // ── URL persistence of theme/subcategory (CHAOS-2431, round-4) ──────────────

    /** Returns the URL string from the most recent router.replace call. */
    function lastReplacedUrl() {
        const calls = mockReplace.mock.calls;
        return calls[calls.length - 1]?.[0] as string | undefined;
    }

    it("writes graph_theme to the URL when a theme is selected", async () => {
        const user = userEvent.setup();
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        await user.selectOptions(screen.getByLabelText(/Theme/i), "quality");

        expect(mockReplace).toHaveBeenCalled();
        const url = lastReplacedUrl() ?? "";
        const query = new URLSearchParams(url.split("?")[1] ?? "");
        expect(url).toContain("/diagnose/work-graph");
        expect(query.get("graph_theme")).toBe("quality");
    });

    it("writes graph_subcategory to the URL when a subcategory is selected", async () => {
        const user = userEvent.setup();
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        await user.selectOptions(screen.getByLabelText(/Theme/i), "quality");
        await user.selectOptions(screen.getByLabelText(/Subcategory/i), "quality.bugfix");

        const query = new URLSearchParams((lastReplacedUrl() ?? "").split("?")[1] ?? "");
        expect(query.get("graph_theme")).toBe("quality");
        expect(query.get("graph_subcategory")).toBe("quality.bugfix");
    });

    it("removes graph_theme and graph_subcategory from the URL when All themes is selected", async () => {
        const user = userEvent.setup();
        // Start with both params present in the URL.
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({
                graph_theme: "quality",
                graph_subcategory: "quality.bugfix",
            }),
        );
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        await user.selectOptions(screen.getByLabelText(/Theme/i), "all");

        const url = lastReplacedUrl() ?? "";
        const query = new URLSearchParams(url.split("?")[1] ?? "");
        // Selecting "All themes" clears BOTH the theme and its subcategory.
        expect(query.has("graph_theme")).toBe(false);
        expect(query.has("graph_subcategory")).toBe(false);
    });

    it("preserves other query params when writing graph_theme to the URL", async () => {
        const user = userEvent.setup();
        // The theme/subcategory selectors only render on the overview tab, so
        // exercise the write there while carrying an unrelated `f` filter param.
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({ f: "encoded-filter", role: "ic" }),
        );
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        await user.selectOptions(screen.getByLabelText(/Theme/i), "quality");

        const query = new URLSearchParams((lastReplacedUrl() ?? "").split("?")[1] ?? "");
        expect(query.get("f")).toBe("encoded-filter");
        expect(query.get("role")).toBe("ic");
        expect(query.get("graph_theme")).toBe("quality");
    });

    it("hydrates theme/subcategory into the query variables from URL search params", () => {
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({
                graph_theme: "quality",
                graph_subcategory: "quality.bugfix",
            }),
        );
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        expect(lastEdgeFilters()).toMatchObject({
            theme: "quality",
            subcategory: "quality.bugfix",
        });
    });

    it("renders an empty state naming the active theme filter for a server-filtered set", () => {
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({ graph_theme: "quality" }),
        );
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        // Backend returned no edges for this theme → empty copy names the filter.
        expect(screen.getByText(/No work graph data matching Quality/i)).toBeInTheDocument();
    });

    it("shows the 'theme data is being prepared' state when degradedReason=MEMBERSHIP_NOT_MATERIALIZED under an active theme filter", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            degradedReason: "MEMBERSHIP_NOT_MATERIALIZED",
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        // Distinct degraded state — NOT the generic empty state.
        expect(screen.getByText(/Theme data is being prepared/i)).toBeInTheDocument();
        expect(
            screen.getByText(/Theme insights are still being computed/i),
        ).toBeInTheDocument();
        expect(screen.queryByText(/No relationships to show/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/No work graph data/i)).not.toBeInTheDocument();
    });

    it("shows the normal empty state when degradedReason is null and edges are empty", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        // No degradation → generic empty state, no "being prepared" message.
        expect(screen.getByText(/No relationships to show/i)).toBeInTheDocument();
        expect(screen.queryByText(/Theme data is being prepared/i)).not.toBeInTheDocument();
    });

    it("does NOT show the degraded state when no theme filter is active even if degradedReason is set", () => {
        // No theme/subcategory filter → the membership index is irrelevant, so a
        // degradedReason must not hijack the normal empty/graph rendering.
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            degradedReason: "MEMBERSHIP_NOT_MATERIALIZED",
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        expect(screen.queryByText(/Theme data is being prepared/i)).not.toBeInTheDocument();
        expect(screen.getByText(/No relationships to show/i)).toBeInTheDocument();
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
                    theme: "quality",
                    subcategory: "quality.bugfix",
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

    // ── Degraded fail-safe on non-canvas tabs (CHAOS-2431, round-3) ──────────────

    it("inflow-outflow tab shows the prepared/degraded state under an active theme filter when degraded", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            degradedReason: "MEMBERSHIP_NOT_MATERIALIZED",
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        expect(screen.getByText(/Theme data is being prepared/i)).toBeInTheDocument();
        // The generic table panel and its empty state must NOT render.
        expect(screen.queryByTestId("inflow-outflow-panel")).not.toBeInTheDocument();
    });

    it("inflow-outflow tab renders normally when degradedReason is null", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
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
                    theme: "quality",
                    subcategory: "quality.bugfix",
                },
            ],
            loading: false,
            error: null,
            totalCount: 1,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        expect(screen.getByTestId("inflow-outflow-panel")).toBeInTheDocument();
        expect(screen.queryByText(/Theme data is being prepared/i)).not.toBeInTheDocument();
    });

    it("artifacts tab shows the prepared/degraded state under an active theme filter when degraded", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            degradedReason: "MEMBERSHIP_NOT_MATERIALIZED",
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="artifacts" />);

        expect(screen.getByText(/Theme data is being prepared/i)).toBeInTheDocument();
        expect(screen.queryByTestId("artifacts-panel")).not.toBeInTheDocument();
    });

    it("artifacts tab renders normally when degradedReason is null", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
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
                    theme: "quality",
                    subcategory: "quality.bugfix",
                },
            ],
            loading: false,
            error: null,
            totalCount: 1,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="artifacts" />);

        expect(screen.getByTestId("artifacts-panel")).toBeInTheDocument();
        expect(screen.queryByText(/Theme data is being prepared/i)).not.toBeInTheDocument();
    });

    it("review-network tab shows an honest empty state when reviewEdges prop is null", () => {
        // reviewEdges=null means "not yet fetched / wrong tab" — renders the
        // review-network panel with an empty state (no work-graph-edges fallback).
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(
            <GraphView
                filters={filters}
                activeTab="review-network"
                reviewEdges={null}
                reviewEdgesLoading={false}
                reviewEdgesError={null}
            />,
        );

        expect(screen.getByTestId("review-network-panel")).toBeInTheDocument();
        expect(screen.getByText(/No reviewer→author activity/i)).toBeInTheDocument();
        expect(screen.queryByTestId("work-graph-explorer")).not.toBeInTheDocument();
    });

    it("review-network tab renders real reviewer→author edges when provided", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        const reviewEdges = [
            {
                reviewer: "alice@example.com",
                author: "bob@example.com",
                reviewsCount: 12,
                day: "2026-05-01",
                repoId: "repo-1",
            },
            {
                reviewer: "alice@example.com",
                author: "bob@example.com",
                reviewsCount: 5,
                day: "2026-05-02",
                repoId: "repo-1",
            },
            {
                reviewer: "carol@example.com",
                author: "bob@example.com",
                reviewsCount: 3,
                day: "2026-05-01",
                repoId: "repo-1",
            },
        ];

        render(
            <GraphView
                filters={filters}
                activeTab="review-network"
                reviewEdges={reviewEdges}
                reviewEdgesLoading={false}
                reviewEdgesError={null}
            />,
        );

        expect(screen.getByTestId("review-network-panel")).toBeInTheDocument();
        expect(screen.getByTestId("review-network-table")).toBeInTheDocument();
        // alice→bob aggregated: 12 + 5 = 17 reviews
        const rows = screen.getAllByTestId("review-network-row");
        expect(rows.length).toBe(2);
        // alice→bob should appear first (highest count)
        expect(rows[0]).toHaveTextContent("alice");
        expect(rows[0]).toHaveTextContent("bob");
        expect(within(rows[0]).getByText("17")).toBeInTheDocument();
        expect(screen.queryByTestId("work-graph-explorer")).not.toBeInTheDocument();
    });

    it("review-network tab shows error state when reviewEdgesError is set", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(
            <GraphView
                filters={filters}
                activeTab="review-network"
                reviewEdges={null}
                reviewEdgesLoading={false}
                reviewEdgesError="Failed to load review network data"
            />,
        );

        expect(screen.getByTestId("review-network-panel")).toBeInTheDocument();
        // The DataState renders a heading with the title and a paragraph with the description.
        // We match the description paragraph to avoid ambiguity with the heading.
        expect(screen.getByText("Failed to load review network data")).toBeInTheDocument();
        expect(screen.queryByTestId("work-graph-explorer")).not.toBeInTheDocument();
    });

    it("renders a scope-preserving Open evidence linkback in the explorer header", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        const link = screen.getByRole("link", { name: CTA_LABELS.openEvidence });
        const href = link.getAttribute("href") ?? "";
        expect(href).toContain("/explore");
        expect(href).toContain("metric=throughput");
        // scope-preserving: the encoded filter param is carried through.
        expect(href).toContain("f=");
    });
});
