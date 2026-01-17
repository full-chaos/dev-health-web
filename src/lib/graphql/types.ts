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

export interface AnalyticsRequestInput {
    timeseries?: TimeseriesRequestInput[];
    breakdowns?: BreakdownRequestInput[];
    sankey?: SankeyRequestInput;
    useInvestment?: boolean;
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
}

export interface AnalyticsQueryResponse {
    analytics: AnalyticsResult;
}
