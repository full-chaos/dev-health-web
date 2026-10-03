import { cleanup, fireEvent, screen, within } from "@/test/utils";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphView } from "@/components/work/GraphView";
import { WorkGraphFactsAction, WorkGraphFactsProvider } from "@/components/work/WorkGraphPageFacts";
import type { MetricFilter } from "@/lib/filters/types";
import { CTA_LABELS } from "@/lib/design/cta";
import { withoutEmailAddresses } from "@/lib/graphql/reviewEdgeIdentities";

const {
    mockUseSearchParams,
    mockUseWorkGraphEdges,
    mockUseWorkGraphFlow,
    mockUseWorkGraphArtifacts,
    mockUseOrgId,
    mockReplace,
    mockUsePathname,
} = vi.hoisted(() => ({
    mockUseSearchParams: vi.fn(() => new URLSearchParams()),
    mockUseWorkGraphEdges: vi.fn(),
    mockUseWorkGraphFlow: vi.fn(),
    mockUseWorkGraphArtifacts: vi.fn(),
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
    useWorkGraphFlow: mockUseWorkGraphFlow,
    useWorkGraphArtifacts: mockUseWorkGraphArtifacts,
}));

/** Default empty return for the aggregate hooks (overridden per-test as needed). */
const emptyAggregate = () => ({
    rows: [],
    loading: false,
    error: null,
    degradedReason: null,
    refetch: vi.fn(),
});

vi.mock("@/lib/graphql/provider", () => ({
    useOrgId: mockUseOrgId,
}));

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

vi.mock("@/components/charts/WorkGraphExplorer", () => ({
    WorkGraphExplorer: ({ hiddenNodeTypes }: { hiddenNodeTypes?: ReadonlySet<string> }) => (
        <div
            data-testid="work-graph-explorer"
            data-hidden={[...(hiddenNodeTypes ?? [])].sort().join(",")}
        />
    ),
    WorkGraphLegend: () => <div data-testid="work-graph-legend" />,
    // Same contract as the real component: one checkbox per layer, checked unless hidden.
    WorkGraphLayerToggles: ({
        hiddenNodeTypes,
        onToggleAction,
    }: {
        hiddenNodeTypes: ReadonlySet<string>;
        onToggleAction: (type: string) => void;
    }) => (
        <div data-testid="layer-toggles">
            {[
                ["RELEASE", "Release"],
                ["FEATURE_FLAG", "Feature Flag"],
            ].map(([type, label]) => (
                <label key={type}>
                    {label}
                    <input
                        type="checkbox"
                        checked={!hiddenNodeTypes.has(type)}
                        onChange={() => onToggleAction(type)}
                    />
                </label>
            ))}
        </div>
    ),
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
        // Aggregate hooks default to empty; tests that exercise the
        // inflow-outflow / artifacts tabs override these as needed.
        mockUseWorkGraphFlow.mockReturnValue(emptyAggregate());
        mockUseWorkGraphArtifacts.mockReturnValue(emptyAggregate());
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

        const emptyState = within(screen.getByTestId("data-state-detector-enabled-no-findings"));
        expect(emptyState.getByText(/No Work → PRs relationships/i)).toBeInTheDocument();
        expect(emptyState.getByText(/active connection slice/i)).toBeInTheDocument();
        expect(emptyState.getByText(/PRs → Commits → Files/i)).toBeInTheDocument();
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
            filters: {
                repoIds: ["repo-1"],
                limit: 1000,
                edgeTypes: ["FIXES", "IMPLEMENTS", "REFERENCES"],
            },
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

    it("draws the sampling notice above both cards, not inside the explorer card (prototype app.js:84)", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: Array.from({ length: 800 }, (_, index) => ({
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

        const notice = screen
            .getByText(/for browser responsiveness/i)
            .closest("[data-notice-variant]");
        expect(notice).not.toBeNull();
        expect(notice).toHaveAttribute("data-notice-variant", "info");
        const explorerCard = screen.getByTestId("work-graph-panel").parentElement as HTMLElement;
        expect(explorerCard.contains(notice)).toBe(false);
        expect(screen.getByTestId("graph-context").contains(notice)).toBe(false);
        // Above both cards: it comes before the explorer in document order.
        expect(
            notice!.compareDocumentPosition(screen.getByTestId("work-graph-panel")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
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

        // The three filters are one segmented group (prototype `.segments`).
        const segments = within(screen.getByTestId("graph-segments"));
        expect(segments.getAllByRole("combobox")).toHaveLength(3);
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
        expect(filtersArg).toEqual({
            repoIds: ["repo-1"],
            limit: 1000,
            edgeTypes: ["FIXES", "IMPLEMENTS", "REFERENCES"],
        });
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

    // ── Scope normalization (CHAOS-2431, round-6) ───────────────────────────────

    it("normalizes a contradictory theme/subcategory pair: keeps explicit theme, drops mismatched subcategory", () => {
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({
                graph_theme: "risk",
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

        // The impossible conjunctive pair is never sent: theme=risk, no subcategory.
        const filtersArg = lastEdgeFilters();
        expect(filtersArg).toHaveProperty("theme", "risk");
        expect(filtersArg).not.toHaveProperty("subcategory");
    });

    it("canonicalizes a stale/bookmarked contradictory URL via router.replace", () => {
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({
                graph_theme: "risk",
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

        // The URL self-heals: graph_theme stays risk, the mismatched subcategory is removed.
        expect(mockReplace).toHaveBeenCalled();
        const url = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]?.[0] as string;
        const query = new URLSearchParams(url.split("?")[1] ?? "");
        expect(query.get("graph_theme")).toBe("risk");
        expect(query.has("graph_subcategory")).toBe(false);
    });

    it("preserves a matching theme/subcategory pair without rewriting the URL", () => {
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
        // Already canonical → no self-heal rewrite.
        expect(mockReplace).not.toHaveBeenCalled();
    });

    it("derives the parent theme from a subcategory-only URL", () => {
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({ graph_subcategory: "risk.security" }),
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
            theme: "risk",
            subcategory: "risk.security",
        });
    });

    it("renders an empty state naming the active theme filter for a server-filtered set", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} />);

        const emptyState = within(screen.getByTestId("data-state-detector-enabled-no-findings"));
        expect(
            emptyState.getByText(/No Work → PRs relationships matching Quality/i),
        ).toBeInTheDocument();
        expect(emptyState.getByText(/active connection slice/i)).toBeInTheDocument();
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
        expect(screen.getByText(/Theme insights are still being computed/i)).toBeInTheDocument();
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

    it("inflow-outflow tab renders rows from the workGraphFlow aggregate instead of the canvas", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        // Rows come from the server-side aggregate (CHAOS-2442), NOT derived edges.
        mockUseWorkGraphFlow.mockReturnValue({
            rows: [
                { nodeType: "ISSUE", inflow: 0, outflow: 1 },
                { nodeType: "PR", inflow: 1, outflow: 0 },
            ],
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        expect(screen.getByTestId("inflow-outflow-panel")).toBeInTheDocument();
        // Two aggregate rows → two table rows.
        expect(screen.getAllByTestId("inflow-outflow-row").length).toBe(2);
        // Inflow = tide, outflow = amber: fixed by entity, never accent colors.
        const [inflow, outflow] = Array.from(
            screen.getAllByTestId("inflow-outflow-row")[0].querySelectorAll("span[aria-hidden]"),
        );
        expect(inflow.className).toContain("bg-(--chart-color-1)");
        expect(outflow.className).toContain("bg-(--chart-color-2)");
        expect(screen.queryByTestId("work-graph-explorer")).not.toBeInTheDocument();
    });

    it("Overview: the page-head View evidence lists the values the body shows, in body order", async () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: Array.from({ length: 800 }, (_, index) => ({
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

        render(
            <WorkGraphFactsProvider>
                <WorkGraphFactsAction />
                <GraphView filters={filters} />
            </WorkGraphFactsProvider>,
        );

        await userEvent.click(await screen.findByRole("button", { name: "View evidence" }));
        const facts = within(await screen.findByTestId("page-evidence-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);
        expect(facts).toEqual([
            // Body order: the notice (above both cards) first, then the card head's edge count.
            ["Edges drawn", "750"],
            ["Summarized outside the canvas", "50"],
            ["More in the backend (narrower filters)", "400"],
            ["Edges", "800"],
            ["Window", "30 days"],
            ["Connection type", expect.any(String)],
        ]);
    });

    it("Overview keeps the scope-preserving Open evidence link in the body: a ghost button, icon before the label, origin kept", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        render(<GraphView filters={filters} activeOrigin="incident" />);
        const link = within(screen.getByTestId("graph-context")).getByRole("link", {
            name: "Open evidence",
        });
        const href = link.getAttribute("href") ?? "";
        expect(href).toContain("/explore");
        expect(href).toContain("origin=incident");
        // The prototype's btn(): the icon leads the label.
        expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(link.lastChild?.nodeType).toBe(Node.TEXT_NODE);
    });

    it("the artifact pager starts again at the first page when the served rows change", async () => {
        const mk = (prefix: string) => ({
            rows: Array.from({ length: 23 }, (_, i) => ({
                nodeType: "PR",
                nodeId: `${prefix}-${i}`,
                displayName: `${prefix}-${i}: change`,
                degree: 100 - i,
            })),
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphArtifacts.mockReturnValue(mk("A"));
        const view = render(<GraphView filters={filters} activeTab="artifacts" />);
        await userEvent.click(screen.getByRole("button", { name: CTA_LABELS.nextPage }));
        expect(screen.getByTestId("admin-pager")).toHaveTextContent("Showing 11–20");

        mockUseWorkGraphArtifacts.mockReturnValue(mk("B"));
        view.rerender(<GraphView filters={filters} activeTab="artifacts" />);

        expect(screen.getByTestId("admin-pager")).toHaveTextContent("Showing 1–10");
        expect(screen.getByText("B-0: change")).toBeInTheDocument();
    });

    it("pages the served artifact rows (10 per page), with no total", async () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphArtifacts.mockReturnValue({
            rows: Array.from({ length: 23 }, (_, i) => ({
                nodeType: "PR",
                nodeId: `PR-${i}`,
                displayName: `PR-${i}: change ${i}`,
                degree: 100 - i,
            })),
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="artifacts" />);

        expect(screen.getAllByTestId("artifact-row")).toHaveLength(10);
        expect(screen.getByText("PR-0: change 0")).toBeInTheDocument();
        expect(screen.getByTestId("admin-pager")).toHaveTextContent("Showing 1–10");
        await userEvent.click(screen.getByRole("button", { name: CTA_LABELS.nextPage }));
        expect(screen.getByText("PR-10: change 10")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: CTA_LABELS.nextPage }));
        expect(screen.getAllByTestId("artifact-row")).toHaveLength(3);
        expect(screen.getByTestId("admin-pager")).toHaveTextContent("Showing 21–23");
        expect(screen.getByRole("button", { name: CTA_LABELS.nextPage })).toBeDisabled();
        // The entity is in sentence type, not mono.
        expect(screen.getAllByTestId("artifact-entity")[0].className).not.toContain("font-mono");
    });

    it("shows no pager when the served rows fit one page", () => {
        mockUseWorkGraphArtifacts.mockReturnValue({
            rows: [{ nodeType: "PR", nodeId: "PR-1", displayName: "PR-1: a", degree: 1 }],
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });
        render(<GraphView filters={filters} activeTab="artifacts" />);
        expect(screen.queryByTestId("admin-pager")).toBeNull();
    });

    it("shows a type the page has no label for as 'Unlabelled type', never a blank cell", () => {
        mockUseWorkGraphFlow.mockReturnValue({
            rows: [{ nodeType: "MYSTERY", inflow: 1, outflow: 0 }],
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        expect(screen.getByTestId("inflow-outflow-row").querySelector("td")).toHaveTextContent(
            "Unlabelled type",
        );
    });

    it("inflow-outflow rows carry the prototype balance pill, from the served inflow and outflow only", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphFlow.mockReturnValue({
            rows: [
                { nodeType: "ISSUE", inflow: 10, outflow: 2 },
                { nodeType: "PR", inflow: 0, outflow: 9 },
                { nodeType: "COMMIT", inflow: 4, outflow: 4 },
            ],
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        expect(screen.getAllByTestId("balance-pill").map((pill) => pill.textContent)).toEqual([
            "More incoming",
            "More outgoing",
            "Balanced",
        ]);
        const panel = within(screen.getByTestId("inflow-outflow-panel"));
        expect(
            panel.getByText("Outflow originates from an entity type; inflow points into it."),
        ).toBeInTheDocument();
    });

    it("artifacts tab is the 'Artifact browser' section with the prototype description", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        render(<GraphView filters={filters} activeTab="artifacts" />);

        const panel = within(screen.getByTestId("artifacts-panel"));
        expect(panel.getByRole("heading", { name: "Artifact browser" })).toBeInTheDocument();
        expect(
            panel.getByText(/Entities ranked by how many relationships they carry/),
        ).toBeInTheDocument();
    });

    it("'Browse artifacts' is the primary button with the arrow first, not an uppercase link", () => {
        render(<GraphView filters={filters} />);

        const link = screen.getByRole("link", { name: CTA_LABELS.browseArtifacts });
        expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(link.className).not.toContain("uppercase");
        expect(link.className).toContain("bg-(--action)");
    });

    it("an artifact row's Evidence button opens the shared drawer with the served fields, the raw reference only there", async () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphArtifacts.mockReturnValue({
            rows: [
                {
                    nodeType: "PR",
                    nodeId: "PR-1",
                    displayName: "PR-1: Add login form",
                    degree: 2,
                    evidence: "commit_message_squash_pr_ref",
                },
            ],
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });
        const user = userEvent.setup();
        render(<GraphView filters={filters} activeTab="artifacts" />);

        // The raw token is not in the row any more.
        expect(
            within(screen.getByTestId("artifact-row")).queryByText("commit_message_squash_pr_ref"),
        ).toBeNull();
        await user.click(screen.getByTestId("artifact-evidence-button"));
        const rows = within(await screen.findByTestId("artifact-evidence-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);
        expect(rows).toEqual([
            ["Type", "Pull Request"],
            ["Entity", "PR-1: Add login form"],
            ["Connections", "2"],
            ["Evidence reference", "commit_message_squash_pr_ref"],
        ]);
    });

    it("artifacts tab renders rows from the workGraphArtifacts aggregate", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphArtifacts.mockReturnValue({
            rows: [
                {
                    nodeType: "ISSUE",
                    nodeId: "ISS-1",
                    displayName: "ISS-1: Login bug",
                    degree: 3,
                    evidence: "Fixes ISS-1",
                },
                {
                    nodeType: "PR",
                    nodeId: "PR-1",
                    displayName: "PR-1: Add login form",
                    degree: 2,
                    evidence: null,
                },
            ],
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="artifacts" />);

        expect(screen.getByTestId("artifacts-panel")).toBeInTheDocument();
        expect(screen.getAllByTestId("artifact-row").length).toBe(2);
        // displayName is shown when present (resolved rows).
        expect(screen.getByText("ISS-1: Login bug")).toBeInTheDocument();
        expect(screen.getByText("PR-1: Add login form")).toBeInTheDocument();
        expect(screen.queryByTestId("work-graph-explorer")).not.toBeInTheDocument();
    });

    // ── Active-scope chip on theme-aware non-overview tabs (CHAOS-2431, round-6) ──

    it("renders an active-scope chip with the scope label on a non-overview tab when filtered", () => {
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({ graph_theme: "risk", graph_subcategory: "risk.security" }),
        );
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        const chip = screen.getByTestId("theme-scope-chip");
        expect(chip).toBeInTheDocument();
        expect(chip).toHaveTextContent(/Scope:/i);
        expect(chip).toHaveTextContent(/Risk \/ Security/i);
    });

    it("clear action on the scope chip removes graph_theme and graph_subcategory from the URL", async () => {
        const user = userEvent.setup();
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({ graph_theme: "risk", graph_subcategory: "risk.security" }),
        );
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="dependencies" />);

        await user.click(screen.getByRole("button", { name: /clear theme scope/i }));

        expect(mockReplace).toHaveBeenCalled();
        const url = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]?.[0] as string;
        const query = new URLSearchParams(url.split("?")[1] ?? "");
        expect(query.has("graph_theme")).toBe(false);
        expect(query.has("graph_subcategory")).toBe(false);
    });

    it("does not render the scope chip when no theme filter is active", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="dependencies" />);

        expect(screen.queryByTestId("theme-scope-chip")).not.toBeInTheDocument();
    });

    it("does not render the scope chip on the overview tab (selectors are shown there instead)", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "risk" }));
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="overview" />);

        expect(screen.queryByTestId("theme-scope-chip")).not.toBeInTheDocument();
        // Overview keeps its full Theme selector.
        expect(screen.getByLabelText(/Theme/i)).toBeInTheDocument();
    });

    // ── Degraded fail-safe on non-canvas tabs (CHAOS-2431, round-3) ──────────────

    it("inflow-outflow tab shows the prepared/degraded state under an active theme filter when degraded", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        // The degraded signal now comes from the workGraphFlow aggregate.
        mockUseWorkGraphFlow.mockReturnValue({
            rows: [],
            loading: false,
            error: null,
            degradedReason: "MEMBERSHIP_NOT_MATERIALIZED",
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        expect(screen.getByText(/Theme data is being prepared/i)).toBeInTheDocument();
        // The generic table panel and its empty state must NOT render.
        expect(screen.queryByTestId("inflow-outflow-panel")).not.toBeInTheDocument();
        // The scope chip / clear control must still render so the fail-safe is
        // not a dead-end (CHAOS-2431, round-8).
        expect(screen.getByTestId("theme-scope-chip")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /clear theme scope/i })).toBeInTheDocument();
    });

    it("clear-scope works on a degraded inflow-outflow tab (fail-safe is not a dead-end)", async () => {
        const user = userEvent.setup();
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({ graph_theme: "quality", graph_subcategory: "quality.bugfix" }),
        );
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphFlow.mockReturnValue({
            rows: [],
            loading: false,
            error: null,
            degradedReason: "MEMBERSHIP_NOT_MATERIALIZED",
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        expect(screen.getByText(/Theme data is being prepared/i)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /clear theme scope/i }));

        expect(mockReplace).toHaveBeenCalled();
        const url = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]?.[0] as string;
        const query = new URLSearchParams(url.split("?")[1] ?? "");
        expect(query.has("graph_theme")).toBe(false);
        expect(query.has("graph_subcategory")).toBe(false);
    });

    it("inflow-outflow tab renders normally when degradedReason is null", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphFlow.mockReturnValue({
            rows: [{ nodeType: "ISSUE", inflow: 0, outflow: 1 }],
            loading: false,
            error: null,
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
            refetch: vi.fn(),
        });
        mockUseWorkGraphArtifacts.mockReturnValue({
            rows: [],
            loading: false,
            error: null,
            degradedReason: "MEMBERSHIP_NOT_MATERIALIZED",
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="artifacts" />);

        expect(screen.getByText(/Theme data is being prepared/i)).toBeInTheDocument();
        expect(screen.queryByTestId("artifacts-panel")).not.toBeInTheDocument();
        // Scope chip / clear control still available (CHAOS-2431, round-8).
        expect(screen.getByTestId("theme-scope-chip")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /clear theme scope/i })).toBeInTheDocument();
    });

    it("clear-scope works on a degraded artifacts tab (fail-safe is not a dead-end)", async () => {
        const user = userEvent.setup();
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({ graph_theme: "quality", graph_subcategory: "quality.bugfix" }),
        );
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphArtifacts.mockReturnValue({
            rows: [],
            loading: false,
            error: null,
            degradedReason: "MEMBERSHIP_NOT_MATERIALIZED",
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="artifacts" />);

        expect(screen.getByText(/Theme data is being prepared/i)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /clear theme scope/i }));

        expect(mockReplace).toHaveBeenCalled();
        const url = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]?.[0] as string;
        const query = new URLSearchParams(url.split("?")[1] ?? "");
        expect(query.has("graph_theme")).toBe(false);
        expect(query.has("graph_subcategory")).toBe(false);
    });

    it("artifacts tab renders normally when degradedReason is null", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ graph_theme: "quality" }));
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphArtifacts.mockReturnValue({
            rows: [
                {
                    nodeType: "ISSUE",
                    nodeId: "ISS-1",
                    displayName: "ISS-1",
                    degree: 2,
                    evidence: "Fixes ISS-1",
                },
            ],
            loading: false,
            error: null,
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

    // ── Review Network self-heals theme scope from the URL (CHAOS-2431, round-7) ──

    it("strips graph_theme/graph_subcategory from a direct review-network URL via router.replace", () => {
        // review_edges_daily has no theme attribution, so a scoped URL is
        // misleading — it must self-heal to an unscoped URL.
        mockUseSearchParams.mockReturnValue(
            new URLSearchParams({
                tab: "review-network",
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

        render(
            <GraphView
                filters={filters}
                activeTab="review-network"
                reviewEdges={null}
                reviewEdgesLoading={false}
                reviewEdgesError={null}
            />,
        );

        expect(mockReplace).toHaveBeenCalled();
        const url = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]?.[0] as string;
        const query = new URLSearchParams(url.split("?")[1] ?? "");
        expect(query.has("graph_theme")).toBe(false);
        expect(query.has("graph_subcategory")).toBe(false);
        // The tab param (and other non-scope params) are preserved.
        expect(query.get("tab")).toBe("review-network");
        // ReviewNetworkView still renders.
        expect(screen.getByTestId("review-network-panel")).toBeInTheDocument();
    });

    it("does not rewrite the URL on review-network when no theme scope params are present", () => {
        mockUseSearchParams.mockReturnValue(new URLSearchParams({ tab: "review-network" }));
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

        expect(mockReplace).not.toHaveBeenCalled();
        expect(screen.getByTestId("review-network-panel")).toBeInTheDocument();
    });

    it("review-network tab renders real reviewer→author edges when provided", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        // Rows as the page hands them over: the served rows after the server step that takes
        // e-mail addresses out (CHAOS-7973). These people have a login, so the login is the name.
        const reviewEdges = withoutEmailAddresses([
            {
                reviewer: "alice",
                author: "bob",
                reviewsCount: 12,
                day: "2026-05-01",
                repoId: "repo-1",
            },
            {
                reviewer: "alice",
                author: "bob",
                reviewsCount: 5,
                day: "2026-05-02",
                repoId: "repo-1",
            },
            {
                reviewer: "carol",
                author: "bob",
                reviewsCount: 3,
                day: "2026-05-01",
                repoId: "repo-1",
            },
        ]);

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

    // ── CHAOS-2442 regression: tabs no longer starved by the capped edge page ───
    //
    // The bug: a single capped page of edges (GRAPH_EDGE_QUERY_LIMIT) fed all
    // tabs. For reference-heavy orgs the first page was dominated by `references`
    // edges, so the Dependencies tab client-filtered to ~0, and Inflow/Outflow +
    // Artifacts derived degenerate counts. The fix scopes Dependencies to
    // `edgeTypes` server-side and points the two table tabs at true aggregates.

    it("dependencies tab carries edgeTypes in the edge query so dependency edges arrive pre-scoped", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="dependencies" />);

        const filtersArg = lastEdgeFilters();
        // The dependency edge-type slice is sent to the backend (applied BEFORE
        // the LIMIT) — the tab no longer relies on the capped global page.
        expect(Array.isArray(filtersArg.edgeTypes)).toBe(true);
        expect(filtersArg.edgeTypes).toContain("BLOCKS");
        expect(filtersArg.edgeTypes).toContain("PARENT_OF");
        // Non-dependency edge types must not be requested here.
        expect(filtersArg.edgeTypes).not.toContain("FIXES");
        expect(filtersArg.edgeTypes).not.toContain("REFERENCES");
    });

    it("overview tab carries the default connection slice edgeTypes before the backend limit", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="overview" />);

        expect(lastEdgeFilters()).toMatchObject({
            edgeTypes: ["FIXES", "IMPLEMENTS", "REFERENCES"],
        });
    });

    it("overview tab sends the selected connection slice edgeTypes before the backend limit", async () => {
        const user = userEvent.setup();
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="overview" />);

        await user.selectOptions(screen.getByLabelText(/Connection type/i), "change-to-code");

        expect(lastEdgeFilters()).toMatchObject({
            edgeTypes: ["CONTAINS", "TOUCHES"],
        });
    });

    it("overview tab omits edgeTypes for the All connections slice", async () => {
        const user = userEvent.setup();
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="overview" />);

        await user.selectOptions(screen.getByLabelText(/Connection type/i), "all");

        expect(lastEdgeFilters()).not.toHaveProperty("edgeTypes");
    });

    it("inflow-outflow renders aggregate rows even when the edge page is empty (cap-immune)", () => {
        // Simulate a skewed/capped edge page that contains NO usable edges for
        // this tab — the aggregate query is the sole data source now.
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphFlow.mockReturnValue({
            rows: [
                { nodeType: "ISSUE", inflow: 5, outflow: 9 },
                { nodeType: "COMMIT", inflow: 7, outflow: 2 },
            ],
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="inflow-outflow" />);

        expect(screen.getAllByTestId("inflow-outflow-row").length).toBe(2);
    });

    it("artifacts renders aggregate rows even when the edge page is empty (cap-immune)", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphArtifacts.mockReturnValue({
            rows: [
                {
                    nodeType: "ISSUE",
                    nodeId: "ISS-9",
                    displayName: "ISS-9: Flaky CI",
                    degree: 11,
                    evidence: null,
                },
            ],
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="artifacts" />);

        expect(screen.getAllByTestId("artifact-row").length).toBe(1);
        expect(screen.getByText("ISS-9: Flaky CI")).toBeInTheDocument();
    });

    // ── Artifacts unresolved-id leak guard (CHAOS-2442 review) ──────────────────
    //
    // The backend returns displayName=null for unresolvable/opaque node ids so
    // the UI can render a controlled "Unresolved" state and NEVER leak a bare id.
    // Regression for the Codex finding: an unresolved row must not surface its raw
    // nodeId in visible text OR in a title attribute, and must show the
    // controlled unresolved label. Resolved rows must still show displayName.

    it("artifacts unresolved rows (null or whitespace-only displayName) never leak the raw nodeId", () => {
        const opaqueId = "abc123def456deadbeef";
        const blankNameId = "f00dcafebabe9999feed";
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        mockUseWorkGraphArtifacts.mockReturnValue({
            rows: [
                {
                    nodeType: "ISSUE",
                    nodeId: "ISS-7",
                    displayName: "ISS-7: Resolved title",
                    degree: 4,
                    evidence: null,
                },
                {
                    nodeType: "COMMIT",
                    nodeId: opaqueId,
                    displayName: null,
                    degree: 2,
                    evidence: null,
                },
                {
                    // Whitespace-only displayName is NOT a resolved name — must
                    // degrade to the unresolved state, never the raw id.
                    nodeType: "COMMIT",
                    nodeId: blankNameId,
                    displayName: "   ",
                    degree: 1,
                    evidence: null,
                },
            ],
            loading: false,
            error: null,
            degradedReason: null,
            refetch: vi.fn(),
        });

        render(<GraphView filters={filters} activeTab="artifacts" />);

        const rows = screen.getAllByTestId("artifact-row");
        expect(rows.length).toBe(3);

        // Resolved row still shows its displayName.
        expect(screen.getByText("ISS-7: Resolved title")).toBeInTheDocument();

        // Neither opaque id may appear anywhere — not in visible text…
        expect(screen.queryByText(opaqueId)).not.toBeInTheDocument();
        expect(screen.queryByText(blankNameId)).not.toBeInTheDocument();

        // …and not in any title attribute (hover tooltip) either.
        const nullRow = rows[1];
        const blankRow = rows[2];
        expect(nullRow.innerHTML).not.toContain(opaqueId);
        expect(blankRow.innerHTML).not.toContain(blankNameId);
        expect(nullRow.querySelector(`[title*="${opaqueId}"]`)).toBeNull();
        expect(blankRow.querySelector(`[title*="${blankNameId}"]`)).toBeNull();

        // Both degrade to the controlled unresolved label.
        for (const row of [nullRow, blankRow]) {
            const cell = within(row).getByTestId("artifact-entity");
            expect(cell).toHaveAttribute("data-resolved", "false");
            expect(cell).toHaveTextContent(/Unresolved/i);
        }
    });

    it("renders Open evidence in the Graph context card, not in the explorer card head", () => {
        mockUseWorkGraphEdges.mockReturnValue({
            edges: [],
            loading: false,
            error: null,
            totalCount: 0,
            refetch: vi.fn(),
        });
        render(<GraphView filters={filters} />);
        const link = screen.getByRole("link", { name: CTA_LABELS.openEvidence });
        expect(screen.getByTestId("graph-context")).toContainElement(link);
    });

    describe("Graph context card", () => {
        const withEdges = (extra: Record<string, unknown> = {}) =>
            mockUseWorkGraphEdges.mockReturnValue({
                edges: [
                    {
                        sourceType: "ISSUE",
                        sourceId: "I1",
                        targetType: "PR",
                        targetId: "P1",
                        edgeType: "FIXES",
                        confidence: 0.9,
                    },
                ],
                loading: false,
                error: null,
                totalCount: 1,
                refetch: vi.fn(),
                ...extra,
            });

        it("names the window, the connection type and the edges shown; nothing else", () => {
            withEdges();
            render(<GraphView filters={filters} />);
            const card = screen.getByTestId("graph-context");
            expect(screen.getByTestId("context-window")).toHaveTextContent("30 days");
            expect(screen.getByTestId("context-connection")).toHaveTextContent("Work → PRs");
            expect(screen.getByTestId("context-edges")).toHaveTextContent("1");
            expect(card).not.toHaveTextContent("org-1");
        });

        it("a fact with no value says unavailable", () => {
            withEdges({ loading: true });
            render(<GraphView filters={{ ...filters, time: {} } as unknown as MetricFilter} />);
            expect(screen.getByTestId("context-window")).toHaveTextContent("unavailable");
            expect(screen.getByTestId("context-edges")).toHaveTextContent("unavailable");
        });

        it("has no connection-type fact on the dependencies tab (no selectors there)", () => {
            withEdges();
            render(<GraphView filters={filters} activeTab="dependencies" />);
            expect(screen.queryByTestId("context-connection")).toBeNull();
            expect(screen.getByTestId("graph-context")).toBeInTheDocument();
        });

        it("layer visibility is shared with the explorer and every layer starts visible", () => {
            withEdges();
            render(<GraphView filters={filters} />);
            const release = screen.getByRole("checkbox", { name: /release/i });
            const flag = screen.getByRole("checkbox", { name: /feature flag/i });
            expect(release).toBeChecked();
            expect(flag).toBeChecked();
            expect(screen.getByTestId("work-graph-explorer").dataset.hidden).toBe("");
            fireEvent.click(release);
            expect(screen.getByTestId("work-graph-explorer").dataset.hidden).toBe("RELEASE");
            fireEvent.click(flag);
            expect(screen.getByTestId("work-graph-explorer").dataset.hidden).toBe(
                "FEATURE_FLAG,RELEASE",
            );
            fireEvent.click(release);
            expect(screen.getByTestId("work-graph-explorer").dataset.hidden).toBe("FEATURE_FLAG");
        });

        it("Browse artifacts opens the Artifacts tab and keeps the page filters", () => {
            withEdges();
            render(<GraphView filters={filters} />);
            const href = screen
                .getByRole("link", { name: "Browse artifacts" })
                .getAttribute("href");
            expect(href).toContain("/diagnose/work-graph?tab=artifacts&f=");
        });

        it("the legend sits under the graph, inside the explorer card", () => {
            withEdges();
            render(<GraphView filters={filters} />);
            const panel = screen.getByTestId("work-graph-panel");
            const legend = screen.getByTestId("work-graph-legend-panel");
            expect(
                panel.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });
    });

    // ── Review Network today (pinned before the CHAOS-7733 restyle) ──────────────
    describe("Review Network tab today", () => {
        // A row as the page hands it over: the served row after the server step that takes
        // e-mail addresses out (CHAOS-7973).
        const row = (reviewer: string, author: string, reviewsCount: number, day = "2026-09-01") =>
            withoutEmailAddresses([
                {
                    reviewer,
                    author,
                    reviewsCount,
                    day,
                    repoId: "repo-1",
                },
            ])[0];
        const renderReview = (
            edges: ReturnType<typeof row>[] | null,
            extra: { loading?: boolean; error?: string | null } = {},
        ) => {
            mockUseWorkGraphEdges.mockReturnValue({
                edges: [],
                loading: false,
                error: null,
                totalCount: 0,
                refetch: vi.fn(),
            });
            return render(
                <GraphView
                    filters={filters}
                    activeTab="review-network"
                    reviewEdges={edges}
                    reviewEdgesLoading={extra.loading ?? false}
                    reviewEdgesError={extra.error ?? null}
                />,
            );
        };
        const pairs = [
            row("ana.fake", "bo.fake", 6, "2026-09-01"),
            row("ana.fake", "bo.fake", 4, "2026-09-02"),
            row("cy.fake", "bo.fake", 5),
            row("ana.fake", "di.fake", 2),
        ];

        it("sums daily rows per reviewer to author pair and sorts by reviews, high to low", () => {
            renderReview(pairs);
            const rows = screen.getAllByTestId("review-network-row");
            expect(rows).toHaveLength(3);
            expect(rows[0]).toHaveTextContent("ana.fake");
            expect(rows[0]).toHaveTextContent("bo.fake");
            expect(rows[0]).toHaveTextContent("10");
            expect(rows[1]).toHaveTextContent("cy.fake");
            expect(rows[1]).toHaveTextContent("5");
            expect(rows[2]).toHaveTextContent("di.fake");
            expect(rows[2]).toHaveTextContent("2");
        });

        it("names both people in every row; no tooltip holds an identity", () => {
            renderReview(pairs);
            const first = screen.getAllByTestId("review-network-row")[0];
            const [reviewer, author] = within(first).getAllByRole("cell");
            expect(reviewer).toHaveTextContent(/^ana\.fake$/u);
            expect(author).toHaveTextContent(/^bo\.fake$/u);
            expect(first.querySelectorAll("[title]")).toHaveLength(0);
        });

        it("a person whose stored identity is an e-mail address reads Not reported; the address is not in the page", () => {
            renderReview([row("ana.fake@example.test", "bo.fake", 3)]);
            const panel = screen.getByTestId("review-network-panel");
            const [reviewer, author] = within(
                screen.getByTestId("review-network-row"),
            ).getAllByRole("cell");
            expect(reviewer).toHaveTextContent(/^Not reported$/u);
            expect(author).toHaveTextContent(/^bo\.fake$/u);
            expect(panel.innerHTML).not.toContain("@");
            expect(panel.innerHTML).not.toContain("ana.fake");
        });

        it("three tiles: distinct reviewers, distinct authors, total reviews, with the singular form", () => {
            const tiles = () =>
                Array.from(screen.getByTestId("review-network-tiles").children).map((tile) => ({
                    label: tile.querySelector("div")?.textContent,
                    value: tile.querySelector("p")?.textContent,
                }));
            const { unmount } = renderReview(pairs);
            expect(tiles()).toEqual([
                { label: "Reviewers", value: "2" },
                { label: "Authors", value: "2" },
                { label: "Total reviews", value: "17" },
            ]);
            unmount();
            renderReview([row("ana.fake", "bo.fake", 3)]);
            expect(tiles()).toEqual([
                { label: "Reviewer", value: "1" },
                { label: "Author", value: "1" },
                { label: "Total reviews", value: "3" },
            ]);
        });

        it("share bar: the top pair is full width, the others are their share of the top pair", () => {
            renderReview(pairs);
            const widths = screen
                .getAllByTestId("review-network-row")
                .map((r) => (r.querySelector("[data-share-fill]") as HTMLElement).style.width);
            expect(widths).toEqual(["100%", "50%", "20%"]);
        });

        it("card text, the three states and the test ids", () => {
            const { unmount } = renderReview(pairs);
            expect(screen.getByText("Review Network")).toBeInTheDocument();
            expect(screen.getByTestId("review-network-table")).toBeInTheDocument();
            // Guardrail wording: collaboration pairs, not a ranking of people.
            expect(screen.getByTestId("review-network-panel")).toHaveTextContent(
                "Reviewer-to-author collaboration—not a performance ranking.",
            );
            expect(screen.getByTestId("review-network-panel")).not.toHaveTextContent(
                "ranked by review count",
            );
            unmount();
            renderReview(null, { loading: true });
            expect(screen.getByText("Loading…")).toBeInTheDocument();
            cleanup();
            renderReview(null, { error: "boom" });
            expect(screen.getByText("Failed to load review network")).toBeInTheDocument();
            expect(screen.getByText("boom")).toBeInTheDocument();
            cleanup();
            renderReview([]);
            expect(screen.getByText("No review relationships to show")).toBeInTheDocument();
            expect(
                screen.getByText(/Widen the date range or remove repo filters to see data/),
            ).toBeInTheDocument();
        });
    });
});
