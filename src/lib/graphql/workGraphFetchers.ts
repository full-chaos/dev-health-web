import { graphqlFetch } from "./server";
import { AI_WORKFLOW_DRILLDOWN_QUERY, WORK_GRAPH_EDGES_QUERY } from "./queries";
import type {
  AIWorkflowDrilldownQueryResponse,
  AIWorkflowDrilldownResult,
  AIWorkflowRootTypeInput,
  WorkGraphEdgeFilterInput,
  WorkGraphEdgesQueryResponse,
  WorkGraphEdgesResult,
  WorkUnitInvestmentDistribution,
} from "./types";
import { demoInvestmentForRoot, demoWorkflowDrilldown } from "@/lib/workGraph/demo";

export async function getWorkGraphEdgesViaGraphQL(params: {
  orgId: string;
  filters?: WorkGraphEdgeFilterInput;
}): Promise<WorkGraphEdgesResult> {
  const response = await graphqlFetch<WorkGraphEdgesQueryResponse>(
    WORK_GRAPH_EDGES_QUERY,
    { orgId: params.orgId, filters: params.filters ?? null },
    { orgId: params.orgId },
  );
  return response.workGraphEdges;
}

export async function getAIWorkflowDrilldownViaGraphQL(params: {
  orgId: string;
  rootType: AIWorkflowRootTypeInput;
  rootId: string;
  depth?: number;
  limit?: number;
  useDemoFallback?: boolean;
}): Promise<AIWorkflowDrilldownResult> {
  try {
    const response = await graphqlFetch<AIWorkflowDrilldownQueryResponse>(
      AI_WORKFLOW_DRILLDOWN_QUERY,
      {
        orgId: params.orgId,
        rootType: params.rootType,
        rootId: params.rootId,
        depth: params.depth ?? 3,
        limit: params.limit ?? 100,
      },
      { orgId: params.orgId },
    );
    const drilldown = response.aiWorkflowDrilldown;
    if (drilldown.dataAvailable || !params.useDemoFallback) return drilldown;
  } catch {
    if (!params.useDemoFallback) throw new Error("Work Graph drilldown unavailable");
  }
  return demoWorkflowDrilldown(params.rootType, params.rootId, params.orgId);
}

export function getWorkUnitInvestmentDistribution(params: {
  rootType: AIWorkflowRootTypeInput;
  rootId: string;
}): WorkUnitInvestmentDistribution {
  return demoInvestmentForRoot(params.rootType, params.rootId);
}
