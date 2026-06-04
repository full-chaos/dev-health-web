"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { WorkGraphExplorer, WorkGraphLegend } from "@/components/charts/WorkGraphExplorer";
import { useWorkGraphEdges } from "@/lib/graphql/hooks";
import type { WorkGraphEdge, WorkGraphEdgeType, WorkGraphNodeType } from "@/lib/graphql/types";
import type { MetricFilter } from "@/lib/filters/types";
import { useOrgId } from "@/lib/graphql/provider";
import { formatNumber } from "@/lib/formatters";
import {
  INVESTMENT_SUBCATEGORIES,
  INVESTMENT_THEMES,
  labelInvestmentKey,
} from "@/lib/workGraph/taxonomy";

type SelectedNode = {
  id: string;
  type: WorkGraphNodeType;
};

type GraphViewProps = {
  filters: MetricFilter;
  activeRole?: string;
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

const DEFAULT_CONNECTION_SLICE_ID = CONNECTION_SLICES[0].id;

function isConnectionSliceId(value: string | null): value is ConnectionSlice["id"] {
  return Boolean(value && CONNECTION_SLICES.some((slice) => slice.id === value));
}

function isInvestmentTheme(value: string | null): value is (typeof INVESTMENT_THEMES)[number] {
  return Boolean(value && INVESTMENT_THEMES.includes(value as (typeof INVESTMENT_THEMES)[number]));
}

function isInvestmentSubcategory(
  value: string | null,
): value is (typeof INVESTMENT_SUBCATEGORIES)[number] {
  return Boolean(
    value && INVESTMENT_SUBCATEGORIES.includes(value as (typeof INVESTMENT_SUBCATEGORIES)[number]),
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
  const subcategory = isInvestmentSubcategory(subcategoryParam) ? subcategoryParam : "all";
  const subcategoryTheme = subcategory === "all" ? null : subcategory.split(".", 1)[0];
  const theme = isInvestmentTheme(themeParam)
    ? themeParam
    : isInvestmentTheme(subcategoryTheme)
      ? subcategoryTheme
      : "all";

  return {
    theme,
    subcategory,
    connectionSliceId: isConnectionSliceId(connectionParam)
      ? connectionParam
      : DEFAULT_CONNECTION_SLICE_ID,
    selectedNode: parseGraphNode(searchParams.get("graph_node")),
  };
}

export function GraphView({ filters, activeRole }: GraphViewProps) {
  const searchParams = useSearchParams();
  const searchState = useMemo(() => getGraphSearchState(searchParams), [searchParams]);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(searchState.selectedNode);
  const [theme, setTheme] = useState(searchState.theme);
  const [subcategory, setSubcategory] = useState(searchState.subcategory);
  const [connectionSliceId, setConnectionSliceId] = useState(searchState.connectionSliceId);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(true);
  const graphHeight = 580;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- graph state mirrors URL search parameters.
    setTheme(searchState.theme);
    setSubcategory(searchState.subcategory);
    setConnectionSliceId(searchState.connectionSliceId);
    setSelectedNode(searchState.selectedNode);
  }, [searchState]);

  const contextOrgId = useOrgId();
  const orgId = filters.scope.ids[0] || contextOrgId || "";
  const { edges, loading, error, totalCount } = useWorkGraphEdges({
    orgId,
    filters: { repoIds: filters.what?.repos, limit: GRAPH_EDGE_QUERY_LIMIT },
    pause: !orgId,
  });

  const activeConnectionSlice =
    CONNECTION_SLICES.find((slice) => slice.id === connectionSliceId) ?? CONNECTION_SLICES[0];
  const slicedEdges = useMemo(
    () =>
      activeConnectionSlice.edgeTypes.length
        ? edges.filter((edge) => activeConnectionSlice.edgeTypes.includes(edge.edgeType))
        : edges,
    [activeConnectionSlice, edges],
  );
  const displayEdges = useMemo(() => slicedEdges.slice(0, GRAPH_RENDER_EDGE_LIMIT), [slicedEdges]);
  const hiddenEdgeCount = Math.max(0, slicedEdges.length - displayEdges.length);
  const visibleSubcategories = useMemo(
    () =>
      INVESTMENT_SUBCATEGORIES.filter((item) => theme === "all" || item.startsWith(`${theme}.`)),
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

    const incomingEdges = displayEdges.filter((e) => `${e.targetType}:${e.targetId}` === nodeKey);
    const outgoingEdges = displayEdges.filter((e) => `${e.sourceType}:${e.sourceId}` === nodeKey);

    return { incomingEdges, outgoingEdges };
  }, [selectedNode, displayEdges]);

  void activeRole;

  return (
    <div
      className={`grid gap-4 2xl:items-start ${isLegendCollapsed ? "2xl:grid-cols-[minmax(0,1fr)_3.25rem]" : "2xl:grid-cols-[minmax(0,1fr)_17rem]"}`}
    >
      <div className="order-1 min-w-0 space-y-4">
        <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-medium">Work Graph Explorer</h3>
              <p className="text-sm text-(--ink-muted)">
                Visualize relationships between issues, PRs, commits, and files.
              </p>
            </div>
            <div className="text-xs text-(--ink-muted)">
              {loading ? "Loading..." : `${totalCount} edges`}
            </div>
          </div>

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
                <span className="uppercase tracking-[0.18em] text-(--ink-muted)">Theme</span>
                <select
                  value={theme}
                  onChange={(event) => {
                    setTheme(event.target.value);
                    setSubcategory("all");
                  }}
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
                <span className="uppercase tracking-[0.18em] text-(--ink-muted)">Subcategory</span>
                <select
                  value={subcategory}
                  onChange={(event) => setSubcategory(event.target.value)}
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
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-(--card-stroke) pt-3 text-[11px] text-(--ink-muted)">
              <span title={activeConnectionSlice.description}>
                {activeConnectionSlice.description}
              </span>
              <span>
                {theme !== "all" || subcategory !== "all"
                  ? `Selected context: ${theme === "all" ? "all themes" : labelInvestmentKey(theme)} / ${subcategory === "all" ? "all subcategories" : labelInvestmentKey(subcategory)}. `
                  : ""}
                Theme/subcategory are context only; persisted distributions drive the selected theme
                context.
              </span>
            </div>
          </div>

          {(hiddenEdgeCount > 0 ||
            totalCount > edges.length ||
            slicedEdges.length !== edges.length) && (
            <div className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Showing {displayEdges.length} {activeConnectionSlice.label.toLowerCase()} edges for
              browser responsiveness
              {slicedEdges.length !== edges.length
                ? ` (${edges.length - slicedEdges.length} fetched edges hidden by connection type)`
                : ""}
              {hiddenEdgeCount > 0
                ? `; ${hiddenEdgeCount} sliced edges summarized outside the canvas`
                : ""}
              {totalCount > edges.length
                ? `; ${totalCount - edges.length} additional backend edges are available through narrower filters`
                : ""}
              .
            </div>
          )}

          {error && (
            <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              Failed to load work graph: {error.message}
            </div>
          )}

          {!loading && !error && edges.length === 0 ? (
            <div
              className="flex items-center justify-center text-sm text-(--ink-muted)"
              style={{ height: graphHeight }}
            >
              No work graph data available for this scope and window.
            </div>
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
                  selectedNode ? `${selectedNode.type}:${selectedNode.id}` : undefined
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

  const typeLabels: Record<WorkGraphNodeType, string> = {
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

  return (
    <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-sm ${typeColors[node.type]}`} />
          <div>
            <p className="text-xs text-(--ink-muted) uppercase tracking-wider">
              {typeLabels[node.type]}
            </p>
            <h4 className="text-lg font-medium font-mono">{node.id}</h4>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
          aria-label="Close panel"
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
          <li key={edge.edgeId} className="grid gap-1 text-sm bg-white/5 rounded px-2 py-1">
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs truncate">{getLabel(edge)}</span>
              <span className="text-xs text-(--ink-muted)">
                {getRelation(edge).toLowerCase().replace(/_/g, " ")}
              </span>
            </span>
            <span className="text-[11px] text-(--ink-muted)">
              {edge.provenance.toLowerCase().replace(/_/g, " ")} ·{" "}
              {formatNumber(edge.confidence * 100, {
                maximumFractionDigits: 0,
              })}
              % confidence
            </span>
            {edge.evidence && <q className="text-[11px] text-(--ink-muted)">{edge.evidence}</q>}
          </li>
        ))}
      </ul>
    </div>
  );
}
