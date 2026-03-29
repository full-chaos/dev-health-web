/* eslint-disable */
import type { DocumentTypeDecoration } from "@graphql-typed-document-node/core";
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** Date (isoformat) */
  Date: { input: string; output: string; }
  /** Date with time (isoformat) */
  DateTime: { input: string; output: string; }
};

export type AnalyticsRequestInput = {
  breakdowns?: Array<BreakdownRequestInput>;
  filters?: InputMaybe<FilterInput>;
  sankey?: InputMaybe<SankeyRequestInput>;
  timeseries?: Array<TimeseriesRequestInput>;
  useInvestment?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AnalyticsResult = {
  __typename?: 'AnalyticsResult';
  breakdowns: Array<BreakdownResult>;
  sankey?: Maybe<SankeyResult>;
  timeseries: Array<TimeseriesResult>;
};

export type BreakdownItem = {
  __typename?: 'BreakdownItem';
  key: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type BreakdownRequestInput = {
  dateRange: DateRangeInput;
  dimension: DimensionInput;
  measure: MeasureInput;
  topN?: Scalars['Int']['input'];
};

export type BreakdownResult = {
  __typename?: 'BreakdownResult';
  dimension: Scalars['String']['output'];
  items: Array<BreakdownItem>;
  measure: Scalars['String']['output'];
};

export type BucketIntervalInput =
  | 'DAY'
  | 'MONTH'
  | 'WEEK';

export type CapacityForecast = {
  __typename?: 'CapacityForecast';
  backlogSize: Scalars['Int']['output'];
  computedAt: Scalars['String']['output'];
  forecastId: Scalars['String']['output'];
  highVariance: Scalars['Boolean']['output'];
  historyDays: Scalars['Int']['output'];
  insufficientHistory: Scalars['Boolean']['output'];
  p50Date?: Maybe<Scalars['Date']['output']>;
  p50Days?: Maybe<Scalars['Int']['output']>;
  p50Items?: Maybe<Scalars['Int']['output']>;
  p85Date?: Maybe<Scalars['Date']['output']>;
  p85Days?: Maybe<Scalars['Int']['output']>;
  p85Items?: Maybe<Scalars['Int']['output']>;
  p95Date?: Maybe<Scalars['Date']['output']>;
  p95Days?: Maybe<Scalars['Int']['output']>;
  p95Items?: Maybe<Scalars['Int']['output']>;
  targetDate?: Maybe<Scalars['Date']['output']>;
  targetItems?: Maybe<Scalars['Int']['output']>;
  teamId?: Maybe<Scalars['String']['output']>;
  throughputMean: Scalars['Float']['output'];
  throughputStddev: Scalars['Float']['output'];
  workScopeId?: Maybe<Scalars['String']['output']>;
};

export type CapacityForecastConnection = {
  __typename?: 'CapacityForecastConnection';
  edges: Array<CapacityForecastEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type CapacityForecastEdge = {
  __typename?: 'CapacityForecastEdge';
  cursor: Scalars['String']['output'];
  node: CapacityForecast;
};

export type CapacityForecastFilterInput = {
  fromDate?: InputMaybe<Scalars['Date']['input']>;
  limit?: Scalars['Int']['input'];
  teamId?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['Date']['input']>;
  workScopeId?: InputMaybe<Scalars['String']['input']>;
};

export type CapacityForecastInput = {
  historyDays?: Scalars['Int']['input'];
  simulations?: Scalars['Int']['input'];
  targetDate?: InputMaybe<Scalars['Date']['input']>;
  targetItems?: InputMaybe<Scalars['Int']['input']>;
  teamId?: InputMaybe<Scalars['String']['input']>;
  workScopeId?: InputMaybe<Scalars['String']['input']>;
};

export type CatalogDimension = {
  __typename?: 'CatalogDimension';
  description: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type CatalogLimits = {
  __typename?: 'CatalogLimits';
  maxBuckets: Scalars['Int']['output'];
  maxDays: Scalars['Int']['output'];
  maxSankeyEdges: Scalars['Int']['output'];
  maxSankeyNodes: Scalars['Int']['output'];
  maxSubRequests: Scalars['Int']['output'];
  maxTopN: Scalars['Int']['output'];
};

export type CatalogMeasure = {
  __typename?: 'CatalogMeasure';
  description: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type CatalogResult = {
  __typename?: 'CatalogResult';
  dimensions: Array<CatalogDimension>;
  limits: CatalogLimits;
  measures: Array<CatalogMeasure>;
  values?: Maybe<Array<CatalogValueItem>>;
};

export type CatalogValueItem = {
  __typename?: 'CatalogValueItem';
  count: Scalars['Int']['output'];
  value: Scalars['String']['output'];
};

export type Coverage = {
  __typename?: 'Coverage';
  issuesWithCycleStatesPct: Scalars['Float']['output'];
  prsLinkedToIssuesPct: Scalars['Float']['output'];
  reposCoveredPct: Scalars['Float']['output'];
};

export type DateRangeInput = {
  endDate: Scalars['Date']['input'];
  startDate: Scalars['Date']['input'];
};

export type DimensionInput =
  | 'AUTHOR'
  | 'REPO'
  | 'SUBCATEGORY'
  | 'TEAM'
  | 'THEME'
  | 'WORK_TYPE';

export type FilterInput = {
  how?: InputMaybe<HowFilterInput>;
  scope?: InputMaybe<ScopeFilterInput>;
  what?: InputMaybe<WhatFilterInput>;
  who?: InputMaybe<WhoFilterInput>;
  why?: InputMaybe<WhyFilterInput>;
};

export type Freshness = {
  __typename?: 'Freshness';
  coverage?: Maybe<Coverage>;
  lastIngestedAt?: Maybe<Scalars['String']['output']>;
};

export type HomeResult = {
  __typename?: 'HomeResult';
  deltas: Array<MetricDelta>;
  freshness: Freshness;
};

export type HowFilterInput = {
  flowStage?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type MeasureInput =
  | 'CHURN_LOC'
  | 'COUNT'
  | 'CYCLE_TIME_HOURS'
  | 'THROUGHPUT';

export type MetricDelta = {
  __typename?: 'MetricDelta';
  deltaPct: Scalars['Float']['output'];
  label: Scalars['String']['output'];
  metric: Scalars['String']['output'];
  spark: Array<SparkPoint>;
  unit: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type MetricsUpdate = {
  __typename?: 'MetricsUpdate';
  day: Scalars['String']['output'];
  message: Scalars['String']['output'];
  orgId: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type Query = {
  __typename?: 'Query';
  /** Run batch analytics queries */
  analytics: AnalyticsResult;
  /** Compute capacity forecast on-demand */
  capacityForecast?: Maybe<CapacityForecast>;
  /** List persisted capacity forecasts */
  capacityForecasts: CapacityForecastConnection;
  /** Get catalog of available dimensions, measures, and limits */
  catalog: CatalogResult;
  /** Get home dashboard metrics */
  home: HomeResult;
  /** Query work graph edges with optional filters */
  workGraphEdges: WorkGraphEdgesResult;
};


export type QueryAnalyticsArgs = {
  batch: AnalyticsRequestInput;
  orgId: Scalars['String']['input'];
};


export type QueryCapacityForecastArgs = {
  input?: InputMaybe<CapacityForecastInput>;
  orgId: Scalars['String']['input'];
};


export type QueryCapacityForecastsArgs = {
  filters?: InputMaybe<CapacityForecastFilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryCatalogArgs = {
  dimension?: InputMaybe<DimensionInput>;
  filters?: InputMaybe<FilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryHomeArgs = {
  filters?: InputMaybe<FilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryWorkGraphEdgesArgs = {
  filters?: InputMaybe<WorkGraphEdgeFilterInput>;
  orgId: Scalars['String']['input'];
};

export type SankeyCoverage = {
  __typename?: 'SankeyCoverage';
  repoCoverage: Scalars['Float']['output'];
  teamCoverage: Scalars['Float']['output'];
};

export type SankeyEdge = {
  __typename?: 'SankeyEdge';
  source: Scalars['String']['output'];
  target: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type SankeyNode = {
  __typename?: 'SankeyNode';
  dimension: Scalars['String']['output'];
  id: Scalars['String']['output'];
  label: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type SankeyRequestInput = {
  dateRange: DateRangeInput;
  maxEdges?: Scalars['Int']['input'];
  maxNodes?: Scalars['Int']['input'];
  measure: MeasureInput;
  path: Array<DimensionInput>;
  useInvestment?: InputMaybe<Scalars['Boolean']['input']>;
};

export type SankeyResult = {
  __typename?: 'SankeyResult';
  coverage?: Maybe<SankeyCoverage>;
  edges: Array<SankeyEdge>;
  nodes: Array<SankeyNode>;
};

export type ScopeFilterInput = {
  ids?: Array<Scalars['String']['input']>;
  level?: ScopeLevelInput;
};

export type ScopeLevelInput =
  | 'DEVELOPER'
  | 'ORG'
  | 'REPO'
  | 'SERVICE'
  | 'TEAM';

export type SparkPoint = {
  __typename?: 'SparkPoint';
  ts: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type Subscription = {
  __typename?: 'Subscription';
  /** Subscribe to metrics updates for an organization */
  metricsUpdated: MetricsUpdate;
  /** Subscribe to data sync progress */
  syncProgress: SyncProgress;
  /** Subscribe to task status updates */
  taskStatus: TaskStatus;
};


export type SubscriptionMetricsUpdatedArgs = {
  orgId: Scalars['String']['input'];
};


export type SubscriptionSyncProgressArgs = {
  orgId: Scalars['String']['input'];
};


export type SubscriptionTaskStatusArgs = {
  taskId: Scalars['String']['input'];
};

export type SyncProgress = {
  __typename?: 'SyncProgress';
  itemsProcessed: Scalars['Int']['output'];
  itemsTotal: Scalars['Int']['output'];
  message?: Maybe<Scalars['String']['output']>;
  orgId: Scalars['String']['output'];
  provider: Scalars['String']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type TaskStatus = {
  __typename?: 'TaskStatus';
  message?: Maybe<Scalars['String']['output']>;
  progress: Scalars['Float']['output'];
  result?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  taskId: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type TimeseriesBucket = {
  __typename?: 'TimeseriesBucket';
  date: Scalars['Date']['output'];
  value: Scalars['Float']['output'];
};

export type TimeseriesRequestInput = {
  dateRange: DateRangeInput;
  dimension: DimensionInput;
  interval: BucketIntervalInput;
  measure: MeasureInput;
};

export type TimeseriesResult = {
  __typename?: 'TimeseriesResult';
  buckets: Array<TimeseriesBucket>;
  dimension: Scalars['String']['output'];
  dimensionValue: Scalars['String']['output'];
  measure: Scalars['String']['output'];
};

export type WhatFilterInput = {
  repos?: InputMaybe<Array<Scalars['String']['input']>>;
  services?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type WhoFilterInput = {
  developers?: InputMaybe<Array<Scalars['String']['input']>>;
  roles?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type WhyFilterInput = {
  issueType?: InputMaybe<Array<Scalars['String']['input']>>;
  workCategory?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type WorkGraphEdgeFilterInput = {
  edgeType?: InputMaybe<WorkGraphEdgeTypeInput>;
  limit?: Scalars['Int']['input'];
  nodeId?: InputMaybe<Scalars['String']['input']>;
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  sourceType?: InputMaybe<WorkGraphNodeTypeInput>;
  targetType?: InputMaybe<WorkGraphNodeTypeInput>;
};

export type WorkGraphEdgeResult = {
  __typename?: 'WorkGraphEdgeResult';
  confidence: Scalars['Float']['output'];
  edgeId: Scalars['String']['output'];
  edgeType: WorkGraphEdgeType;
  evidence: Scalars['String']['output'];
  provenance: WorkGraphProvenance;
  provider?: Maybe<Scalars['String']['output']>;
  repoId?: Maybe<Scalars['String']['output']>;
  sourceId: Scalars['String']['output'];
  sourceType: WorkGraphNodeType;
  targetId: Scalars['String']['output'];
  targetType: WorkGraphNodeType;
};

export type WorkGraphEdgeType =
  | 'BLOCKS'
  | 'CHILD_OF'
  | 'CONTAINS'
  | 'DUPLICATES'
  | 'FIXES'
  | 'IMPLEMENTS'
  | 'IS_BLOCKED_BY'
  | 'IS_DUPLICATE_OF'
  | 'IS_RELATED_TO'
  | 'PARENT_OF'
  | 'REFERENCES'
  | 'RELATES'
  | 'TOUCHES';

export type WorkGraphEdgeTypeInput =
  | 'BLOCKS'
  | 'CHILD_OF'
  | 'CONTAINS'
  | 'DUPLICATES'
  | 'FIXES'
  | 'IMPLEMENTS'
  | 'IS_BLOCKED_BY'
  | 'IS_DUPLICATE_OF'
  | 'IS_RELATED_TO'
  | 'PARENT_OF'
  | 'REFERENCES'
  | 'RELATES'
  | 'TOUCHES';

export type WorkGraphEdgesResult = {
  __typename?: 'WorkGraphEdgesResult';
  edges: Array<WorkGraphEdgeResult>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type WorkGraphNodeType =
  | 'COMMIT'
  | 'FILE'
  | 'ISSUE'
  | 'PR';

export type WorkGraphNodeTypeInput =
  | 'COMMIT'
  | 'FILE'
  | 'ISSUE'
  | 'PR';

export type WorkGraphProvenance =
  | 'EXPLICIT_TEXT'
  | 'HEURISTIC'
  | 'NATIVE';

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
