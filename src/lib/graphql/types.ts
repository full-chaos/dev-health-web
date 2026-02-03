/**
 * GraphQL types for dev-health-ops analytics API.
 * Mirrors the Strawberry GraphQL schema in the backend.
 */

// ==== Enums ====

export type DimensionInput =
    | "TEAM"
    | "REPO"
    | "AUTHOR"
    | "WORK_TYPE"
    | "THEME"
    | "SUBCATEGORY";

export type MeasureInput =
    | "COUNT"
    | "CHURN_LOC"
    | "CYCLE_TIME_HOURS"
    | "THROUGHPUT";

export type BucketIntervalInput = "DAY" | "WEEK" | "MONTH";

export type ScopeLevelInput = "ORG" | "TEAM" | "REPO" | "SERVICE" | "DEVELOPER";

// ==== Input Types ====

export interface DateRangeInput {
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
}

export interface TimeseriesRequestInput {
    dimension: DimensionInput;
    measure: MeasureInput;
    interval: BucketIntervalInput;
    dateRange: DateRangeInput;
}

export interface BreakdownRequestInput {
    dimension: DimensionInput;
    measure: MeasureInput;
    dateRange: DateRangeInput;
    topN?: number;
}

export interface SankeyRequestInput {
    path: DimensionInput[];
    measure: MeasureInput;
    dateRange: DateRangeInput;
    maxNodes?: number;
    maxEdges?: number;
    useInvestment?: boolean;
}

// ==== Filter Input Types ====

export interface ScopeFilterInput {
    level?: ScopeLevelInput;
    ids?: string[];
}

export interface WhoFilterInput {
    developers?: string[];
    roles?: string[];
}

export interface WhatFilterInput {
    repos?: string[];
    services?: string[];
}

export interface WhyFilterInput {
    workCategory?: string[];
    issueType?: string[];
}

export interface HowFilterInput {
    flowStage?: string[];
}

export interface FilterInput {
    scope?: ScopeFilterInput;
    who?: WhoFilterInput;
    what?: WhatFilterInput;
    why?: WhyFilterInput;
    how?: HowFilterInput;
}

export interface AnalyticsRequestInput {
    timeseries?: TimeseriesRequestInput[];
    breakdowns?: BreakdownRequestInput[];
    sankey?: SankeyRequestInput;
    useInvestment?: boolean;
    filters?: FilterInput;
}

// ==== Output Types ====

export interface TimeseriesBucket {
    date: string;
    value: number;
}

export interface TimeseriesResult {
    dimension: string;
    dimensionValue: string;
    measure: string;
    buckets: TimeseriesBucket[];
}

export interface BreakdownItem {
    key: string;
    value: number;
}

export interface BreakdownResult {
    dimension: string;
    measure: string;
    items: BreakdownItem[];
}

export interface SankeyNode {
    id: string;
    label: string;
    dimension: string;
    value: number;
}

export interface SankeyEdge {
    source: string;
    target: string;
    value: number;
}

export interface SankeyCoverage {
    teamCoverage: number;
    repoCoverage: number;
}

export interface SankeyResult {
    nodes: SankeyNode[];
    edges: SankeyEdge[];
    coverage?: SankeyCoverage;
}

export interface AnalyticsResult {
    timeseries: TimeseriesResult[];
    breakdowns: BreakdownResult[];
    sankey?: SankeyResult;
}

export interface CatalogValueItem {
    value: string;
    count: number;
}

export interface CatalogLimits {
    maxDays: number;
    maxBuckets: number;
    maxTopN: number;
    maxSankeyNodes: number;
    maxSankeyEdges: number;
    maxSubRequests: number;
}

export interface CatalogDimension {
    name: string;
    description: string;
}

export interface CatalogMeasure {
    name: string;
    description: string;
}

export interface CatalogResult {
    dimensions: CatalogDimension[];
    measures: CatalogMeasure[];
    limits: CatalogLimits;
    values?: CatalogValueItem[];
}

// ==== Query Response Wrappers ====

export interface GraphQLResponse<T> {
    data?: T;
    errors?: Array<{
        message: string;
        extensions?: {
            code?: string;
            [key: string]: unknown;
        };
    }>;
}

export interface CatalogQueryResponse {
    catalog: CatalogResult;
    orgId: string;
    dimension?: DimensionInput;
    filters?: FilterInput;
}

export interface AnalyticsQueryResponse {
    analytics: AnalyticsResult;
}

// ==== Capacity Planning Types ====

export interface CapacityForecastInput {
    teamId?: string;
    workScopeId?: string;
    targetItems?: number;
    targetDate?: string;
    historyDays?: number;
    simulations?: number;
}

export interface CapacityForecastFilterInput {
    teamId?: string;
    workScopeId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
}

export interface CapacityForecast {
    forecastId: string;
    computedAt: string;
    teamId?: string;
    workScopeId?: string;
    backlogSize: number;
    targetItems?: number;
    targetDate?: string;
    p50Date?: string;
    p85Date?: string;
    p95Date?: string;
    p50Days?: number;
    p85Days?: number;
    p95Days?: number;
    p50Items?: number;
    p85Items?: number;
    p95Items?: number;
    throughputMean: number;
    throughputStddev: number;
    historyDays: number;
    insufficientHistory: boolean;
    highVariance: boolean;
}

export interface PageInfo {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
}

export interface CapacityForecastEdge {
    node: CapacityForecast;
    cursor: string;
}

export interface CapacityForecastConnection {
    edges: CapacityForecastEdge[];
    pageInfo: PageInfo;
    totalCount: number;
}

export interface CapacityForecastQueryResponse {
    capacityForecast: CapacityForecast | null;
}

export interface CapacityForecastsQueryResponse {
    capacityForecasts: CapacityForecastConnection;
}

// ==== Work Graph Types ====

export type WorkGraphNodeType = "ISSUE" | "PR" | "COMMIT" | "FILE";

export type WorkGraphEdgeType =
    // Issue-to-issue relationships
    | "BLOCKS"
    | "RELATES"
    | "DUPLICATES"
    | "IS_BLOCKED_BY"
    | "IS_RELATED_TO"
    | "IS_DUPLICATE_OF"
    | "PARENT_OF"
    | "CHILD_OF"
    // Issue-to-PR relationships
    | "REFERENCES"
    | "IMPLEMENTS"
    | "FIXES"
    // PR-to-commit relationships
    | "CONTAINS"
    // Commit-to-file relationships
    | "TOUCHES";

export type WorkGraphProvenance = "NATIVE" | "EXPLICIT_TEXT" | "HEURISTIC";

export interface WorkGraphEdge {
    edgeId: string;
    sourceType: WorkGraphNodeType;
    sourceId: string;
    targetType: WorkGraphNodeType;
    targetId: string;
    edgeType: WorkGraphEdgeType;
    provenance: WorkGraphProvenance;
    confidence: number;
    evidence: string;
    repoId?: string;
    provider?: string;
}

export interface WorkGraphEdgeFilterInput {
    repoIds?: string[];
    sourceType?: WorkGraphNodeType;
    targetType?: WorkGraphNodeType;
    edgeType?: WorkGraphEdgeType;
    nodeId?: string;
    limit?: number;
}

export interface WorkGraphEdgesResult {
    edges: WorkGraphEdge[];
    totalCount: number;
    pageInfo: PageInfo;
}

export interface WorkGraphEdgesQueryResponse {
    workGraphEdges: WorkGraphEdgesResult;
}
