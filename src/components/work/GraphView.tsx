"use client";

import { useState, useMemo, useCallback } from "react";

import {
  WorkGraphExplorer,
  WorkGraphLegend,
} from "@/components/charts/WorkGraphExplorer";
import { useWorkGraphEdges } from "@/lib/graphql/hooks";
import type { WorkGraphEdge, WorkGraphNodeType } from "@/lib/graphql/types";
import type { MetricFilter } from "@/lib/filters/types";
import { useOrgId } from "@/lib/graphql/provider";

type SelectedNode = {
  id: string;
  type: WorkGraphNodeType;
};

type GraphViewProps = {
  filters: MetricFilter;
  activeRole?: string;
};

export function GraphView({ filters, activeRole }: GraphViewProps) {
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  const contextOrgId = useOrgId();
  const orgId = filters.scope.ids[0] || contextOrgId || "";
  const { edges, loading, error, totalCount } = useWorkGraphEdges({
    orgId,
    filters: { limit: 500 },
    pause: !orgId,
  });

  const displayEdges = edges.length === 0 ? sampleWorkGraphEdges : edges;

  const handleNodeClick = useCallback((nodeId: string, nodeType: WorkGraphNodeType) => {
    setSelectedNode((prev) =>
      prev?.id === nodeId && prev?.type === nodeType ? null : { id: nodeId, type: nodeType }
    );
  }, []);

  const nodeDetails = useMemo(() => {
    if (!selectedNode) return null;
    const nodeKey = `${selectedNode.type}:${selectedNode.id}`;

    const incomingEdges = displayEdges.filter(
      (e) => `${e.targetType}:${e.targetId}` === nodeKey
    );
    const outgoingEdges = displayEdges.filter(
      (e) => `${e.sourceType}:${e.sourceId}` === nodeKey
    );

    return { incomingEdges, outgoingEdges };
  }, [selectedNode, displayEdges]);

  void activeRole;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
        <div className="flex items-center justify-between mb-4">
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

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
            Failed to load work graph: {error.message}
          </div>
        )}

        <WorkGraphExplorer
          edges={displayEdges}
          height={500}
          onNodeClick={handleNodeClick}
          selectedNodeId={selectedNode ? `${selectedNode.type}:${selectedNode.id}` : undefined}
        />
      </div>

      {selectedNode && nodeDetails && (
        <NodeDetailPanel
          node={selectedNode}
          incomingEdges={nodeDetails.incomingEdges}
          outgoingEdges={nodeDetails.outgoingEdges}
          onClose={() => setSelectedNode(null)}
        />
      )}

      <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
        <WorkGraphLegend />
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
  };

  const typeLabels: Record<WorkGraphNodeType, string> = {
    ISSUE: "Issue",
    PR: "Pull Request",
    COMMIT: "Commit",
    FILE: "File",
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
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
          aria-label="Close panel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
      <p className="text-sm font-medium mb-1">{title} ({edges.length})</p>
      <p className="text-xs text-(--ink-muted) mb-2">{subtitle}</p>
      <ul className="space-y-1.5 max-h-48 overflow-y-auto">
        {edges.map((edge) => (
          <li
            key={edge.edgeId}
            className="flex items-center justify-between text-sm bg-white/5 rounded px-2 py-1"
          >
            <span className="font-mono text-xs truncate">{getLabel(edge)}</span>
            <span className="text-xs text-(--ink-muted) ml-2">
              {getRelation(edge).toLowerCase().replace(/_/g, " ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const sampleWorkGraphEdges: WorkGraphEdge[] = [
  {
    edgeId: "e1",
    sourceType: "ISSUE",
    sourceId: "PROJ-101",
    targetType: "PR",
    targetId: "PR-201",
    edgeType: "FIXES",
    provenance: "NATIVE",
    confidence: 1.0,
    evidence: "Fixes #101",
  },
  {
    edgeId: "e2",
    sourceType: "ISSUE",
    sourceId: "PROJ-102",
    targetType: "ISSUE",
    targetId: "PROJ-101",
    edgeType: "BLOCKS",
    provenance: "EXPLICIT_TEXT",
    confidence: 0.9,
    evidence: "is blocked by PROJ-102",
  },
  {
    edgeId: "e3",
    sourceType: "PR",
    sourceId: "PR-201",
    targetType: "COMMIT",
    targetId: "abc123",
    edgeType: "CONTAINS",
    provenance: "NATIVE",
    confidence: 1.0,
    evidence: "",
  },
  {
    edgeId: "e4",
    sourceType: "COMMIT",
    sourceId: "abc123",
    targetType: "FILE",
    targetId: "src/api/handler.ts",
    edgeType: "TOUCHES",
    provenance: "NATIVE",
    confidence: 1.0,
    evidence: "",
  },
  {
    edgeId: "e5",
    sourceType: "ISSUE",
    sourceId: "PROJ-103",
    targetType: "ISSUE",
    targetId: "PROJ-101",
    edgeType: "RELATES",
    provenance: "HEURISTIC",
    confidence: 0.7,
    evidence: "similar labels",
  },
  {
    edgeId: "e6",
    sourceType: "ISSUE",
    sourceId: "PROJ-104",
    targetType: "PR",
    targetId: "PR-202",
    edgeType: "IMPLEMENTS",
    provenance: "EXPLICIT_TEXT",
    confidence: 0.95,
    evidence: "Implements PROJ-104",
  },
  {
    edgeId: "e7",
    sourceType: "PR",
    sourceId: "PR-202",
    targetType: "COMMIT",
    targetId: "def456",
    edgeType: "CONTAINS",
    provenance: "NATIVE",
    confidence: 1.0,
    evidence: "",
  },
  {
    edgeId: "e8",
    sourceType: "COMMIT",
    sourceId: "def456",
    targetType: "FILE",
    targetId: "src/components/Button.tsx",
    edgeType: "TOUCHES",
    provenance: "NATIVE",
    confidence: 1.0,
    evidence: "",
  },
  {
    edgeId: "e9",
    sourceType: "COMMIT",
    sourceId: "def456",
    targetType: "FILE",
    targetId: "src/api/handler.ts",
    edgeType: "TOUCHES",
    provenance: "NATIVE",
    confidence: 1.0,
    evidence: "",
  },
];
