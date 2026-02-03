"use client";

import {
  WorkGraphExplorer,
  WorkGraphLegend,
} from "@/components/charts/WorkGraphExplorer";
import type { WorkGraphEdge, WorkGraphNodeType } from "@/lib/graphql/types";
import type { MetricFilter } from "@/lib/filters/types";

type GraphViewProps = {
  filters: MetricFilter;
  activeRole?: string;
  edges?: WorkGraphEdge[];
  onNodeClick?: (nodeId: string, nodeType: WorkGraphNodeType) => void;
};

export function GraphView({ filters, activeRole, edges, onNodeClick }: GraphViewProps) {
  // Use provided edges or sample data for demo/development
  const displayEdges = edges ?? sampleWorkGraphEdges;
  
  // TODO: In production, fetch edges based on filters using useWorkGraphEdges hook
  // For now, we use sample data to demonstrate the visualization
  void filters;
  void activeRole;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
        <h3 className="text-lg font-medium mb-4">Work Graph Explorer</h3>
        <p className="text-sm text-(--ink-muted) mb-4">
          Visualize relationships between issues, PRs, commits, and files.
          Drag nodes to rearrange. Scroll to zoom. Click a node to see details.
        </p>
        <WorkGraphExplorer
          edges={displayEdges}
          height={500}
          onNodeClick={onNodeClick}
        />
      </div>
      <div className="bg-card rounded-lg border border-(--card-stroke) p-4">
        <WorkGraphLegend />
      </div>
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
