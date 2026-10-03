"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
    WorkGraphExplorer,
    WorkGraphLayerToggles,
    WorkGraphLegend,
} from "@/components/charts/WorkGraphExplorer";
import { usePublishGraphFacts } from "./WorkGraphPageFacts";
import { AdminPager } from "@/components/admin/AdminPager";
import { Notice } from "@/components/ui/Notice";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import type { PageFact } from "@/components/evidence/PageFactsEvidenceAction";
import { Button } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { buttonClassName } from "@/components/shared/Button";
import { STATUS_PILL } from "@/lib/statusPill";
import { ReviewNetworkView } from "./ReviewNetwork";
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
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { useOrgId } from "@/lib/graphql/provider";
import { formatNumber } from "@/lib/formatters";
import { nodeTypeDotClass } from "@/lib/workGraphNodeColors";
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
    "overview" | "dependencies" | "inflow-outflow" | "review-network" | "artifacts";

type GraphViewProps = {
    filters: MetricFilter;
    activeRole?: string;
    /** The investigation origin the page was opened from; kept on the Open evidence link. */
    activeOrigin?: string;
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

export function getGraphSearchState(searchParams: URLSearchParams) {
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
    activeOrigin,
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
    // Layer visibility (Release / Feature flag): page state, shown in the Graph context card
    // and obeyed by both explorer modes.
    const [hiddenNodeTypes, setHiddenNodeTypes] = useState<ReadonlySet<WorkGraphNodeType>>(
        () => new Set(),
    );
    const toggleNodeType = useCallback((nodeType: WorkGraphNodeType) => {
        setHiddenNodeTypes((current) => {
            const next = new Set(current);
            if (next.has(nodeType)) {
                next.delete(nodeType);
            } else {
                next.add(nodeType);
            }
            return next;
        });
    }, []);
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
    // The Overview tab honours the in-explorer connection-type selector; the
    // Dependencies / Review Network tabs ARE the filter, so they pin it.
    const activeConnectionSlice =
        CONNECTION_SLICES.find((slice) => slice.id === connectionSliceId) ?? CONNECTION_SLICES[0];

    // Theme / subcategory are filtered SERVER-SIDE (CHAOS-2431): the backend
    // applies them before the LIMIT, so a sparse theme's edges can't fall
    // outside the edge cap and produce a false-empty graph. We therefore pass
    // the active theme/subcategory (when not "all") straight into the query
    // variables instead of filtering the fetched page client-side.
    // Only the explorer tabs (overview / dependencies) consume the raw edge
    // page; inflow-outflow / artifacts now fetch their own server-side
    // aggregates (CHAOS-2442) and review-network uses pre-fetched review edges.
    const graphTabActive = activeTab === "overview" || activeTab === "dependencies";
    const activeOverviewEdgeTypes =
        activeTab === "overview" && activeConnectionSlice.edgeTypes.length > 0
            ? activeConnectionSlice.edgeTypes
            : undefined;
    const activeDependencyEdgeTypes =
        activeTab === "dependencies" ? DEPENDENCY_EDGE_TYPES : undefined;
    const edgeFilters = useMemo<WorkGraphEdgeFilterInput>(
        () => ({
            repoIds: filters.what?.repos,
            limit: GRAPH_EDGE_QUERY_LIMIT,
            ...(theme !== "all" ? { theme } : {}),
            ...(subcategory !== "all" ? { subcategory } : {}),
            // Explorer tabs scope their edge-type slices SERVER-SIDE so selected
            // relationships arrive pre-filtered before LIMIT and cannot be
            // starved by a reference-heavy capped page. The client-side filters
            // below remain as harmless safety nets.
            ...(activeOverviewEdgeTypes ? { edgeTypes: activeOverviewEdgeTypes } : {}),
            ...(activeDependencyEdgeTypes ? { edgeTypes: activeDependencyEdgeTypes } : {}),
        }),
        [
            filters.what?.repos,
            theme,
            subcategory,
            activeOverviewEdgeTypes,
            activeDependencyEdgeTypes,
        ],
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
    // The page-head "View evidence" lists what the graph tabs show, in body order (CHAOS-8340).
    usePublishGraphFacts(
        graphTabActive && !loading && !error
            ? graphEvidenceFacts({
                  tabEdgeCount: tabEdges.length,
                  shownCount: displayEdges.length,
                  hiddenCount: hiddenEdgeCount,
                  backendMore: Math.max(0, totalCount - edges.length),
                  window: filters.time,
                  connection: activeTab === "overview" ? activeConnectionSlice.label : null,
              })
            : null,
    );
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
                    aria-label={CTA_LABELS.clearThemeScope}
                >
                    {CTA_LABELS.clear}
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
            : `No ${activeConnectionSlice.label} relationships${themeFilterSuffix} in the active connection slice. Try switching Connection type to ${CONNECTION_SLICES[1].label} to inspect PRs, commits, and files.`;

    // Graph context facts: only what the page can name. A fact with no value is "unavailable".
    const { start_date: windowStart, end_date: windowEnd, range_days: windowDays } = filters.time;
    const windowLabel =
        windowStart && windowEnd
            ? `${windowStart} to ${windowEnd}`
            : windowDays
              ? `${formatNumber(windowDays)} days`
              : "unavailable";
    const edgesShownLabel = loading
        ? "unavailable"
        : hiddenEdgeCount > 0
          ? `${formatNumber(displayEdges.length)} of ${formatNumber(tabEdges.length)}`
          : formatNumber(displayEdges.length);

    // The sampling disclosure sits above both cards (prototype app.js:84), not inside the explorer.
    const samplingNotice =
        hiddenEdgeCount > 0 || totalCount > edges.length ? (
            <Notice variant="info" live={false}>
                Showing {formatNumber(displayEdges.length)} edges for browser responsiveness
                {hiddenEdgeCount > 0
                    ? `; ${formatNumber(hiddenEdgeCount)} more in this view are summarized outside the canvas`
                    : ""}
                {totalCount > edges.length
                    ? `; ${formatNumber(totalCount - edges.length)} additional backend edges are available through narrower filters`
                    : ""}
                .
            </Notice>
        ) : null;

    return (
        <div className="space-y-4">
            {samplingNotice}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
                <div className="order-1 min-w-0 space-y-4">
                    <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-medium">{tabHeading[graphTab]}</h3>
                                <p className="text-sm text-(--ink-muted)">
                                    {tabDescription[graphTab]}
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-xs text-(--ink-muted)">
                                    {loading
                                        ? "Loading..."
                                        : `${formatNumber(tabEdges.length)} edges`}
                                </div>
                            </div>
                        </div>

                        {/* On the dependencies tab (no selectors) show the active-scope chip. */}
                        {themeScopeChip}

                        {showConnectionSelector && (
                            <div className="mb-4 rounded-sm bg-background p-3 text-xs">
                                <div
                                    role="group"
                                    aria-label="Graph filters"
                                    data-testid="graph-segments"
                                    className="inline-flex max-w-full flex-wrap items-center overflow-hidden rounded-sm border border-(--card-stroke) bg-card"
                                >
                                    <label className="flex min-w-0 items-center gap-1.5 border-r border-(--card-stroke) px-3 py-1.5">
                                        <span className="text-(--ink-muted)">Connection type</span>
                                        <select
                                            aria-label="Connection type"
                                            value={connectionSliceId}
                                            onChange={(event) => {
                                                setConnectionSliceId(event.target.value);
                                                setSelectedNode(null);
                                            }}
                                            className="min-w-0 bg-transparent font-semibold text-foreground focus-visible:outline-none"
                                        >
                                            {CONNECTION_SLICES.map((slice) => (
                                                <option key={slice.id} value={slice.id}>
                                                    {slice.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="flex min-w-0 items-center gap-1.5 border-r border-(--card-stroke) px-3 py-1.5">
                                        <span className="text-(--ink-muted)">Theme</span>
                                        <select
                                            aria-label="Theme"
                                            value={theme}
                                            onChange={(event) =>
                                                handleThemeChange(event.target.value)
                                            }
                                            className="min-w-0 bg-transparent font-semibold text-foreground focus-visible:outline-none"
                                        >
                                            <option value="all">All themes</option>
                                            {INVESTMENT_THEMES.map((item) => (
                                                <option key={item} value={item}>
                                                    {labelInvestmentKey(item)}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="flex min-w-0 items-center gap-1.5 px-3 py-1.5">
                                        <span className="text-(--ink-muted)">Subcategory</span>
                                        <select
                                            aria-label="Subcategory"
                                            value={subcategory}
                                            onChange={(event) =>
                                                handleSubcategoryChange(event.target.value)
                                            }
                                            className="min-w-0 bg-transparent font-semibold text-foreground focus-visible:outline-none"
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
                                    hiddenNodeTypes={hiddenNodeTypes}
                                    onToggleNodeTypeAction={toggleNodeType}
                                    selectedNodeId={
                                        selectedNode
                                            ? `${selectedNode.type}:${selectedNode.id}`
                                            : undefined
                                    }
                                />
                            </div>
                        )}

                        {/* Legend under the graph (collapsible). */}
                        <div
                            className={`mt-4 rounded-2xl border border-(--card-stroke) bg-card transition-all ${isLegendCollapsed ? "p-2" : "p-3.5"}`}
                            data-testid="work-graph-legend-panel"
                        >
                            <WorkGraphLegend
                                orientation="row"
                                collapsed={isLegendCollapsed}
                                onToggleAction={() =>
                                    setIsLegendCollapsed((collapsed) => !collapsed)
                                }
                            />
                        </div>
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

                <aside
                    className="order-2 rounded-2xl border border-(--card-stroke) bg-card p-4 xl:sticky xl:top-4"
                    aria-label="Graph context"
                    data-testid="graph-context"
                >
                    <h3 className="text-lg font-medium">Graph context</h3>
                    <dl className="mt-3">
                        {[
                            ["Window", windowLabel, "context-window"],
                            ...(showConnectionSelector
                                ? [
                                      [
                                          "Connection type",
                                          activeConnectionSlice.label,
                                          "context-connection",
                                      ],
                                  ]
                                : []),
                            ["Edges shown", edgesShownLabel, "context-edges"],
                        ].map(([label, value, testId]) => (
                            <div
                                key={testId}
                                className="flex items-baseline justify-between gap-3 border-b border-(--card-stroke) py-2 text-sm"
                            >
                                <dt className="text-(--ink-muted)">{label}</dt>
                                <dd
                                    className="text-right font-medium tabular-nums"
                                    data-testid={testId}
                                >
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <div className="mt-4">
                        <h4 className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                            Layer visibility
                        </h4>
                        <WorkGraphLayerToggles
                            hiddenNodeTypes={hiddenNodeTypes}
                            onToggleAction={toggleNodeType}
                        />
                    </div>
                    <p className="mt-4 text-xs text-(--ink-muted)">
                        Select a relationship to inspect its evidence. Use the artifact table when a
                        table is clearer than a graph.
                    </p>
                    <Link
                        href={withFilterParam(
                            "/diagnose/work-graph?tab=artifacts",
                            filters,
                            activeRole,
                        )}
                        className={`mt-4 ${buttonClassName("primary", "sm")}`}
                    >
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.browseArtifacts}
                    </Link>
                    <Link
                        href={buildExploreUrl({
                            metric: "throughput",
                            filters,
                            role: activeRole,
                            origin: activeOrigin,
                        })}
                        className={`mt-2 ${buttonClassName("ghost", "sm")}`}
                    >
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.openEvidence}
                    </Link>
                </aside>
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

/**
 * The page evidence of the graph tabs (Overview, Dependencies): the values the body shows, in its
 * order: the edge count in the card head, the sampling counts of the notice, then the Graph
 * context rows. Counts the page already computed; no new number.
 */
export function graphEvidenceFacts(input: {
    tabEdgeCount: number;
    shownCount: number;
    hiddenCount: number;
    backendMore: number;
    window: MetricFilter["time"];
    connection: string | null;
}): PageFact[] {
    const { start_date: start, end_date: end, range_days: days } = input.window;
    const windowLabel =
        start && end ? `${start} to ${end}` : days ? `${formatNumber(days)} days` : undefined;
    return [
        ...(input.hiddenCount > 0 || input.backendMore > 0
            ? [
                  {
                      label: "Edges drawn",
                      value: formatNumber(input.shownCount),
                  },
                  ...(input.hiddenCount > 0
                      ? [
                            {
                                label: "Summarized outside the canvas",
                                value: formatNumber(input.hiddenCount),
                            },
                        ]
                      : []),
                  ...(input.backendMore > 0
                      ? [
                            {
                                label: "More in the backend (narrower filters)",
                                value: formatNumber(input.backendMore),
                            },
                        ]
                      : []),
              ]
            : []),
        { label: "Edges", value: formatNumber(input.tabEdgeCount) },
        { label: "Window", value: windowLabel },
        ...(input.connection ? [{ label: "Connection type", value: input.connection }] : []),
    ];
}

/** Direction of a row, from its served inflow and outflow only (no threshold, no invented tolerance). */
export function balanceLabel(inflow: number, outflow: number): string {
    if (inflow > outflow) return "More incoming";
    if (outflow > inflow) return "More outgoing";
    return "Balanced";
}

/**
 * The Inflow / Outflow rows as the body draws them: from the server-side workGraphFlow aggregate
 * (CHAOS-2442), all-zero rows dropped, ranked by total volume for a stable, readable order.
 */
export function orderFlowRows(serverRows: WorkGraphFlowRow[]): WorkGraphFlowRow[] {
    return serverRows
        .filter((row) => row.inflow > 0 || row.outflow > 0)
        .sort((a, b) => b.inflow + b.outflow - (a.inflow + a.outflow));
}

/** The page evidence of the Inflow / Outflow tab: the body rows, as served. */
export function flowEvidenceFacts(serverRows: WorkGraphFlowRow[]): PageFact[] {
    return orderFlowRows(serverRows).map((row) => ({
        // A type the page has no label for shows as "Unlabelled type", as the body leaves it blank.
        label: NODE_TYPE_LABELS[row.nodeType] ?? "Unlabelled type",
        value: `Inflow ${formatNumber(row.inflow)} · Outflow ${formatNumber(row.outflow)} · ${balanceLabel(row.inflow, row.outflow)}`,
    }));
}

/** The page evidence of the Artifact browser: the body rows (type, entity, connections). No names of people. */
export function artifactEvidenceFacts(rows: WorkGraphArtifactRow[]): PageFact[] {
    return rows.map((row) => ({
        label: `${NODE_TYPE_LABELS[row.nodeType] ?? "Unlabelled type"} · ${row.displayName?.trim() || "Unresolved"}`,
        value: `${formatNumber(row.degree)} connections`,
    }));
}

function InflowOutflowView({ rows: serverRows, loading, error }: InflowOutflowViewProps) {
    const rows = useMemo(() => orderFlowRows(serverRows), [serverRows]);

    const max = rows.reduce((m, r) => Math.max(m, r.inflow, r.outflow), 1);

    return (
        <Section
            data-testid="inflow-outflow-panel"
            as="h3"
            title="Inflow / Outflow"
            description="Outflow originates from an entity type; inflow points into it."
        >
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
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="inflow-outflow-table">
                        <thead className="text-label-caps uppercase text-(--ink-muted)">
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
                                        {NODE_TYPE_LABELS[row.nodeType] ?? "Unlabelled type"}
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
                                                data-testid="balance-pill"
                                                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                                    row.inflow > row.outflow
                                                        ? STATUS_PILL.info
                                                        : STATUS_PILL.muted
                                                }`}
                                            >
                                                {balanceLabel(row.inflow, row.outflow)}
                                            </span>
                                            <span
                                                aria-hidden
                                                className="h-2 rounded-r-(--radius-sm) bg-(--chart-color-1)"
                                                style={{
                                                    width: `${Math.round((row.inflow / max) * 50)}%`,
                                                }}
                                            />
                                            <span
                                                aria-hidden
                                                className="h-2 rounded-r-(--radius-sm) bg-(--chart-color-2)"
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
        </Section>
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

/** The row's "Evidence" action: the served fields of the artifact in the shared drawer. */
function ArtifactEvidenceButton({ row }: { row: WorkGraphArtifactRow }) {
    const evidence = useEvidenceDrawer();
    const entity = row.displayName?.trim() || undefined;
    return (
        <Button
            variant="ghost"
            size="sm"
            icon={<ArrowRight />}
            data-testid="artifact-evidence-button"
            aria-label={`Evidence for ${entity ?? NODE_TYPE_LABELS[row.nodeType]}`}
            onClick={() =>
                evidence.open({
                    title: entity ?? `${NODE_TYPE_LABELS[row.nodeType]} (unresolved)`,
                    content: (
                        <EvidenceFactList aria-label="Artifact" testId="artifact-evidence-facts">
                            <EvidenceFact label="Type" value={NODE_TYPE_LABELS[row.nodeType]} />
                            {/* An unresolved row has no served name: it says so and never shows the id. */}
                            <EvidenceFact label="Entity" value={entity} stacked />
                            <EvidenceFact label="Connections" value={formatNumber(row.degree)} />
                            {/* The evidence reference exactly as served. */}
                            <EvidenceFact
                                label="Evidence reference"
                                value={row.evidence ? row.evidence : undefined}
                                stacked
                            />
                        </EvidenceFactList>
                    ),
                })
            }
        >
            {CTA_LABELS.evidence}
        </Button>
    );
}

/** Rows per page of the Artifact browser (the API serves the top 50; no total or offset exists). */
const ARTIFACT_PAGE_SIZE = 10;

function ArtifactsView({ rows, loading, error }: ArtifactsViewProps) {
    // A new set of served rows (scope, window or theme changed) starts again at the first page.
    const rowsKey = rows.map((row) => `${row.nodeType}:${row.nodeId}`).join("|");
    const [pager, setPager] = useState({ key: rowsKey, offset: 0 });
    const offset = pager.key === rowsKey ? pager.offset : 0;
    const setOffset = (next: number) => setPager({ key: rowsKey, offset: next });
    // The served rows are the whole list: page over them, never past the end.
    const start = Math.min(offset, Math.max(0, rows.length - 1));
    const pageRows = rows.slice(start, start + ARTIFACT_PAGE_SIZE);
    return (
        <Section
            data-testid="artifacts-panel"
            as="h3"
            title="Artifact browser"
            description="Entities ranked by how many relationships they carry; provider artifact labels stay intact. Open a node on the Overview tab to inspect its full evidence trail."
        >
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
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="artifacts-table">
                        <thead className="text-label-caps uppercase text-(--ink-muted)">
                            <tr>
                                <th className="px-5 py-3 text-left">Type</th>
                                <th className="px-5 py-3 text-left">Entity</th>
                                <th className="px-5 py-3 text-right">Connections</th>
                                <th className="px-5 py-3 text-left">{CTA_LABELS.evidence}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.map((row) => (
                                <tr
                                    key={`${row.nodeType}:${row.nodeId}`}
                                    data-testid="artifact-row"
                                    className="border-t border-(--card-stroke)/60"
                                >
                                    <td className="px-5 py-3 align-middle text-(--ink-muted)">
                                        {NODE_TYPE_LABELS[row.nodeType]}
                                    </td>
                                    <td className="px-5 py-3 align-middle">
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
                                    <td className="px-5 py-3">
                                        <ArtifactEvidenceButton row={row} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {rows.length > ARTIFACT_PAGE_SIZE ? (
                        <AdminPager
                            offset={start}
                            count={pageRows.length}
                            hasNext={start + ARTIFACT_PAGE_SIZE < rows.length}
                            onPreviousAction={() =>
                                setOffset(Math.max(0, start - ARTIFACT_PAGE_SIZE))
                            }
                            onNextAction={() => setOffset(start + ARTIFACT_PAGE_SIZE)}
                        />
                    ) : null}
                </div>
            )}
        </Section>
    );
}

type NodeDetailPanelProps = {
    node: SelectedNode;
    incomingEdges: WorkGraphEdge[];
    outgoingEdges: WorkGraphEdge[];
    onClose: () => void;
};

export function NodeDetailPanel({
    node,
    incomingEdges,
    outgoingEdges,
    onClose,
}: NodeDetailPanelProps) {
    return (
        <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-sm ${nodeTypeDotClass(node.type)}`} />
                    <div>
                        <p className="text-xs text-(--ink-muted) uppercase tracking-wider">
                            {NODE_TYPE_LABELS[node.type]}
                        </p>
                        <h4 className="text-lg font-medium font-mono">{node.id}</h4>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
