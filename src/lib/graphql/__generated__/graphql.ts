/* eslint-disable */
import type { DocumentTypeDecoration } from "@graphql-typed-document-node/core";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
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
  /**
   * Dev Health GraphQL Schema — local SDL copy.
   *
   * This file is the canonical schema used by GraphQL Code Generator to produce
   * TypeScript types for the frontend.  It must be kept in sync with the backend
   * Strawberry schema in dev-health-ops.
   *
   * Sync procedure:
   *   1. Start the dev-health-ops API (or point to staging).
   *   2. Run: npx graphql-codegen introspect \
   *            --endpoint http://localhost:8000/graphql \
   *            --output src/lib/graphql/schema.graphql
   *   3. Commit the updated schema file together with any type changes.
   *
   * CI validation (npm run codegen:check) confirms that the generated types in
   * src/lib/graphql/__generated__/ are up-to-date with this schema file.
   */
  DateTime: { input: string; output: string; }
};

export type AnalyticsRequestInput = {
  breakdowns?: InputMaybe<Array<BreakdownRequestInput>>;
  filters?: InputMaybe<FilterInput>;
  sankey?: InputMaybe<SankeyRequestInput>;
  timeseries?: InputMaybe<Array<TimeseriesRequestInput>>;
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
  topN?: InputMaybe<Scalars['Int']['input']>;
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
  p50Date?: Maybe<Scalars['String']['output']>;
  p50Days?: Maybe<Scalars['Int']['output']>;
  p50Items?: Maybe<Scalars['Int']['output']>;
  p85Date?: Maybe<Scalars['String']['output']>;
  p85Days?: Maybe<Scalars['Int']['output']>;
  p85Items?: Maybe<Scalars['Int']['output']>;
  p95Date?: Maybe<Scalars['String']['output']>;
  p95Days?: Maybe<Scalars['Int']['output']>;
  p95Items?: Maybe<Scalars['Int']['output']>;
  targetDate?: Maybe<Scalars['String']['output']>;
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
  fromDate?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  teamId?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['String']['input']>;
  workScopeId?: InputMaybe<Scalars['String']['input']>;
};

export type CapacityForecastInput = {
  historyDays?: InputMaybe<Scalars['Int']['input']>;
  simulations?: InputMaybe<Scalars['Int']['input']>;
  targetDate?: InputMaybe<Scalars['String']['input']>;
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
  maxSankeyEdges?: Maybe<Scalars['Int']['output']>;
  maxSankeyNodes?: Maybe<Scalars['Int']['output']>;
  maxSubRequests?: Maybe<Scalars['Int']['output']>;
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

export type DateRangeInput = {
  endDate: Scalars['String']['input'];
  startDate: Scalars['String']['input'];
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

export type HowFilterInput = {
  flowStage?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type MeasureInput =
  | 'CHURN_LOC'
  | 'COUNT'
  | 'CYCLE_TIME_HOURS'
  | 'THROUGHPUT';

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type Query = {
  __typename?: 'Query';
  analytics: AnalyticsResult;
  capacityForecast?: Maybe<CapacityForecast>;
  capacityForecasts: CapacityForecastConnection;
  catalog: CatalogResult;
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
  maxEdges?: InputMaybe<Scalars['Int']['input']>;
  maxNodes?: InputMaybe<Scalars['Int']['input']>;
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
  ids?: InputMaybe<Array<Scalars['String']['input']>>;
  level?: InputMaybe<ScopeLevelInput>;
};

export type ScopeLevelInput =
  | 'DEVELOPER'
  | 'ORG'
  | 'REPO'
  | 'SERVICE'
  | 'TEAM';

export type TimeseriesBucket = {
  __typename?: 'TimeseriesBucket';
  date: Scalars['String']['output'];
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

export type WorkGraphEdge = {
  __typename?: 'WorkGraphEdge';
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

export type WorkGraphEdgeFilterInput = {
  edgeType?: InputMaybe<WorkGraphEdgeType>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  nodeId?: InputMaybe<Scalars['String']['input']>;
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  sourceType?: InputMaybe<WorkGraphNodeType>;
  targetType?: InputMaybe<WorkGraphNodeType>;
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

export type WorkGraphEdgesResult = {
  __typename?: 'WorkGraphEdgesResult';
  edges: Array<WorkGraphEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type WorkGraphNodeType =
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
