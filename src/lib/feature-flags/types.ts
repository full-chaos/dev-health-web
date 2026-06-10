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
    /**
     * Undefined when no backend measure for active-flag count delta is exposed
     * (FLAG_ACTIVE_COUNT_DELTA is not yet in the analytics schema). The card
     * renders its deltaUnavailableLabel ("No prior period") in this case.
     */
    activeFlagsDelta?: number;
    activeFlagsSpark: SparkPoint[];

    releaseFrictionDelta: number;
    releaseFrictionSeverity: "low" | "moderate" | "high" | "critical";
    releaseFrictionSpark: SparkPoint[];

    releaseErrorRateDelta: number;
    releaseErrorRateSpark: SparkPoint[];

    coverageRatio: number;
    /**
     * Undefined when no backend measure for coverage-ratio delta is exposed
     * (FLAG_COVERAGE_RATIO_DELTA is not yet in the analytics schema). The card
     * renders its deltaUnavailableLabel ("No prior period") in this case.
     */
    coverageRatioDelta?: number;
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
