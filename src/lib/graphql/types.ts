/**
 * GraphQL types for dev-health-ops analytics API.
 * Mirrors the Strawberry GraphQL schema in the backend.
 */

// ==== Enums ====

export type DimensionInput = "TEAM" | "REPO" | "AUTHOR" | "WORK_TYPE" | "THEME" | "SUBCATEGORY";

export type MeasureInput =
    | "COUNT"
    | "CHURN_LOC"
    | "CYCLE_TIME_HOURS"
    | "THROUGHPUT"
    | "PIPELINE_SUCCESS_RATE"
    | "PIPELINE_FAILURE_RATE"
    | "PIPELINE_DURATION_P95"
    | "PIPELINE_QUEUE_TIME"
    | "PIPELINE_RERUN_RATE"
    | "TEST_PASS_RATE"
    | "TEST_FAILURE_RATE"
    | "TEST_FLAKE_RATE"
    | "TEST_SUITE_DURATION_P95"
    | "COVERAGE_LINE_PCT"
    | "COVERAGE_BRANCH_PCT"
    | "COVERAGE_DELTA_PCT"
    | "FLAG_FRICTION_DELTA"
    | "FLAG_ERROR_RATE_DELTA"
    | "FLAG_COVERAGE_RATIO"
    | "FLAG_ACTIVATION_RATE";

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

export interface FlowMatrixRequestInput {
    dimension: DimensionInput;
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
    flowMatrix?: FlowMatrixRequestInput;
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

export interface FlowMatrixResult {
    nodes: SankeyNode[];
    edges: SankeyEdge[];
}

export interface EvidenceQualityStatsResult {
    mean?: number | null;
    stddev?: number | null;
    total: number;
    bandCounts: Record<string, number>;
}

export interface AnalyticsResult {
    timeseries: TimeseriesResult[];
    breakdowns: BreakdownResult[];
    sankey?: SankeyResult;
    flowMatrix?: FlowMatrixResult;
    evidenceQualityDistribution?: Record<string, number> | null;
    evidenceQualityStats?: EvidenceQualityStatsResult | null;
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

// ==== Code Health Types ====

export interface BusFactorScopeInput {
    repoId?: string | null;
    teamId?: string | null;
}

export interface MaintainerShare {
    author: string;
    sharePercent: number;
}

export interface RepoBusFactor {
    repoId: string;
    repoName: string;
    value: number;
    topMaintainers: MaintainerShare[];
    evidenceSampleCount: number;
}

export interface BusFactorScope {
    repoId?: string | null;
    teamId?: string | null;
}

export interface BusFactor {
    orgId: string;
    scope: BusFactorScope;
    value: number;
    topMaintainers: MaintainerShare[];
    repos: RepoBusFactor[];
    evidenceSampleCount: number;
}

export interface BusFactorQueryResponse {
    busFactor: BusFactor;
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

export interface ThroughputForecastInput {
    teamIds?: string[] | null;
    workScopeId?: string | null;
    backlogSize?: number | null;
    historyWeeks?: number;
}

export interface ThroughputRollingWindow {
    windowWeeks: number;
    meanWeeklyThroughput: number;
    sampleCount: number;
    insufficientHistory: boolean;
}

export interface ThroughputRiskOverlay {
    kind: string;
    score: number;
    label: string;
    value: number;
    threshold: number;
    active: boolean;
}

export interface ThroughputForecast {
    forecastId: string;
    computedAt: string;
    teamId: string | null;
    workScopeId?: string | null;
    backlogSize: number;
    historyWeeks: number;
    p50Weeks?: number | null;
    p75Weeks?: number | null;
    p90Weeks?: number | null;
    rollingWindows: ThroughputRollingWindow[];
    primaryRisk: ThroughputRiskOverlay;
    wipCongestion: ThroughputRiskOverlay;
    reviewBottleneck: ThroughputRiskOverlay;
    incidentLoad: ThroughputRiskOverlay;
    insufficientHistory: boolean;
}

export interface ThroughputForecastQueryResponse {
    throughputForecast: ThroughputForecast | null;
}

// ==== Operating Review Types ====

export interface OperatingReviewInput {
    teamId: string | null;
    weekStart: string;
}

export type OperatingReviewDeltaStatus = "changed" | "improved" | "worsened" | "unchanged";

export interface OperatingReviewDelta {
    value: number;
    priorValue: number;
    absolute: number;
    percent?: number | null;
    status: OperatingReviewDeltaStatus;
}

export interface OperatingReviewMetric {
    key: string;
    label: string;
    value: number;
    unit: string;
    delta: OperatingReviewDelta;
}

export interface OperatingReviewSection {
    key: string;
    title: string;
    metrics: OperatingReviewMetric[];
    changed: string[];
    improved: string[];
    worsened: string[];
}

export interface OperatingReview {
    orgId: string;
    teamId: string | null;
    weekStart: string;
    priorWeekStart: string;
    sections: OperatingReviewSection[];
    recommendations: string[];
    recommendationsEmptyState: string;
}

export interface OperatingReviewQueryResponse {
    operatingReview: OperatingReview;
}

// ==== Work Graph Types ====

export type InvestmentTheme =
    | "feature_delivery"
    | "operational"
    | "maintenance"
    | "quality"
    | "risk";

export type InvestmentSubcategory =
    | "feature_delivery.customer"
    | "feature_delivery.roadmap"
    | "feature_delivery.enablement"
    | "operational.incident_response"
    | "operational.on_call"
    | "operational.support"
    | "maintenance.refactor"
    | "maintenance.upgrade"
    | "maintenance.debt"
    | "quality.testing"
    | "quality.bugfix"
    | "quality.reliability"
    | "risk.security"
    | "risk.compliance"
    | "risk.vulnerability";

export interface InvestmentEvidenceQuote {
    quote: string;
    sourceType: "issue" | "pr" | "commit";
    sourceId: string;
}

export interface WorkUnitInvestmentDistribution {
    workUnitId: string;
    themeDistribution: Partial<Record<InvestmentTheme, number>>;
    subcategoryDistribution: Partial<Record<InvestmentSubcategory, number>>;
    evidenceQuotes: InvestmentEvidenceQuote[];
    uncertainty?: string;
}

export type WorkGraphNodeType =
    | "ISSUE"
    | "PR"
    | "COMMIT"
    | "FILE"
    | "RELEASE"
    | "FEATURE_FLAG"
    | "AI_WORKFLOW_RUN"
    | "DIFF"
    | "REVIEW_OUTCOME"
    | "DEPLOYMENT"
    | "INCIDENT";

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
    | "TOUCHES"
    // Release/feature-flag relationships
    | "INTRODUCED_BY"
    | "CONFIG_CHANGED_BY"
    | "GUARDS"
    | "IMPACTS"
    | "HAS_AI_WORKFLOW"
    | "GENERATES"
    | "HAS_REVIEW_OUTCOME"
    | "DEPLOYS"
    | "LINKED_INCIDENT";

export type WorkGraphProvenance = "NATIVE" | "EXPLICIT_TEXT" | "HEURISTIC";

export interface WorkGraphEdge {
    edgeId: string;
    sourceType: WorkGraphNodeType;
    sourceId: string;
    sourceDisplayName?: string | null;
    targetType: WorkGraphNodeType;
    targetId: string;
    targetDisplayName?: string | null;
    edgeType: WorkGraphEdgeType;
    provenance: WorkGraphProvenance;
    confidence: number;
    evidence: string;
    repoId?: string;
    provider?: string;
    theme?: string | null;
    subcategory?: string | null;
}

export interface WorkGraphEdgeFilterInput {
    repoIds?: string[];
    sourceType?: WorkGraphNodeType;
    targetType?: WorkGraphNodeType;
    edgeType?: WorkGraphEdgeType;
    /**
     * Plural edge-type filter (CHAOS-2442). When set, the backend returns only
     * edges whose type is in this list, applied BEFORE the edge LIMIT — so a
     * narrow slice (e.g. dependency edges) can't be starved by a capped page
     * dominated by other edge types. Keep the singular `edgeType` for callers
     * that only need one type.
     */
    edgeTypes?: WorkGraphEdgeType[];
    nodeId?: string;
    theme?: string;
    subcategory?: string;
    limit?: number;
}

export interface WorkGraphEdgesResult {
    edges: WorkGraphEdge[];
    totalCount: number;
    pageInfo: PageInfo;
    /**
     * Non-null when the result is a fail-safe degraded response. The value
     * `"MEMBERSHIP_NOT_MATERIALIZED"` means theme/subcategory membership data
     * has not yet been built for this org, so a theme filter would otherwise
     * silently return a false-empty graph (CHAOS-2431).
     */
    degradedReason?: string | null;
}

export interface WorkGraphEdgesQueryResponse {
    workGraphEdges: WorkGraphEdgesResult;
}

// ==== Work Graph aggregate queries (CHAOS-2442) ====
//
// Two true server-side aggregates so the Inflow/Outflow and Artifacts tabs no
// longer derive counts from a capped page of edges (which, for reference-heavy
// orgs, was dominated by `references` edges and produced degenerate results).

export interface WorkGraphFlowRow {
    nodeType: WorkGraphNodeType;
    inflow: number;
    outflow: number;
}

export interface WorkGraphFlowResult {
    rows: WorkGraphFlowRow[];
    /** Same fail-safe contract as WorkGraphEdgesResult (CHAOS-2431). */
    degradedReason?: string | null;
}

export interface WorkGraphFlowQueryResponse {
    workGraphFlow: WorkGraphFlowResult;
}

export interface WorkGraphArtifactRow {
    nodeType: WorkGraphNodeType;
    nodeId: string;
    displayName?: string | null;
    degree: number;
    evidence?: string | null;
}

export interface WorkGraphArtifactsResult {
    rows: WorkGraphArtifactRow[];
    /** Same fail-safe contract as WorkGraphEdgesResult (CHAOS-2431). */
    degradedReason?: string | null;
}

export interface WorkGraphArtifactsQueryResponse {
    workGraphArtifacts: WorkGraphArtifactsResult;
}

export type AIWorkflowRootTypeInput = "ISSUE" | "PR" | "WORK_UNIT";

export interface AIWorkflowGraphNode {
    nodeType: string;
    nodeId: string;
}

export interface AIWorkflowGraphEdge {
    edgeId: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    edgeType: string;
    confidence: number;
    source: string;
    evidence: string;
    provider?: string | null;
    repoId?: string | null;
}

export interface AIWorkflowDrilldownResult {
    orgId: string;
    rootType: string;
    rootId: string;
    nodes: AIWorkflowGraphNode[];
    edges: AIWorkflowGraphEdge[];
    partial: boolean;
    dataAvailable: boolean;
}

export interface AIWorkflowDrilldownQueryResponse {
    aiWorkflowDrilldown: AIWorkflowDrilldownResult;
}

// ==== Improve — Experiments Types (CHAOS-2219) ====

export type ExperimentStatus = "suggested" | "active" | "completed" | "abandoned";

/**
 * A process experiment derived from or promoted from an opportunity.
 *
 * v1: all experiments are derived (status="suggested") from
 * OpportunityCard.suggested_experiments at query-time; no persistence table
 * is used.  Fields for owned/tracked experiments (owner, stopCondition,
 * startDate, stopDate, outcome) are included in the schema for v2 promotion.
 *
 * Field names match the GraphQL camelCase response format.
 */
export interface Experiment {
    id: string;
    opportunityId: string;
    hypothesis: string;
    metric: string;
    owner: string;
    stopCondition: string;
    status: ExperimentStatus;
    startDate: string | null;
    stopDate: string | null;
    outcome: string | null;
}

export interface ExperimentsResult {
    items: Experiment[];
    /** True when experiments were derived from live opportunity data. */
    derivedFromOpportunities: boolean;
}

export interface ExperimentsQueryResponse {
    experiments: ExperimentsResult;
}
