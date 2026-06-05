import type { WorkGraphEdge, PageInfo } from "@/lib/graphql/types";
import type { SparkPoint } from "@/lib/types";

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

export type FeatureFlagSummary = {
    activeFlags: number;
    activeFlagsDelta: number;
    activeFlagsSpark: SparkPoint[];

    releaseFrictionDelta: number;
    releaseFrictionSeverity: "low" | "moderate" | "high" | "critical";
    releaseFrictionSpark: SparkPoint[];

    releaseErrorRateDelta: number;
    releaseErrorRateSpark: SparkPoint[];

    coverageRatio: number;
    coverageRatioDelta: number;
    coverageRatioSpark: SparkPoint[];
};

export type FeatureFlagsData = {
    summary: FeatureFlagSummary;
};

export type FeatureFlagListItem = {
    flagId: string;
    flagKey: string;
    provider: string;
    projectKey: string;
    createdAt: string | null;
    lastToggledAt: string | null;
    isActive: boolean | null;
};

export type FeatureFlagListResult = {
    items: FeatureFlagListItem[];
    totalCount: number;
    hasNextPage: boolean;
};
