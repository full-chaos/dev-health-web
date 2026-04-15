import type { WorkGraphEdge, WorkGraphEdgesResult, PageInfo } from "@/lib/graphql/types";

export type FeatureFlagEdgeType = "INTRODUCED_BY" | "CONFIG_CHANGED_BY" | "GUARDS" | "IMPACTS";

export interface FeatureFlagRegistryResult {
  flags: WorkGraphEdge[];
  totalCount: number;
  pageInfo: PageInfo;
}

export interface FeatureFlagEventsResult {
  events: WorkGraphEdge[];
  totalCount: number;
  pageInfo: PageInfo;
}

export interface ReleaseImpactResult {
  edges: WorkGraphEdge[];
  totalCount: number;
  pageInfo: PageInfo;
}

export interface FeatureFlagData {
  registry: FeatureFlagRegistryResult;
  events: FeatureFlagEventsResult;
  releaseImpact: ReleaseImpactResult;
}
