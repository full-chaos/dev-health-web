export type Maybe<T> = T | null | undefined;
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
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](https://ecma-international.org/wp-content/uploads/ECMA-404_2nd_edition_december_2017.pdf). */
  JSON: { input: Record<string, unknown>; output: Record<string, unknown>; }
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

export type CloneSavedReportInput = {
  newName?: InputMaybe<Scalars['String']['input']>;
  parameterOverrides?: InputMaybe<Scalars['JSON']['input']>;
  sourceReportId: Scalars['String']['input'];
};

export type Coverage = {
  __typename?: 'Coverage';
  issuesWithCycleStatesPct: Scalars['Float']['output'];
  prsLinkedToIssuesPct: Scalars['Float']['output'];
  reposCoveredPct: Scalars['Float']['output'];
};

export type CreateSavedReportInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  isTemplate?: Scalars['Boolean']['input'];
  name: Scalars['String']['input'];
  parameters?: InputMaybe<Scalars['JSON']['input']>;
  reportPlan?: InputMaybe<Scalars['JSON']['input']>;
  scheduleCron?: InputMaybe<Scalars['String']['input']>;
  scheduleTimezone?: Scalars['String']['input'];
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
  | 'COVERAGE_BRANCH_PCT'
  | 'COVERAGE_DELTA_PCT'
  | 'COVERAGE_LINE_PCT'
  | 'CYCLE_TIME_HOURS'
  | 'PIPELINE_DURATION_P95'
  | 'PIPELINE_FAILURE_RATE'
  | 'PIPELINE_QUEUE_TIME'
  | 'PIPELINE_RERUN_RATE'
  | 'PIPELINE_SUCCESS_RATE'
  | 'TEST_FAILURE_RATE'
  | 'TEST_FLAKE_RATE'
  | 'TEST_PASS_RATE'
  | 'TEST_SUITE_DURATION_P95'
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

export type Mutation = {
  __typename?: 'Mutation';
  /** Clone a saved report with optional overrides */
  cloneSavedReport?: Maybe<SavedReportType>;
  /** Create a new saved report */
  createSavedReport: SavedReportType;
  /** Delete a saved report */
  deleteSavedReport: Scalars['Boolean']['output'];
  /** Trigger a manual report execution */
  triggerReport?: Maybe<ReportRunType>;
  /** Update an existing saved report */
  updateSavedReport?: Maybe<SavedReportType>;
};


export type MutationCloneSavedReportArgs = {
  input: CloneSavedReportInput;
  orgId: Scalars['String']['input'];
};


export type MutationCreateSavedReportArgs = {
  input: CreateSavedReportInput;
  orgId: Scalars['String']['input'];
};


export type MutationDeleteSavedReportArgs = {
  orgId: Scalars['String']['input'];
  reportId: Scalars['String']['input'];
};


export type MutationTriggerReportArgs = {
  orgId: Scalars['String']['input'];
  reportId: Scalars['String']['input'];
};


export type MutationUpdateSavedReportArgs = {
  input: UpdateSavedReportInput;
  orgId: Scalars['String']['input'];
  reportId: Scalars['String']['input'];
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
  /** List report runs for a saved report */
  reportRuns: ReportRunConnection;
  /** Get a saved report by ID */
  savedReport?: Maybe<SavedReportType>;
  /** List saved reports for an organization */
  savedReports: SavedReportConnection;
  /** Paginated list of security alerts */
  securityAlerts: SecurityAlertConnection;
  /** Aggregated security posture for the dashboard */
  securityOverview: SecurityOverview;
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


export type QueryReportRunsArgs = {
  limit?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
  reportId: Scalars['String']['input'];
};


export type QuerySavedReportArgs = {
  orgId: Scalars['String']['input'];
  reportId: Scalars['String']['input'];
};


export type QuerySavedReportsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
};


export type QuerySecurityAlertsArgs = {
  filters?: InputMaybe<SecurityAlertFilterInput>;
  orgId: Scalars['String']['input'];
  pagination?: InputMaybe<SecurityPaginationInput>;
};


export type QuerySecurityOverviewArgs = {
  filters?: InputMaybe<SecurityAlertFilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryWorkGraphEdgesArgs = {
  filters?: InputMaybe<WorkGraphEdgeFilterInput>;
  orgId: Scalars['String']['input'];
};

export type RepoAlertCount = {
  __typename?: 'RepoAlertCount';
  count: Scalars['Int']['output'];
  repoId: Scalars['String']['output'];
  repoName: Scalars['String']['output'];
  repoUrl?: Maybe<Scalars['String']['output']>;
};

export type ReportRunConnection = {
  __typename?: 'ReportRunConnection';
  items: Array<ReportRunType>;
  total: Scalars['Int']['output'];
};

export type ReportRunType = {
  __typename?: 'ReportRunType';
  artifactUrl?: Maybe<Scalars['String']['output']>;
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  durationSeconds?: Maybe<Scalars['Float']['output']>;
  error?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  provenanceRecords?: Maybe<Scalars['JSON']['output']>;
  renderedMarkdown?: Maybe<Scalars['String']['output']>;
  reportId: Scalars['String']['output'];
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  status: Scalars['String']['output'];
  triggeredBy: Scalars['String']['output'];
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

export type SavedReportConnection = {
  __typename?: 'SavedReportConnection';
  items: Array<SavedReportType>;
  total: Scalars['Int']['output'];
};

export type SavedReportType = {
  __typename?: 'SavedReportType';
  createdAt: Scalars['DateTime']['output'];
  createdBy?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  isActive: Scalars['Boolean']['output'];
  isTemplate: Scalars['Boolean']['output'];
  lastRunAt?: Maybe<Scalars['DateTime']['output']>;
  lastRunStatus?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  orgId: Scalars['String']['output'];
  parameters?: Maybe<Scalars['JSON']['output']>;
  reportPlan: Scalars['JSON']['output'];
  scheduleId?: Maybe<Scalars['String']['output']>;
  templateSourceId?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
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

export type SecurityAlertConnection = {
  __typename?: 'SecurityAlertConnection';
  edges: Array<SecurityAlertEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type SecurityAlertEdge = {
  __typename?: 'SecurityAlertEdge';
  cursor: Scalars['String']['output'];
  node: SecurityAlertNode;
};

export type SecurityAlertFilterInput = {
  openOnly?: Scalars['Boolean']['input'];
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  search?: InputMaybe<Scalars['String']['input']>;
  severities?: InputMaybe<Array<SecuritySeverityInput>>;
  since?: InputMaybe<Scalars['Date']['input']>;
  sources?: InputMaybe<Array<SecuritySourceInput>>;
  states?: InputMaybe<Array<SecurityStateInput>>;
  until?: InputMaybe<Scalars['Date']['input']>;
};

export type SecurityAlertNode = {
  __typename?: 'SecurityAlertNode';
  alertId: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  cveId?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  dismissedAt?: Maybe<Scalars['DateTime']['output']>;
  fixedAt?: Maybe<Scalars['DateTime']['output']>;
  packageName?: Maybe<Scalars['String']['output']>;
  repoId: Scalars['String']['output'];
  repoName: Scalars['String']['output'];
  repoUrl?: Maybe<Scalars['String']['output']>;
  severity: Scalars['String']['output'];
  source: Scalars['String']['output'];
  state: Scalars['String']['output'];
  title?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type SecurityKpis = {
  __typename?: 'SecurityKpis';
  critical: Scalars['Int']['output'];
  high: Scalars['Int']['output'];
  meanDaysToFix30d?: Maybe<Scalars['Float']['output']>;
  openDelta30d: Scalars['Int']['output'];
  openTotal: Scalars['Int']['output'];
};

export type SecurityOverview = {
  __typename?: 'SecurityOverview';
  kpis: SecurityKpis;
  severityBreakdown: Array<SeverityBucket>;
  topRepos: Array<RepoAlertCount>;
  trend: Array<TrendPoint>;
};

export type SecurityPaginationInput = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: Scalars['Int']['input'];
};

export type SecuritySeverityInput =
  | 'CRITICAL'
  | 'HIGH'
  | 'LOW'
  | 'MEDIUM'
  | 'UNKNOWN';

export type SecuritySourceInput =
  | 'ADVISORY'
  | 'CODE_SCANNING'
  | 'DEPENDABOT'
  | 'GITLAB_DEPENDENCY'
  | 'GITLAB_VULNERABILITY';

export type SecurityStateInput =
  | 'CONFIRMED'
  | 'DETECTED'
  | 'DISMISSED'
  | 'FIXED'
  | 'OPEN'
  | 'RESOLVED';

export type SeverityBucket = {
  __typename?: 'SeverityBucket';
  count: Scalars['Int']['output'];
  severity: Scalars['String']['output'];
};

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

export type TrendPoint = {
  __typename?: 'TrendPoint';
  day: Scalars['Date']['output'];
  fixed: Scalars['Int']['output'];
  opened: Scalars['Int']['output'];
};

export type UpdateSavedReportInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  isTemplate?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  parameters?: InputMaybe<Scalars['JSON']['input']>;
  reportPlan?: InputMaybe<Scalars['JSON']['input']>;
  scheduleCron?: InputMaybe<Scalars['String']['input']>;
  scheduleTimezone?: InputMaybe<Scalars['String']['input']>;
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
  | 'CONFIG_CHANGED_BY'
  | 'CONTAINS'
  | 'DUPLICATES'
  | 'FIXES'
  | 'GUARDS'
  | 'IMPACTS'
  | 'IMPLEMENTS'
  | 'INTRODUCED_BY'
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
  | 'CONFIG_CHANGED_BY'
  | 'CONTAINS'
  | 'DUPLICATES'
  | 'FIXES'
  | 'GUARDS'
  | 'IMPACTS'
  | 'IMPLEMENTS'
  | 'INTRODUCED_BY'
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
  | 'FEATURE_FLAG'
  | 'FILE'
  | 'ISSUE'
  | 'PR'
  | 'RELEASE';

export type WorkGraphNodeTypeInput =
  | 'COMMIT'
  | 'FEATURE_FLAG'
  | 'FILE'
  | 'ISSUE'
  | 'PR'
  | 'RELEASE';

export type WorkGraphProvenance =
  | 'EXPLICIT_TEXT'
  | 'HEURISTIC'
  | 'NATIVE';
