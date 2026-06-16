"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { WorkGraphExplorer, WorkGraphLegend } from "@/components/charts/WorkGraphExplorer";
import { DataState } from "@/components/ui/DataState";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { useWorkGraphEdges, useWorkGraphFlow, useWorkGraphArtifacts } from "@/lib/graphql/hooks";
import type {
    WorkGraphEdge,
    WorkGraphEdgeFilterInput,
    WorkGraphEdgeType,
    WorkGraphNodeType,
    WorkGraphFlowRow,
    WorkGraphArtifactRow,
} from "@/lib/graphql/types";
import type { ReviewEdgeRow } from "@/lib/graphql/reviewEdgesFetchers";
import type { MetricFilter } from "@/lib/filters/types";
import { CTA_LABELS } from "@/lib/design/cta";
import { buildExploreUrl } from "@/lib/filters/url";
import { useOrgId } from "@/lib/graphql/provider";
import { formatNumber } from "@/lib/formatters";
import {
    INVESTMENT_SUBCATEGORIES,
    INVESTMENT_THEMES,
    SUBCATEGORY_TO_THEME,
    labelInvestmentKey,
} from "@/lib/workGraph/taxonomy";

type SelectedNode = {
    id: string;
    type: WorkGraphNodeType;
};

/** Canonical Work Graph tabs (ViewSet on the page). `overview` is the explorer. */
export type WorkGraphTab =
    | "overview"
    | "dependencies"
    | "inflow-outflow"
    | "review-network"
    | "artifacts";

type GraphViewProps = {
    filters: MetricFilter;
    activeRole?: string;
    /** Active in-page tab. Defaults to "overview". */
    activeTab?: WorkGraphTab;
    /**
     * Pre-fetched reviewer→author edges for the Review Network tab (CHAOS-2077).
     * Passed from the server component (work-graph page) so no client-side round-trip
     * is needed. `null` means "not yet fetched / wrong tab"; `[]` means "no data".
     */
    reviewEdges?: ReviewEdgeRow[] | null;
    /** Whether the review edges fetch is still in-flight (always false for SSR path). */
    reviewEdgesLoading?: boolean;
    /** Error message from the review edges fetch, or null. */
    reviewEdgesError?: string | null;
};

const GRAPH_EDGE_QUERY_LIMIT = 1000;
const GRAPH_RENDER_EDGE_LIMIT = 750;

type ConnectionSlice = {
    id: string;
    label: string;
    description: string;
    edgeTypes: WorkGraphEdgeType[];
};

const CONNECTION_SLICES: ConnectionSlice[] = [
    {
        id: "work-to-change",
        label: "Work → PRs",
        description: "Issues connected to pull requests.",
        edgeTypes: ["FIXES", "IMPLEMENTS", "REFERENCES"],
    },
    {
        id: "change-to-code",
        label: "PRs → Commits → Files",
        description: "Pull requests, commits, and touched files.",
        edgeTypes: ["CONTAINS", "TOUCHES"],
    },
    {
        id: "release-risk",
        label: "Deployments → Incidents",
        description: "Release and incident relationships.",
        edgeTypes: ["DEPLOYS", "LINKED_INCIDENT", "INTRODUCED_BY"],
    },
    {
        id: "dependencies",
        label: "Dependencies",
        description: "Blocking, related, duplicate, and parent-child links.",
        edgeTypes: [
            "BLOCKS",
            "IS_BLOCKED_BY",
            "RELATES",
            "IS_RELATED_TO",
            "DUPLICATES",
            "IS_DUPLICATE_OF",
            "PARENT_OF",
            "CHILD_OF",
        ],
    },
    {
        id: "all",
        label: "All connections",
        description: "Every fetched edge type. Best for narrow filters only.",
        edgeTypes: [],
    },
];

/** Edge types that constitute dependency relationships (Dependencies tab). */
const DEPENDENCY_EDGE_TYPES =
    CONNECTION_SLICES.find((slice) => slice.id === "dependencies")?.edgeTypes ?? [];

const NODE_TYPES: WorkGraphNodeType[] = [
    "ISSUE",
    "PR",
    "COMMIT",
    "FILE",
    "RELEASE",
    "FEATURE_FLAG",
    "AI_WORKFLOW_RUN",
    "DIFF",
    "REVIEW_OUTCOME",
    "DEPLOYMENT",
    "INCIDENT",
];

const NODE_TYPE_LABELS: Record<WorkGraphNodeType, string> = {
    ISSUE: "Issue",
    PR: "Pull Request",
    COMMIT: "Commit",
    FILE: "File",
    RELEASE: "Release",
    FEATURE_FLAG: "Feature Flag",
    AI_WORKFLOW_RUN: "AI Workflow",
    DIFF: "Diff",
    REVIEW_OUTCOME: "Review",
    DEPLOYMENT: "Deployment",
    INCIDENT: "Incident",
};

const DEFAULT_CONNECTION_SLICE_ID = CONNECTION_SLICES[0].id;

function isConnectionSliceId(value: string | null): value is ConnectionSlice["id"] {
    return Boolean(value && CONNECTION_SLICES.some((slice) => slice.id === value));
}

function isInvestmentTheme(value: string | null): value is (typeof INVESTMENT_THEMES)[number] {
    return Boolean(
        value && INVESTMENT_THEMES.includes(value as (typeof INVESTMENT_THEMES)[number]),
    );
}

function isInvestmentSubcategory(
    value: string | null,
): value is (typeof INVESTMENT_SUBCATEGORIES)[number] {
    return Boolean(
        value &&
        INVESTMENT_SUBCATEGORIES.includes(value as (typeof INVESTMENT_SUBCATEGORIES)[number]),
    );
}

function parseGraphNode(value: string | null): SelectedNode | null {
    if (!value) return null;
    const separatorIndex = value.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) return null;

    const type = value.slice(0, separatorIndex);
    if (!NODE_TYPES.includes(type as WorkGraphNodeType)) return null;

    return {
        type: type as WorkGraphNodeType,
        id: value.slice(separatorIndex + 1),
    };
}

function getGraphSearchState(searchParams: URLSearchParams) {
    const subcategoryParam = searchParams.get("graph_subcategory");
    const themeParam = searchParams.get("graph_theme");
    const connectionParam = searchParams.get("graph_connection");

    // Theme + subcategory are ONE invariant (CHAOS-2431): a subcategory belongs
    // to exactly one parent theme, so an explicit graph_theme that contradicts a
    // present graph_subcategory (e.g. theme=risk + subcategory=quality.bugfix)
    // must never be sent as a conjunctive pair (it yields a false-empty graph).
    // We normalize here: a valid subcategory implies its parent theme; an
    // explicit, mismatching theme wins and the stale subcategory is dropped.
    const rawSubcategory = isInvestmentSubcategory(subcategoryParam) ? subcategoryParam : "all";
    const subcategoryTheme = rawSubcategory === "all" ? null : SUBCATEGORY_TO_THEME[rawSubcategory];
    const explicitTheme = isInvestmentTheme(themeParam) ? themeParam : null;

    let theme: string;
    let subcategory: string;
    if (rawSubcategory !== "all" && subcategoryTheme) {
        if (explicitTheme && explicitTheme !== subcategoryTheme) {
            // Contradiction: keep the explicit theme, drop the mismatched subcategory.
            theme = explicitTheme;
            subcategory = "all";
        } else {
            // Subcategory present (no theme, or matching theme): its parent theme wins.
            theme = subcategoryTheme;
            subcategory = rawSubcategory;
        }
    } else {
        theme = explicitTheme ?? "all";
        subcategory = "all";
    }

    return {
        theme,
        subcategory,
        connectionSliceId: isConnectionSliceId(connectionParam)
            ? connectionParam
            : DEFAULT_CONNECTION_SLICE_ID,
        selectedNode: parseGraphNode(searchParams.get("graph_node")),
    };
}

export function GraphView({
    filters,
    activeRole,
    activeTab = "overview",
    reviewEdges = null,
    reviewEdgesLoading = false,
    reviewEdgesError = null,
}: GraphViewProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const searchState = useMemo(() => getGraphSearchState(searchParams), [searchParams]);
    const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(searchState.selectedNode);
    const [theme, setTheme] = useState(searchState.theme);
    const [subcategory, setSubcategory] = useState(searchState.subcategory);
    const [connectionSliceId, setConnectionSliceId] = useState(searchState.connectionSliceId);
    const [isLegendCollapsed, setIsLegendCollapsed] = useState(true);
    const graphHeight = 580;

    // Theme/subcategory are authoritative server-side filters (CHAOS-2431), so
    // the URL is their single source of truth: writing the params here updates
    // the URL, and the searchState effect below mirrors it back into local
    // state — keeping selection alive across reload and tab navigation. "all"
    // removes the param. Setting a theme always clears the now-stale
    // subcategory so the two never drift.
    const writeGraphScope = useCallback(
        (nextTheme: string, nextSubcategory: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (nextTheme === "all") {
                params.delete("graph_theme");
            } else {
                params.set("graph_theme", nextTheme);
            }
            if (nextSubcategory === "all") {
                params.delete("graph_subcategory");
            } else {
                params.set("graph_subcategory", nextSubcategory);
            }
            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    const handleThemeChange = useCallback(
        (nextTheme: string) => {
            // Switching theme always resets the subcategory (it belongs to the
            // previous theme); mirror local state for immediate responsiveness.
            setTheme(nextTheme);
            setSubcategory("all");
            writeGraphScope(nextTheme, "all");
        },
        [writeGraphScope],
    );

    const handleSubcategoryChange = useCallback(
        (nextSubcategory: string) => {
            setSubcategory(nextSubcategory);
            writeGraphScope(theme, nextSubcategory);
        },
        [theme, writeGraphScope],
    );

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- graph state mirrors URL search parameters.
        setTheme(searchState.theme);
        setSubcategory(searchState.subcategory);
        setConnectionSliceId(searchState.connectionSliceId);
        setSelectedNode(searchState.selectedNode);
    }, [searchState]);

    // Self-heal a stale/bookmarked URL whose raw params disagree with the
    // normalized scope (CHAOS-2431): e.g. ?graph_theme=risk&graph_subcategory=
    // quality.bugfix canonicalizes to graph_theme=risk with the subcategory
    // dropped. writeGraphScope is idempotent, so this only fires when needed.
    // The review-network tab is NOT theme-scoped, so its canonicalization is
    // handled by the dedicated strip effect below — skip it here so the two do
    // not fight (this effect would otherwise keep a valid theme).
    useEffect(() => {
        if (activeTab === "review-network") return;
        const rawTheme = searchParams.get("graph_theme") ?? "all";
        const rawSubcategory = searchParams.get("graph_subcategory") ?? "all";
        const canonTheme = searchState.theme === "all" ? "all" : searchState.theme;
        const canonSubcategory =
            searchState.subcategory === "all" ? "all" : searchState.subcategory;
        if (rawTheme !== canonTheme || rawSubcategory !== canonSubcategory) {
            writeGraphScope(canonTheme, canonSubcategory);
        }
    }, [activeTab, searchParams, searchState, writeGraphScope]);

    // Review Network is backed by review_edges_daily, which has NO theme
    // attribution and ignores the filter (CHAOS-2431). A direct/bookmarked URL
    // like ?tab=review-network&graph_theme=quality would advertise a theme
    // scope it cannot honor, so self-heal by stripping the params. Idempotent:
    // only fires when at least one of them is actually present.
    useEffect(() => {
        if (activeTab !== "review-network") return;
        const hasTheme = searchParams.has("graph_theme");
        const hasSubcategory = searchParams.has("graph_subcategory");
        if (hasTheme || hasSubcategory) {
            writeGraphScope("all", "all");
        }
    }, [activeTab, searchParams, writeGraphScope]);

    const contextOrgId = useOrgId();
    const orgId = filters.scope.ids[0] || contextOrgId || "";
    // Theme / subcategory are filtered SERVER-SIDE (CHAOS-2431): the backend
    // applies them before the LIMIT, so a sparse theme's edges can't fall
    // outside the edge cap and produce a false-empty graph. We therefore pass
    // the active theme/subcategory (when not "all") straight into the query
    // variables instead of filtering the fetched page client-side.
    // Only the explorer tabs (overview / dependencies) consume the raw edge
    // page; inflow-outflow / artifacts now fetch their own server-side
    // aggregates (CHAOS-2442) and review-network uses pre-fetched review edges.
    const graphTabActive = activeTab === "overview" || activeTab === "dependencies";
    const edgeFilters = useMemo<WorkGraphEdgeFilterInput>(
        () => ({
            repoIds: filters.what?.repos,
            limit: GRAPH_EDGE_QUERY_LIMIT,
            ...(theme !== "all" ? { theme } : {}),
            ...(subcategory !== "all" ? { subcategory } : {}),
            // Dependencies tab (CHAOS-2442): scope the edge query to dependency
            // edge types SERVER-SIDE so they arrive pre-filtered before the LIMIT
            // and can never be starved by a reference-heavy capped page. The
            // client-side DEPENDENCY_EDGE_TYPES filter below is kept only as a
            // harmless safety net. The overview tab keeps the broad set.
            ...(activeTab === "dependencies" ? { edgeTypes: DEPENDENCY_EDGE_TYPES } : {}),
        }),
        [filters.what?.repos, theme, subcategory, activeTab],
    );
    const { edges, loading, error, totalCount, degradedReason } = useWorkGraphEdges({
        orgId,
        filters: edgeFilters,
        pause: !orgId || !graphTabActive,
    });

    // Aggregate queries backing the derived table tabs (CHAOS-2442). Both share
    // the org/repo/theme scope; artifacts additionally caps to the top 50 rows.
    // Each is paused unless its tab is active so we never issue a needless fetch.
    const aggregateFilters = useMemo<WorkGraphEdgeFilterInput>(
        () => ({
            repoIds: filters.what?.repos,
            ...(theme !== "all" ? { theme } : {}),
            ...(subcategory !== "all" ? { subcategory } : {}),
        }),
        [filters.what?.repos, theme, subcategory],
    );
    const artifactFilters = useMemo<WorkGraphEdgeFilterInput>(
        () => ({ ...aggregateFilters, limit: 50 }),
        [aggregateFilters],
    );
    const {
        rows: flowRows,
        loading: flowLoading,
        error: flowError,
        degradedReason: flowDegradedReason,
    } = useWorkGraphFlow({
        orgId,
        filters: aggregateFilters,
        pause: !orgId || activeTab !== "inflow-outflow",
    });
    const {
        rows: artifactRows,
        loading: artifactsLoading,
        error: artifactsError,
        degradedReason: artifactsDegradedReason,
    } = useWorkGraphArtifacts({
        orgId,
        filters: artifactFilters,
        pause: !orgId || activeTab !== "artifacts",
    });

    // The Overview tab honours the in-explorer connection-type selector; the
    // Dependencies / Review Network tabs ARE the filter, so they pin it.
    const activeConnectionSlice =
        CONNECTION_SLICES.find((slice) => slice.id === connectionSliceId) ?? CONNECTION_SLICES[0];

    const tabEdges = useMemo(() => {
        // NB: theme/subcategory are filtered server-side (see edgeFilters above),
        // so `edges` is already scoped to the active theme/subcategory. This
        // memo only applies the connection-slice edge-type filter for the tab.
        if (activeTab === "dependencies") {
            return edges.filter((edge) => DEPENDENCY_EDGE_TYPES.includes(edge.edgeType));
        }
        // review-network is handled by the ReviewNetworkView early-return above;
        // this path is only reached for overview and dependencies.
        // overview
        return activeConnectionSlice.edgeTypes.length
            ? edges.filter((edge) => activeConnectionSlice.edgeTypes.includes(edge.edgeType))
            : edges;
    }, [activeTab, edges, activeConnectionSlice]);

    const displayEdges = useMemo(() => tabEdges.slice(0, GRAPH_RENDER_EDGE_LIMIT), [tabEdges]);
    const hiddenEdgeCount = Math.max(0, tabEdges.length - displayEdges.length);
    const visibleSubcategories = useMemo(
        () =>
            INVESTMENT_SUBCATEGORIES.filter(
                (item) => theme === "all" || item.startsWith(`${theme}.`),
            ),
        [theme],
    );

    const handleNodeClick = useCallback((nodeId: string, nodeType: WorkGraphNodeType) => {
        setSelectedNode((prev) =>
            prev?.id === nodeId && prev?.type === nodeType ? null : { id: nodeId, type: nodeType },
        );
    }, []);

    const nodeDetails = useMemo(() => {
        if (!selectedNode) return null;
        const nodeKey = `${selectedNode.type}:${selectedNode.id}`;

        const incomingEdges = displayEdges.filter(
            (e) => `${e.targetType}:${e.targetId}` === nodeKey,
        );
        const outgoingEdges = displayEdges.filter(
            (e) => `${e.sourceType}:${e.sourceId}` === nodeKey,
        );

        return { incomingEdges, outgoingEdges };
    }, [selectedNode, displayEdges]);

    // Fail-safe (CHAOS-2431): when a theme/subcategory filter is active but the
    // backend has not yet materialized the membership index for this org, it
    // returns degradedReason="MEMBERSHIP_NOT_MATERIALIZED" instead of a
    // (false-)empty edge set. Show a distinct "being prepared" state so the
    // user does not read it as "no relationships/artifacts exist". This must be
    // computed BEFORE the per-tab early-returns so the non-canvas tabs
    // (inflow-outflow, artifacts) surface the same fail-safe rather than their
    // generic empty states.
    const themeFilterActive = theme !== "all" || subcategory !== "all";
    const themeDataPreparing =
        themeFilterActive && degradedReason === "MEMBERSHIP_NOT_MATERIALIZED";
    const themeDataPreparingState = (
        <DataState
            variant="preview-not-populated"
            title="Theme data is being prepared"
            description="Theme insights are still being computed for this view — check back shortly."
            data-testid="data-state-theme-preparing"
        />
    );

    const scopeLabel =
        subcategory === "all" ? labelInvestmentKey(theme) : labelInvestmentKey(subcategory);

    // Active-scope chip (CHAOS-2431): the theme/subcategory selectors only render
    // on overview, but dependencies/inflow-outflow/artifacts also query
    // theme-scoped edges. So on those theme-aware tabs we surface a compact chip
    // showing the active scope with a Clear action that removes the params from
    // the URL. Rendered BEFORE the per-tab early-returns so every theme-aware tab
    // shows it. Overview keeps its full selectors instead.
    const themeScopeChip =
        themeFilterActive && activeTab !== "overview" ? (
            <div
                data-testid="theme-scope-chip"
                className="mb-4 flex items-center gap-3 rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1.5 text-xs text-(--ink-muted)"
            >
                <span>
                    Scope: <span className="text-foreground">{scopeLabel}</span>
                </span>
                <button
                    type="button"
                    onClick={() => handleThemeChange("all")}
                    className="uppercase tracking-[0.18em] text-(--accent-2)"
                    aria-label="Clear theme scope"
                >
                    Clear
                </button>
            </div>
        ) : null;

    // ── Derived table tabs (no force-directed canvas) ───────────────────────────
    // The preparing/degraded state must include the scope chip too (CHAOS-2431):
    // these tabs have no overview selectors, so without it a user on a scoped URL
    // while the membership index is preparing would have no way to clear the
    // scope — the fail-safe would be a dead-end.
    if (activeTab === "inflow-outflow") {
        // Degraded fail-safe now reads the aggregate query's degradedReason
        // (CHAOS-2442): the inflow/outflow rows come from workGraphFlow, so its
        // MEMBERSHIP_NOT_MATERIALIZED signal is what surfaces the prepared state.
        const flowPreparing =
            themeFilterActive && flowDegradedReason === "MEMBERSHIP_NOT_MATERIALIZED";
        if (!flowLoading && !flowError && flowPreparing) {
            return (
                <>
                    {themeScopeChip}
                    {themeDataPreparingState}
                </>
            );
        }
        return (
            <>
                {themeScopeChip}
                <InflowOutflowView rows={flowRows} loading={flowLoading} error={flowError} />
            </>
        );
    }
    if (activeTab === "artifacts") {
        const artifactsPreparing =
            themeFilterActive && artifactsDegradedReason === "MEMBERSHIP_NOT_MATERIALIZED";
        if (!artifactsLoading && !artifactsError && artifactsPreparing) {
            return (
                <>
                    {themeScopeChip}
                    {themeDataPreparingState}
                </>
            );
        }
        return (
            <>
                {themeScopeChip}
                <ArtifactsView
                    rows={artifactRows}
                    loading={artifactsLoading}
                    error={artifactsError}
                />
            </>
        );
    }
    if (activeTab === "review-network") {
        return (
            <ReviewNetworkView
                edges={reviewEdges}
                loading={reviewEdgesLoading}
                error={reviewEdgesError}
            />
        );
    }

    // ── Graph (explorer) tabs: overview / dependencies ───────────────────────────
    // review-network early-returns as ReviewNetworkView above.
    const showConnectionSelector = activeTab === "overview";
    const tabHeading: Record<"overview" | "dependencies", string> = {
        overview: "Work Graph Explorer",
        dependencies: "Dependency network",
    };
    const tabDescription: Record<"overview" | "dependencies", string> = {
        overview: "Visualize relationships between issues, PRs, commits, and files.",
        dependencies: "Blocking, related, duplicate, and parent-child links between work items.",
    };
    const graphTab = activeTab as "overview" | "dependencies";
    const themeFilterSuffix = themeFilterActive
        ? ` matching ${subcategory === "all" ? labelInvestmentKey(theme) : labelInvestmentKey(subcategory)}`
        : "";
    const emptyCopy =
        activeTab === "dependencies"
            ? `No dependency links between work items${themeFilterSuffix} in this scope and window.`
            : `No work graph data${themeFilterSuffix} available for this scope and window.`;

    return (
        <div
            className={`grid gap-4 2xl:items-start ${isLegendCollapsed ? "2xl:grid-cols-[minmax(0,1fr)_3.25rem]" : "2xl:grid-cols-[minmax(0,1fr)_17rem]"}`}
        >
            <div className="order-1 min-w-0 space-y-4">
                <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-medium">{tabHeading[graphTab]}</h3>
                            <p className="text-sm text-(--ink-muted)">{tabDescription[graphTab]}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link
                                href={buildExploreUrl({
                                    metric: "throughput",
                                    filters,
                                    role: activeRole,
                                })}
                                className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                            >
                                {CTA_LABELS.openEvidence}
                            </Link>
                            <div className="text-xs text-(--ink-muted)">
                                {loading ? "Loading..." : `${formatNumber(tabEdges.length)} edges`}
                            </div>
                        </div>
                    </div>

                    {/* On the dependencies tab (no selectors) show the active-scope chip. */}
                    {themeScopeChip}

                    {showConnectionSelector && (
                        <div className="mb-4 rounded-2xl border border-(--card-stroke) bg-(--card-70) p-3 text-xs">
                            <div className="grid gap-3 lg:grid-cols-[minmax(13rem,1.1fr)_minmax(11rem,0.9fr)_minmax(14rem,1.2fr)]">
                                <label className="grid min-w-0 gap-1">
                                    <span className="uppercase tracking-[0.18em] text-(--ink-muted)">
                                        Connection type
                                    </span>
                                    <select
                                        value={connectionSliceId}
                                        onChange={(event) => {
                                            setConnectionSliceId(event.target.value);
                                            setSelectedNode(null);
                                        }}
                                        className="min-w-0 rounded-xl border border-(--card-stroke) bg-background px-3 py-2 text-foreground"
                                    >
                                        {CONNECTION_SLICES.map((slice) => (
                                            <option key={slice.id} value={slice.id}>
                                                {slice.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="grid min-w-0 gap-1">
                                    <span className="uppercase tracking-[0.18em] text-(--ink-muted)">
                                        Theme
                                    </span>
                                    <select
                                        value={theme}
                                        onChange={(event) => handleThemeChange(event.target.value)}
                                        className="min-w-0 rounded-xl border border-(--card-stroke) bg-background px-3 py-2 text-foreground"
                                    >
                                        <option value="all">All themes</option>
                                        {INVESTMENT_THEMES.map((item) => (
                                            <option key={item} value={item}>
                                                {labelInvestmentKey(item)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="grid min-w-0 gap-1">
                                    <span className="uppercase tracking-[0.18em] text-(--ink-muted)">
                                        Subcategory
                                    </span>
                                    <select
                                        value={subcategory}
                                        onChange={(event) =>
                                            handleSubcategoryChange(event.target.value)
                                        }
                                        className="min-w-0 rounded-xl border border-(--card-stroke) bg-background px-3 py-2 text-foreground"
                                    >
                                        <option value="all">All subcategories</option>
                                        {visibleSubcategories.map((item) => (
                                            <option key={item} value={item}>
                                                {labelInvestmentKey(item)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-(--card-stroke) pt-3 text-xs text-(--ink-muted)">
                                <span title={activeConnectionSlice.description}>
                                    {activeConnectionSlice.description}
                                </span>
                                {(theme !== "all" || subcategory !== "all") && (
                                    <span>
                                        {`Selected: ${theme === "all" ? "all themes" : labelInvestmentKey(theme)} / ${subcategory === "all" ? "all subcategories" : labelInvestmentKey(subcategory)}`}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {(hiddenEdgeCount > 0 || totalCount > edges.length) && (
                        <div className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            Showing {formatNumber(displayEdges.length)} edges for browser
                            responsiveness
                            {hiddenEdgeCount > 0
                                ? `; ${formatNumber(hiddenEdgeCount)} more in this view are summarized outside the canvas`
                                : ""}
                            {totalCount > edges.length
                                ? `; ${formatNumber(totalCount - edges.length)} additional backend edges are available through narrower filters`
                                : ""}
                            .
                        </div>
                    )}

                    {error && (
                        <DataState
                            variant="error"
                            title="Failed to load work graph"
                            description={error.message}
                        />
                    )}

                    {!loading && !error && themeDataPreparing ? (
                        themeDataPreparingState
                    ) : !loading && !error && tabEdges.length === 0 ? (
                        <DataState
                            variant="detector-enabled-no-findings"
                            title="No relationships to show"
                            description={emptyCopy}
                        />
                    ) : (
                        <div
                            data-testid="work-graph-panel"
                            className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-background/30"
                        >
                            <WorkGraphExplorer
                                edges={displayEdges}
                                height={graphHeight}
                                className="p-2"
                                onNodeClickAction={handleNodeClick}
                                selectedNodeId={
                                    selectedNode
                                        ? `${selectedNode.type}:${selectedNode.id}`
                                        : undefined
                                }
                            />
                        </div>
                    )}
                </div>

                {selectedNode && nodeDetails && (
                    <NodeDetailPanel
                        node={selectedNode}
                        incomingEdges={nodeDetails.incomingEdges}
                        outgoingEdges={nodeDetails.outgoingEdges}
                        onClose={() => setSelectedNode(null)}
                    />
                )}
            </div>

            <div className="order-2 2xl:sticky 2xl:top-4">
                <div
                    className={`rounded-2xl border border-(--card-stroke) bg-card transition-all ${isLegendCollapsed ? "p-2" : "p-3.5"}`}
                >
                    <WorkGraphLegend
                        collapsed={isLegendCollapsed}
                        onToggleAction={() => setIsLegendCollapsed((collapsed) => !collapsed)}
                    />
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Inflow / Outflow tab — relationship direction by entity type
// ---------------------------------------------------------------------------

type InflowOutflowViewProps = {
    rows: WorkGraphFlowRow[];
    loading: boolean;
    error: { message: string } | null;
};

function InflowOutflowView({ rows: serverRows, loading, error }: InflowOutflowViewProps) {
    // Rows now come from the server-side workGraphFlow aggregate (CHAOS-2442),
    // so they are no longer derived from a capped edge page. We only drop
    // all-zero rows and rank by total volume for a stable, readable order.
    const rows = useMemo(
        () =>
            serverRows
                .filter((row) => row.inflow > 0 || row.outflow > 0)
                .sort((a, b) => b.inflow + b.outflow - (a.inflow + a.outflow)),
        [serverRows],
    );

    const max = rows.reduce((m, r) => Math.max(m, r.inflow, r.outflow), 1);

    return (
        <section
            className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
            data-testid="inflow-outflow-panel"
        >
            <div className="mb-4">
                <h3 className="text-lg font-semibold tracking-tight">Inflow / Outflow</h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    How relationships flow into and out of each entity type — outflow links
                    originate from a type, inflow links point to it.
                </p>
            </div>
            {loading ? (
                <p className="text-sm text-(--ink-muted)">Loading…</p>
            ) : error ? (
                <DataState
                    variant="error"
                    title="Failed to load work graph"
                    description={error.message}
                />
            ) : rows.length === 0 ? (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No relationships to show"
                    description="No work graph edges are available for this scope and window."
                />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-90)">
                    <table className="w-full text-sm" data-testid="inflow-outflow-table">
                        <thead className="bg-(--card-60) text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
                            <tr>
                                <th className="px-5 py-3 text-left">Entity type</th>
                                <th className="px-5 py-3 text-right">Inflow</th>
                                <th className="px-5 py-3 text-right">Outflow</th>
                                <th className="px-5 py-3 text-left">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.nodeType}
                                    data-testid="inflow-outflow-row"
                                    className="border-t border-(--card-stroke)/60"
                                >
                                    <td className="px-5 py-3 align-middle font-medium">
                                        {NODE_TYPE_LABELS[row.nodeType]}
                                    </td>
                                    <td className="px-5 py-3 text-right tabular-nums">
                                        {formatNumber(row.inflow)}
                                    </td>
                                    <td className="px-5 py-3 text-right tabular-nums">
                                        {formatNumber(row.outflow)}
                                    </td>
                                    <td className="px-5 py-3 align-middle">
                                        <div className="flex items-center gap-2">
                                            <span
                                                aria-hidden
                                                className="h-2 rounded-full bg-(--accent)/70"
                                                style={{
                                                    width: `${Math.round((row.inflow / max) * 50)}%`,
                                                }}
                                            />
                                            <span
                                                aria-hidden
                                                className="h-2 rounded-full bg-(--accent-2)/60"
                                                style={{
                                                    width: `${Math.round((row.outflow / max) * 50)}%`,
                                                }}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Artifacts tab — distinct entities in the graph and how connected they are
// ---------------------------------------------------------------------------

type ArtifactsViewProps = {
    rows: WorkGraphArtifactRow[];
    loading: boolean;
    error: { message: string } | null;
};

function ArtifactsView({ rows, loading, error }: ArtifactsViewProps) {
    return (
        <section
            className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
            data-testid="artifacts-panel"
        >
            <div className="mb-4">
                <h3 className="text-lg font-semibold tracking-tight">Artifacts</h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Entities in the graph ranked by how many relationships they carry. Open a node
                    on the Overview tab to inspect its full evidence trail.
                </p>
            </div>
            {loading ? (
                <p className="text-sm text-(--ink-muted)">Loading…</p>
            ) : error ? (
                <DataState
                    variant="error"
                    title="Failed to load work graph"
                    description={error.message}
                />
            ) : rows.length === 0 ? (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No artifacts to show"
                    description="No work graph entities are available for this scope and window."
                />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-90)">
                    <table className="w-full text-sm" data-testid="artifacts-table">
                        <thead className="bg-(--card-60) text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
                            <tr>
                                <th className="px-5 py-3 text-left">Type</th>
                                <th className="px-5 py-3 text-left">Entity</th>
                                <th className="px-5 py-3 text-right">Connections</th>
                                <th className="px-5 py-3 text-left">{CTA_LABELS.evidence}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={`${row.nodeType}:${row.nodeId}`}
                                    data-testid="artifact-row"
                                    className="border-t border-(--card-stroke)/60"
                                >
                                    <td className="px-5 py-3 align-middle text-(--ink-muted)">
                                        {NODE_TYPE_LABELS[row.nodeType]}
                                    </td>
                                    <td className="px-5 py-3 align-middle text-[0.82em]">
                                        {/*
                                          A7/A8 render-safety (CHAOS-2442 review):
                                          the backend returns displayName=null for
                                          unresolvable/opaque node ids precisely so
                                          the UI never leaks a bare id. Branch on
                                          that authoritative signal — do NOT fall
                                          back to nodeId (in text OR title) when
                                          unresolved. Resolved rows keep nodeId as
                                          a traceability tooltip via EntityLabel.
                                          Trim first: a whitespace-only displayName
                                          is NOT a resolved name (EntityLabel would
                                          trim it away and normalize the id back in).
                                        */}
                                        {row.displayName?.trim() ? (
                                            <EntityLabel
                                                id={row.nodeId}
                                                displayName={row.displayName.trim()}
                                                className="font-mono"
                                                data-testid="artifact-entity"
                                            />
                                        ) : (
                                            <EntityLabel
                                                fallback="Unresolved"
                                                showUnresolvedBadge={false}
                                                className="italic text-(--ink-muted)"
                                                data-testid="artifact-entity"
                                            />
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-right tabular-nums">
                                        {formatNumber(row.degree)}
                                    </td>
                                    <td className="max-w-[22rem] px-5 py-3 text-(--ink-muted)">
                                        {row.evidence ? (
                                            <q className="line-clamp-2 text-xs">{row.evidence}</q>
                                        ) : (
                                            <span className="text-xs italic">
                                                No linked evidence
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

type NodeDetailPanelProps = {
    node: SelectedNode;
    incomingEdges: WorkGraphEdge[];
    outgoingEdges: WorkGraphEdge[];
    onClose: () => void;
};

function NodeDetailPanel({ node, incomingEdges, outgoingEdges, onClose }: NodeDetailPanelProps) {
    const typeColors: Record<WorkGraphNodeType, string> = {
        ISSUE: "bg-amber-500",
        PR: "bg-emerald-500",
        COMMIT: "bg-indigo-500",
        FILE: "bg-purple-500",
        RELEASE: "bg-teal-600",
        FEATURE_FLAG: "bg-amber-600",
        AI_WORKFLOW_RUN: "bg-cyan-500",
        DIFF: "bg-pink-500",
        REVIEW_OUTCOME: "bg-lime-500",
        DEPLOYMENT: "bg-sky-500",
        INCIDENT: "bg-red-500",
    };

    return (
        <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-sm ${typeColors[node.type]}`} />
                    <div>
                        <p className="text-xs text-(--ink-muted) uppercase tracking-wider">
                            {NODE_TYPE_LABELS[node.type]}
                        </p>
                        <h4 className="text-lg font-medium font-mono">{node.id}</h4>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                    aria-label={CTA_LABELS.closePanel}
                >
                    <svg
                        aria-hidden="true"
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <EdgeList
                    title="Incoming"
                    subtitle="Other nodes pointing to this"
                    edges={incomingEdges}
                    getLabel={(e) => `${e.sourceType}:${e.sourceId}`}
                    getRelation={(e) => e.edgeType}
                />
                <EdgeList
                    title="Outgoing"
                    subtitle="This node points to"
                    edges={outgoingEdges}
                    getLabel={(e) => `${e.targetType}:${e.targetId}`}
                    getRelation={(e) => e.edgeType}
                />
            </div>
        </div>
    );
}

type EdgeListProps = {
    title: string;
    subtitle: string;
    edges: WorkGraphEdge[];
    getLabel: (edge: WorkGraphEdge) => string;
    getRelation: (edge: WorkGraphEdge) => string;
};

function EdgeList({ title, subtitle, edges, getLabel, getRelation }: EdgeListProps) {
    if (edges.length === 0) {
        return (
            <div>
                <p className="text-sm font-medium mb-1">{title}</p>
                <p className="text-xs text-(--ink-muted) mb-2">{subtitle}</p>
                <p className="text-sm text-(--ink-muted) italic">None</p>
            </div>
        );
    }

    return (
        <div>
            <p className="text-sm font-medium mb-1">
                {title} ({edges.length})
            </p>
            <p className="text-xs text-(--ink-muted) mb-2">{subtitle}</p>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {edges.map((edge) => (
                    <li
                        key={edge.edgeId}
                        className="grid gap-1 text-sm bg-white/5 rounded px-2 py-1"
                    >
                        <span className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs truncate">{getLabel(edge)}</span>
                            <span className="text-xs text-(--ink-muted)">
                                {getRelation(edge).toLowerCase().replace(/_/g, " ")}
                            </span>
                        </span>
                        <span className="text-xs text-(--ink-muted)">
                            {edge.provenance.toLowerCase().replace(/_/g, " ")} ·{" "}
                            {formatNumber(edge.confidence * 100, {
                                maximumFractionDigits: 0,
                            })}
                            % confidence
                        </span>
                        {edge.evidence && (
                            <q className="text-xs text-(--ink-muted)">{edge.evidence}</q>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Review Network tab — reviewer→author collaboration edges (CHAOS-2077)
// ---------------------------------------------------------------------------
//
// Data comes from review_edges_daily (via the reviewEdges GraphQL resolver),
// not from work_graph_edges.  Each row represents one reviewer→author pair
// on a given day in a given repo.  We aggregate by (reviewer, author) to get
// total reviews_count across the window, then rank descending.
//
// Identities are emails.  The reviewer and author fields are the raw email
// strings returned by the resolver; we render them as-is since there is no
// org-scoped display-name lookup available on the client path.

type ReviewNetworkViewProps = {
    edges: ReviewEdgeRow[] | null;
    loading: boolean;
    error: string | null;
};

/** Aggregate raw per-day review_edges_daily rows into (reviewer, author, totalReviews). */
function aggregateReviewEdges(
    rawEdges: ReviewEdgeRow[],
): { reviewer: string; author: string; totalReviews: number }[] {
    const map = new Map<string, number>();
    for (const row of rawEdges) {
        const key = `${row.reviewer}\t${row.author}`;
        map.set(key, (map.get(key) ?? 0) + row.reviewsCount);
    }
    return Array.from(map.entries())
        .map(([key, totalReviews]) => {
            const [reviewer, author] = key.split("\t") as [string, string];
            return { reviewer, author, totalReviews };
        })
        .sort((a, b) => b.totalReviews - a.totalReviews);
}

/** Extract the local-part of an email (before @) for compact display. */
function emailDisplayName(email: string): string {
    const atIndex = email.indexOf("@");
    return atIndex > 0 ? email.slice(0, atIndex) : email;
}

function ReviewNetworkView({ edges, loading, error }: ReviewNetworkViewProps) {
    const rows = useMemo(() => {
        if (!edges) return [];
        return aggregateReviewEdges(edges);
    }, [edges]);

    // Derive unique reviewers + authors for a quick summary line.
    const reviewerCount = useMemo(() => new Set(rows.map((r) => r.reviewer)).size, [rows]);
    const authorCount = useMemo(() => new Set(rows.map((r) => r.author)).size, [rows]);
    const totalReviews = useMemo(() => rows.reduce((sum, r) => sum + r.totalReviews, 0), [rows]);
    const maxReviews = rows.reduce((m, r) => Math.max(m, r.totalReviews), 1);

    return (
        <section
            className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
            data-testid="review-network-panel"
        >
            <div className="mb-4">
                <h3 className="text-lg font-semibold tracking-tight">Review Network</h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Reviewer→author collaboration pairs from code review activity, ranked by review
                    count. Data sourced from <code className="text-xs">review_edges_daily</code>.
                </p>
            </div>

            {loading ? (
                <p className="text-sm text-(--ink-muted)">Loading…</p>
            ) : error ? (
                <DataState
                    variant="error"
                    title="Failed to load review network"
                    description={error}
                />
            ) : rows.length === 0 ? (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No review relationships to show"
                    description="No reviewer→author activity was recorded in this scope and window. Widen the date range or remove repo filters to see data."
                />
            ) : (
                <>
                    <div className="mb-4 flex flex-wrap gap-6 text-sm text-(--ink-muted)">
                        <span>
                            <span className="font-semibold text-foreground">
                                {formatNumber(reviewerCount)}
                            </span>{" "}
                            reviewer{reviewerCount === 1 ? "" : "s"}
                        </span>
                        <span>
                            <span className="font-semibold text-foreground">
                                {formatNumber(authorCount)}
                            </span>{" "}
                            author{authorCount === 1 ? "" : "s"}
                        </span>
                        <span>
                            <span className="font-semibold text-foreground">
                                {formatNumber(totalReviews)}
                            </span>{" "}
                            total reviews
                        </span>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-90)">
                        <table className="w-full text-sm" data-testid="review-network-table">
                            <thead className="bg-(--card-60) text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
                                <tr>
                                    <th className="px-5 py-3 text-left">Reviewer</th>
                                    <th className="px-5 py-3 text-left">Author</th>
                                    <th className="px-5 py-3 text-right">Reviews</th>
                                    <th className="px-5 py-3 text-left">Share</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={`${row.reviewer}|${row.author}`}
                                        data-testid="review-network-row"
                                        className="border-t border-(--card-stroke)/60"
                                    >
                                        <td className="px-5 py-3 align-middle">
                                            <span className="font-medium" title={row.reviewer}>
                                                {emailDisplayName(row.reviewer)}
                                            </span>
                                            <span className="ml-1.5 text-xs text-(--ink-muted)">
                                                @{row.reviewer.slice(row.reviewer.indexOf("@") + 1)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 align-middle">
                                            <span className="font-medium" title={row.author}>
                                                {emailDisplayName(row.author)}
                                            </span>
                                            <span className="ml-1.5 text-xs text-(--ink-muted)">
                                                @{row.author.slice(row.author.indexOf("@") + 1)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-right tabular-nums">
                                            {formatNumber(row.totalReviews)}
                                        </td>
                                        <td className="px-5 py-3 align-middle">
                                            <div
                                                aria-hidden
                                                className="h-2 max-w-[10rem] rounded-full bg-(--accent)/70"
                                                style={{
                                                    width: `${Math.round((row.totalReviews / maxReviews) * 100)}%`,
                                                }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}
