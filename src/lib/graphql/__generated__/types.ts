export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
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

export type AiAttributionBucketInput =
  | 'AGENT_CREATED'
  | 'AI_ASSISTED'
  | 'AI_REVIEW'
  | 'HUMAN'
  | 'UNKNOWN';

export type AiComparison = {
  __typename?: 'AIComparison';
  aiSide: AiComparisonSide;
  baselineSide: AiComparisonSide;
  dataAvailable: Scalars['Boolean']['output'];
  delta: AiComparisonDelta;
  endDate: Scalars['Date']['output'];
  orgId: Scalars['String']['output'];
  startDate: Scalars['Date']['output'];
};

export type AiComparisonDelta = {
  __typename?: 'AIComparisonDelta';
  cycleTimeDeltaHours?: Maybe<Scalars['Float']['output']>;
  incidentRateDelta?: Maybe<Scalars['Float']['output']>;
  revertRateDelta?: Maybe<Scalars['Float']['output']>;
  reviewsPerPrDelta?: Maybe<Scalars['Float']['output']>;
  reworkRateDelta?: Maybe<Scalars['Float']['output']>;
  testGapRateDelta?: Maybe<Scalars['Float']['output']>;
};

export type AiComparisonSide = {
  __typename?: 'AIComparisonSide';
  bucket: Scalars['String']['output'];
  cycleTimeAvgHours?: Maybe<Scalars['Float']['output']>;
  incidentRate?: Maybe<Scalars['Float']['output']>;
  prsMerged: Scalars['Int']['output'];
  prsTotal: Scalars['Int']['output'];
  revertRate?: Maybe<Scalars['Float']['output']>;
  reviewsPerPr?: Maybe<Scalars['Float']['output']>;
  reworkRate?: Maybe<Scalars['Float']['output']>;
  testGapRate?: Maybe<Scalars['Float']['output']>;
};

export type AiDateRangeInput = {
  endDate: Scalars['Date']['input'];
  startDate: Scalars['Date']['input'];
};

export type AiGovernanceCoverageRow = {
  __typename?: 'AIGovernanceCoverageRow';
  aiArtifacts: Scalars['Int']['output'];
  day: Scalars['Date']['output'];
  declarationCoverage: Scalars['Float']['output'];
  declaredArtifacts: Scalars['Int']['output'];
  humanReviewCoverage: Scalars['Float']['output'];
  humanReviewedPrs: Scalars['Int']['output'];
  inPolicyArtifacts: Scalars['Int']['output'];
  inPolicyCoverage: Scalars['Float']['output'];
  repoId?: Maybe<Scalars['String']['output']>;
  securityScanCoverage: Scalars['Float']['output'];
  securityScannedPrs: Scalars['Int']['output'];
  teamId?: Maybe<Scalars['String']['output']>;
};

export type AiGovernanceSummary = {
  __typename?: 'AIGovernanceSummary';
  coverage: Array<AiGovernanceCoverageRow>;
  dataAvailable: Scalars['Boolean']['output'];
  endDate: Scalars['Date']['output'];
  orgId: Scalars['String']['output'];
  recentViolations: Array<AiGovernanceViolationRow>;
  startDate: Scalars['Date']['output'];
};

export type AiGovernanceViolationRow = {
  __typename?: 'AIGovernanceViolationRow';
  evidence: Scalars['String']['output'];
  observedAt: Scalars['DateTime']['output'];
  repoId?: Maybe<Scalars['String']['output']>;
  ruleId: Scalars['String']['output'];
  severity: Scalars['String']['output'];
  subjectId: Scalars['String']['output'];
  subjectType: Scalars['String']['output'];
  teamId?: Maybe<Scalars['String']['output']>;
};

export type AiImpactBucketRow = {
  __typename?: 'AIImpactBucketRow';
  bucket: Scalars['String']['output'];
  changesRequestedPerPr?: Maybe<Scalars['Float']['output']>;
  cycleTimeAvgHours?: Maybe<Scalars['Float']['output']>;
  incidentRate?: Maybe<Scalars['Float']['output']>;
  incidentsCount: Scalars['Int']['output'];
  prsMerged: Scalars['Int']['output'];
  prsTotal: Scalars['Int']['output'];
  revertPrs: Scalars['Int']['output'];
  revertRate?: Maybe<Scalars['Float']['output']>;
  reviewsPerPr?: Maybe<Scalars['Float']['output']>;
  reworkPrs: Scalars['Int']['output'];
  reworkRate?: Maybe<Scalars['Float']['output']>;
  testGapPrs: Scalars['Int']['output'];
  testGapRate?: Maybe<Scalars['Float']['output']>;
};

export type AiImpactBucketTotals = {
  __typename?: 'AIImpactBucketTotals';
  agentCreatedPrCount: Scalars['Int']['output'];
  aiAssistedPrRatio?: Maybe<Scalars['Float']['output']>;
  aiCycleTimeDeltaHours?: Maybe<Scalars['Float']['output']>;
  aiReviewAmplification?: Maybe<Scalars['Float']['output']>;
  bucket: Scalars['String']['output'];
  cycleTimeAvgHours?: Maybe<Scalars['Float']['output']>;
  incidentDragRate?: Maybe<Scalars['Float']['output']>;
  leverage: AiLeverageComponents;
  prsMerged: Scalars['Int']['output'];
  prsTotal: Scalars['Int']['output'];
  revertRate?: Maybe<Scalars['Float']['output']>;
  reworkDragRate?: Maybe<Scalars['Float']['output']>;
  testGapRate?: Maybe<Scalars['Float']['output']>;
};

export type AiImpactSummary = {
  __typename?: 'AIImpactSummary';
  agentCreatedPrs: Scalars['Int']['output'];
  aiAssistedPrRatio?: Maybe<Scalars['Float']['output']>;
  aiAssistedPrs: Scalars['Int']['output'];
  byBucket: Array<AiImpactBucketTotals>;
  computedAt?: Maybe<Scalars['DateTime']['output']>;
  daily: Array<AiImpactBucketRow>;
  dataAvailable: Scalars['Boolean']['output'];
  endDate: Scalars['Date']['output'];
  humanPrs: Scalars['Int']['output'];
  missingStates: Array<AiMissingState>;
  orgId: Scalars['String']['output'];
  startDate: Scalars['Date']['output'];
  totalPrs: Scalars['Int']['output'];
  unknownPrs: Scalars['Int']['output'];
};

export type AiLeverageComponents = {
  __typename?: 'AILeverageComponents';
  cycleTimeComponent?: Maybe<Scalars['Float']['output']>;
  incidentComponent?: Maybe<Scalars['Float']['output']>;
  prsComponent: Scalars['Float']['output'];
  reviewComponent?: Maybe<Scalars['Float']['output']>;
  reworkComponent?: Maybe<Scalars['Float']['output']>;
  testComponent?: Maybe<Scalars['Float']['output']>;
};

export type AiMissingState = {
  __typename?: 'AIMissingState';
  guidance: Scalars['String']['output'];
  key: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

export type AiOpportunitiesResult = {
  __typename?: 'AIOpportunitiesResult';
  detectorReady: Scalars['Boolean']['output'];
  orgId: Scalars['String']['output'];
  recommendations: Array<AiOpportunity>;
};

export type AiOpportunity = {
  __typename?: 'AIOpportunity';
  evidenceRefs: Array<Scalars['String']['output']>;
  kind: AiOpportunityKind;
  opportunityId: Scalars['String']['output'];
  rationale: Scalars['String']['output'];
  repoId?: Maybe<Scalars['String']['output']>;
  score: Scalars['Float']['output'];
  teamId?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  workGraphDrilldowns: Array<AiWorkGraphDrilldownRef>;
};

export type AiOpportunityKind =
  | 'HIGH_REVIEW_LOAD'
  | 'HIGH_REWORK'
  | 'REPETITIVE_CHANGE'
  | 'SLOW_CYCLE'
  | 'UNCOVERED_TEST_AREA';

export type AiReviewLoadResult = {
  __typename?: 'AIReviewLoadResult';
  byBucket: Array<AiReviewLoadRow>;
  daily: Array<AiReviewLoadRow>;
  dataAvailable: Scalars['Boolean']['output'];
  endDate: Scalars['Date']['output'];
  missingStates: Array<AiMissingState>;
  orgId: Scalars['String']['output'];
  reviewerConcentration: AiReviewerConcentrationSummary;
  startDate: Scalars['Date']['output'];
};

export type AiReviewLoadRow = {
  __typename?: 'AIReviewLoadRow';
  bucket: Scalars['String']['output'];
  changesRequestedPerPr?: Maybe<Scalars['Float']['output']>;
  postFirstReviewPushesCount: Scalars['Int']['output'];
  postFirstReviewPushesPerPr?: Maybe<Scalars['Float']['output']>;
  prsTotal: Scalars['Int']['output'];
  reviewAmplification?: Maybe<Scalars['Float']['output']>;
  reviewsPerPr?: Maybe<Scalars['Float']['output']>;
  reviewsTotal: Scalars['Int']['output'];
};

export type AiReviewerConcentrationSummary = {
  __typename?: 'AIReviewerConcentrationSummary';
  dataAvailable: Scalars['Boolean']['output'];
  reviewerCount: Scalars['Int']['output'];
  reviewerGini?: Maybe<Scalars['Float']['output']>;
};

export type AiRiskBreakdownResult = {
  __typename?: 'AIRiskBreakdownResult';
  byBucket: Array<AiRiskBreakdownRow>;
  dataAvailable: Scalars['Boolean']['output'];
  endDate: Scalars['Date']['output'];
  missingStates: Array<AiMissingState>;
  orgId: Scalars['String']['output'];
  startDate: Scalars['Date']['output'];
};

export type AiRiskBreakdownRow = {
  __typename?: 'AIRiskBreakdownRow';
  bucket: Scalars['String']['output'];
  incidentRate?: Maybe<Scalars['Float']['output']>;
  incidentsCount: Scalars['Int']['output'];
  prsTotal: Scalars['Int']['output'];
  revertPrs: Scalars['Int']['output'];
  revertRate?: Maybe<Scalars['Float']['output']>;
  reworkPrs: Scalars['Int']['output'];
  reworkRate?: Maybe<Scalars['Float']['output']>;
  testGapPrs: Scalars['Int']['output'];
  testGapRate?: Maybe<Scalars['Float']['output']>;
};

export type AiScopeInput = {
  buckets?: InputMaybe<Array<AiAttributionBucketInput>>;
  repoId?: InputMaybe<Scalars['String']['input']>;
  teamId?: InputMaybe<Scalars['String']['input']>;
  workType?: InputMaybe<Scalars['String']['input']>;
};

export type AiWorkGraphDrilldownRef = {
  __typename?: 'AIWorkGraphDrilldownRef';
  label: Scalars['String']['output'];
  rootId: Scalars['String']['output'];
  rootType: Scalars['String']['output'];
};

export type AiWorkflowDrilldownResult = {
  __typename?: 'AIWorkflowDrilldownResult';
  dataAvailable: Scalars['Boolean']['output'];
  edges: Array<AiWorkflowGraphEdgeOut>;
  nodes: Array<AiWorkflowGraphNodeOut>;
  orgId: Scalars['String']['output'];
  partial: Scalars['Boolean']['output'];
  rootId: Scalars['String']['output'];
  rootType: Scalars['String']['output'];
};

export type AiWorkflowGraphEdgeOut = {
  __typename?: 'AIWorkflowGraphEdgeOut';
  confidence: Scalars['Float']['output'];
  edgeId: Scalars['String']['output'];
  edgeType: Scalars['String']['output'];
  evidence: Scalars['String']['output'];
  provider?: Maybe<Scalars['String']['output']>;
  repoId?: Maybe<Scalars['String']['output']>;
  source: Scalars['String']['output'];
  sourceId: Scalars['String']['output'];
  sourceType: Scalars['String']['output'];
  targetId: Scalars['String']['output'];
  targetType: Scalars['String']['output'];
};

export type AiWorkflowGraphNodeOut = {
  __typename?: 'AIWorkflowGraphNodeOut';
  nodeId: Scalars['String']['output'];
  nodeType: Scalars['String']['output'];
};

export type AiWorkflowRootTypeInput =
  | 'ISSUE'
  | 'PR'
  | 'WORK_UNIT';

export type AiAttributedPr = {
  __typename?: 'AiAttributedPr';
  kind?: Maybe<Scalars['String']['output']>;
  mergedAt?: Maybe<Scalars['DateTime']['output']>;
  number: Scalars['Int']['output'];
  repoId: Scalars['ID']['output'];
  teamId?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  workType?: Maybe<Scalars['String']['output']>;
};

export type AiAttributedPrsResult = {
  __typename?: 'AiAttributedPrsResult';
  dataAvailable: Scalars['Boolean']['output'];
  endDate: Scalars['Date']['output'];
  hasMore: Scalars['Boolean']['output'];
  orgId: Scalars['String']['output'];
  rows: Array<AiAttributedPr>;
  startDate: Scalars['Date']['output'];
  total: Scalars['Int']['output'];
};

export type AliasSuggestion = {
  __typename?: 'AliasSuggestion';
  confidence: Scalars['Float']['output'];
  suggestedCanonicalId: Scalars['String']['output'];
  unmappedIdentity: UnmappedIdentity;
};

export type AnalyticsRequestInput = {
  breakdowns?: Array<BreakdownRequestInput>;
  filters?: InputMaybe<FilterInput>;
  flowMatrix?: InputMaybe<FlowMatrixRequestInput>;
  sankey?: InputMaybe<SankeyRequestInput>;
  timeseries?: Array<TimeseriesRequestInput>;
  useInvestment?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AnalyticsResult = {
  __typename?: 'AnalyticsResult';
  breakdowns: Array<BreakdownResult>;
  flowMatrix?: Maybe<FlowMatrixResult>;
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

export type BusFactor = {
  __typename?: 'BusFactor';
  evidenceSampleCount: Scalars['Int']['output'];
  orgId: Scalars['String']['output'];
  repos: Array<RepoBusFactor>;
  scope: BusFactorScope;
  topMaintainers: Array<MaintainerShare>;
  value: Scalars['Int']['output'];
};

export type BusFactorScope = {
  __typename?: 'BusFactorScope';
  repoId?: Maybe<Scalars['String']['output']>;
  teamId?: Maybe<Scalars['String']['output']>;
};

export type BusFactorScopeInput = {
  repoId?: InputMaybe<Scalars['String']['input']>;
  teamId?: InputMaybe<Scalars['String']['input']>;
};

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

export type ComplexityPoint = {
  __typename?: 'ComplexityPoint';
  cyclomaticAvg?: Maybe<Scalars['Float']['output']>;
  cyclomaticPerKloc?: Maybe<Scalars['Float']['output']>;
  cyclomaticTotal?: Maybe<Scalars['Int']['output']>;
  date: Scalars['Date']['output'];
  highComplexityFunctions?: Maybe<Scalars['Int']['output']>;
  locTotal?: Maybe<Scalars['Int']['output']>;
  scopeId: Scalars['String']['output'];
  scopeName: Scalars['String']['output'];
  veryHighComplexityFunctions?: Maybe<Scalars['Int']['output']>;
};

export type ComplexityScope =
  | 'FILE'
  | 'REPO';

export type ComplexityTimeseriesInput = {
  granularity: TimeGranularity;
  limit?: InputMaybe<Scalars['Int']['input']>;
  orgId: Scalars['String']['input'];
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  scope: ComplexityScope;
  sinceUtc: Scalars['DateTime']['input'];
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
  untilUtc: Scalars['DateTime']['input'];
};

export type ComplexityTimeseriesResult = {
  __typename?: 'ComplexityTimeseriesResult';
  points: Array<ComplexityPoint>;
  totalScope: Scalars['Int']['output'];
};

export type CompoundingRiskComponents = {
  __typename?: 'CompoundingRiskComponents';
  busFactor?: Maybe<Scalars['Float']['output']>;
  churnNorm?: Maybe<Scalars['Float']['output']>;
  complexityDelta?: Maybe<Scalars['Float']['output']>;
  complexityNorm?: Maybe<Scalars['Float']['output']>;
  ownershipGini?: Maybe<Scalars['Float']['output']>;
  ownershipNorm?: Maybe<Scalars['Float']['output']>;
  reviewLatencyP90h?: Maybe<Scalars['Float']['output']>;
  reviewNorm?: Maybe<Scalars['Float']['output']>;
  reworkChurn?: Maybe<Scalars['Float']['output']>;
  singleOwnerRatio?: Maybe<Scalars['Float']['output']>;
};

export type CompoundingRiskFilterInput = {
  breakout?: CompoundingRiskScope;
  day?: InputMaybe<Scalars['Date']['input']>;
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
  trendDays?: Scalars['Int']['input'];
};

export type CompoundingRiskPoint = {
  __typename?: 'CompoundingRiskPoint';
  components: CompoundingRiskComponents;
  computedAt: Scalars['DateTime']['output'];
  day: Scalars['Date']['output'];
  scope: CompoundingRiskScope;
  scopeId: Scalars['String']['output'];
  scopeLabel: Scalars['String']['output'];
  score?: Maybe<Scalars['Float']['output']>;
  severity: CompoundingRiskSeverity;
  thresholds: CompoundingRiskThresholds;
  weights: CompoundingRiskWeights;
};

export type CompoundingRiskResult = {
  __typename?: 'CompoundingRiskResult';
  breakout: CompoundingRiskScope;
  generatedAt: Scalars['DateTime']['output'];
  orgId: Scalars['String']['output'];
  rows: Array<CompoundingRiskPoint>;
  trend: Array<CompoundingRiskTrendPoint>;
};

export type CompoundingRiskScope =
  | 'REPO'
  | 'TEAM';

export type CompoundingRiskSeverity =
  | 'ELEVATED'
  | 'HIGH'
  | 'LOW'
  | 'UNKNOWN';

export type CompoundingRiskThresholds = {
  __typename?: 'CompoundingRiskThresholds';
  elevated: Scalars['Float']['output'];
  high: Scalars['Float']['output'];
};

export type CompoundingRiskTrendPoint = {
  __typename?: 'CompoundingRiskTrendPoint';
  day: Scalars['Date']['output'];
  score?: Maybe<Scalars['Float']['output']>;
  severity: CompoundingRiskSeverity;
};

export type CompoundingRiskWeights = {
  __typename?: 'CompoundingRiskWeights';
  churn: Scalars['Float']['output'];
  complexity: Scalars['Float']['output'];
  ownership: Scalars['Float']['output'];
  review: Scalars['Float']['output'];
};

export type ConnectorFailure = {
  __typename?: 'ConnectorFailure';
  message: Scalars['String']['output'];
  occurredAt: Scalars['DateTime']['output'];
  stage?: Maybe<Scalars['String']['output']>;
};

export type ConnectorStatus = {
  __typename?: 'ConnectorStatus';
  lastFailure?: Maybe<ConnectorFailure>;
  lastSyncAt?: Maybe<Scalars['DateTime']['output']>;
  provider: Scalars['String']['output'];
  rowsIngested: Scalars['Int']['output'];
  scope: Scalars['String']['output'];
};

export type Coverage = {
  __typename?: 'Coverage';
  issuesWithCycleStatesPct: Scalars['Float']['output'];
  prsLinkedToIssuesPct: Scalars['Float']['output'];
  reposCoveredPct: Scalars['Float']['output'];
};

export type CoverageStat = {
  __typename?: 'CoverageStat';
  coveragePct: Scalars['Float']['output'];
  coveredRepos: Scalars['Int']['output'];
  missing: Array<MissingMapping>;
  totalRepos: Scalars['Int']['output'];
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

export type DataHealth = {
  __typename?: 'DataHealth';
  connectors: Array<ConnectorStatus>;
  identityMapping: IdentityMappingHealth;
  mappingCoverage: MappingCoverage;
  metricLineage?: Maybe<MetricLineage>;
};


export type DataHealthMetricLineageArgs = {
  metricId: Scalars['ID']['input'];
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

export type EvidenceRef = {
  __typename?: 'EvidenceRef';
  field: Scalars['String']['output'];
  metricTable: Scalars['String']['output'];
  teamId: Scalars['String']['output'];
  value: Scalars['Float']['output'];
  windowEnd: Scalars['Date']['output'];
  windowStart: Scalars['Date']['output'];
};

export type FilterInput = {
  how?: InputMaybe<HowFilterInput>;
  scope?: InputMaybe<ScopeFilterInput>;
  what?: InputMaybe<WhatFilterInput>;
  who?: InputMaybe<WhoFilterInput>;
  why?: InputMaybe<WhyFilterInput>;
};

export type FlowMatrixRequestInput = {
  dateRange: DateRangeInput;
  dimension: DimensionInput;
  maxEdges?: Scalars['Int']['input'];
  maxNodes?: Scalars['Int']['input'];
  measure: MeasureInput;
  useInvestment?: InputMaybe<Scalars['Boolean']['input']>;
};

export type FlowMatrixResult = {
  __typename?: 'FlowMatrixResult';
  edges: Array<SankeyEdge>;
  nodes: Array<SankeyNode>;
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

export type HotspotRow = {
  __typename?: 'HotspotRow';
  blameConcentration?: Maybe<Scalars['Float']['output']>;
  churnCommits30d: Scalars['Int']['output'];
  churnLoc30d: Scalars['Int']['output'];
  cyclomaticAvg: Scalars['Float']['output'];
  cyclomaticTotal: Scalars['Int']['output'];
  evidenceUrl?: Maybe<Scalars['String']['output']>;
  filePath: Scalars['String']['output'];
  repoId: Scalars['String']['output'];
  repoName: Scalars['String']['output'];
  riskScore: Scalars['Float']['output'];
};

export type HotspotsInput = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  orgId: Scalars['String']['input'];
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  sinceUtc: Scalars['DateTime']['input'];
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
  untilUtc: Scalars['DateTime']['input'];
};

export type HotspotsResult = {
  __typename?: 'HotspotsResult';
  rows: Array<HotspotRow>;
};

export type HowFilterInput = {
  flowStage?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type IdentityMappingHealth = {
  __typename?: 'IdentityMappingHealth';
  suggestedAliases: Array<AliasSuggestion>;
  unmappedCount: Scalars['Int']['output'];
  unmappedIdentities: Array<UnmappedIdentity>;
};

export type MaintainerShare = {
  __typename?: 'MaintainerShare';
  author: Scalars['String']['output'];
  sharePercent: Scalars['Float']['output'];
};

export type MappingCoverage = {
  __typename?: 'MappingCoverage';
  deployments: CoverageStat;
  workItems: CoverageStat;
};

export type MeasureInput =
  | 'CHURN_LOC'
  | 'COUNT'
  | 'COVERAGE_BRANCH_PCT'
  | 'COVERAGE_DELTA_PCT'
  | 'COVERAGE_LINE_PCT'
  | 'CYCLE_TIME_HOURS'
  | 'FLAG_ACTIVATION_RATE'
  | 'FLAG_COVERAGE_RATIO'
  | 'FLAG_ERROR_RATE_DELTA'
  | 'FLAG_FRICTION_DELTA'
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

export type MetricLineage = {
  __typename?: 'MetricLineage';
  computeWindow: WindowSpec;
  computedAt: Scalars['DateTime']['output'];
  metricId: Scalars['ID']['output'];
  rowCount?: Maybe<Scalars['Int']['output']>;
  sourceTables: Array<Scalars['String']['output']>;
};

export type MetricsUpdate = {
  __typename?: 'MetricsUpdate';
  day: Scalars['String']['output'];
  message: Scalars['String']['output'];
  orgId: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type MissingMapping = {
  __typename?: 'MissingMapping';
  reason: Scalars['String']['output'];
  repoName: Scalars['String']['output'];
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

export type OperatingReview = {
  __typename?: 'OperatingReview';
  orgId: Scalars['String']['output'];
  priorWeekStart: Scalars['Date']['output'];
  recommendations: Array<Scalars['String']['output']>;
  recommendationsEmptyState: Scalars['String']['output'];
  sections: Array<OperatingReviewSection>;
  teamId?: Maybe<Scalars['String']['output']>;
  weekStart: Scalars['Date']['output'];
};

export type OperatingReviewDelta = {
  __typename?: 'OperatingReviewDelta';
  absolute: Scalars['Float']['output'];
  percent?: Maybe<Scalars['Float']['output']>;
  priorValue: Scalars['Float']['output'];
  status: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type OperatingReviewInput = {
  teamId?: InputMaybe<Scalars['String']['input']>;
  weekStart: Scalars['Date']['input'];
};

export type OperatingReviewMetric = {
  __typename?: 'OperatingReviewMetric';
  delta: OperatingReviewDelta;
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  unit: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type OperatingReviewSection = {
  __typename?: 'OperatingReviewSection';
  changed: Array<Scalars['String']['output']>;
  improved: Array<Scalars['String']['output']>;
  key: Scalars['String']['output'];
  metrics: Array<OperatingReviewMetric>;
  title: Scalars['String']['output'];
  worsened: Array<Scalars['String']['output']>;
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
  /** List AI-attributed pull requests in the requested window so the UI can offer a concrete drilldown selector. Rows come from ai_attribution_resolved joined to git_pull_requests; no aggregation, no fabrication. */
  aiAttributedPrs: AiAttributedPrsResult;
  /** Side-by-side AI-assisted vs non-AI baseline comparison. */
  aiComparison: AiComparison;
  /** AI governance coverage and recent policy violations. */
  aiGovernanceSummary: AiGovernanceSummary;
  /** AI workflow impact summary across the requested time range. */
  aiImpactSummary: AiImpactSummary;
  /** AI automation opportunity recommendations. Returns an empty, stable contract until the detector ships (CHAOS-1586). */
  aiOpportunities: AiOpportunitiesResult;
  /** Per-bucket AI review-load breakdown with amplification. */
  aiReviewLoad: AiReviewLoadResult;
  /** Per-bucket AI risk breakdown (rework, revert, test gaps, incidents). */
  aiRiskBreakdown: AiRiskBreakdownResult;
  /** Drilldown into AI workflow evidence rooted at an issue, PR, or work_unit. Returns Work Graph nodes and edges with provenance and short evidence references. */
  aiWorkflowDrilldown: AiWorkflowDrilldownResult;
  /** Run batch analytics queries */
  analytics: AnalyticsResult;
  /** Repository ownership concentration and bus-factor summary. */
  busFactor: BusFactor;
  /** Compute capacity forecast on-demand */
  capacityForecast?: Maybe<CapacityForecast>;
  /** List persisted capacity forecasts */
  capacityForecasts: CapacityForecastConnection;
  /** Get catalog of available dimensions, measures, and limits */
  catalog: CatalogResult;
  /** Cyclomatic complexity trend by repo or file. Reads from append-only ``repo_complexity_daily`` / ``file_complexity_snapshots`` tables — no recomputation, pure surface of persisted data. */
  complexityTimeseries: ComplexityTimeseriesResult;
  /** Compounding Risk composite: churn × complexity × ownership × review-latency. Inspectable score with persisted weights, thresholds, raw inputs, and normalized components. */
  compoundingRisk: CompoundingRiskResult;
  /** Operator data-health and trust surface */
  dataHealth: DataHealth;
  /** Get home dashboard metrics */
  home: HomeResult;
  /** Top file hotspots ranked by risk_score (churn x complexity x ownership concentration). Reads from the append-only ``file_hotspot_daily`` table. */
  hotspots: HotspotsResult;
  /** Weekly Engineering Operating Review */
  operatingReview: OperatingReview;
  /** Latest rule-based recommendations for a team within a lookback window. */
  recommendations: Array<Recommendation>;
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
  /** Compute throughput-based capacity forecast */
  throughputForecast?: Maybe<ThroughputForecast>;
  /** Query work graph edges with optional filters */
  workGraphEdges: WorkGraphEdgesResult;
};


export type QueryAiAttributedPrsArgs = {
  dateRange: AiDateRangeInput;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<AiScopeInput>;
};


export type QueryAiComparisonArgs = {
  dateRange: AiDateRangeInput;
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<AiScopeInput>;
};


export type QueryAiGovernanceSummaryArgs = {
  dateRange: AiDateRangeInput;
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<AiScopeInput>;
  violationLimit?: Scalars['Int']['input'];
};


export type QueryAiImpactSummaryArgs = {
  dateRange: AiDateRangeInput;
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<AiScopeInput>;
};


export type QueryAiOpportunitiesArgs = {
  limit?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<AiScopeInput>;
};


export type QueryAiReviewLoadArgs = {
  dateRange: AiDateRangeInput;
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<AiScopeInput>;
};


export type QueryAiRiskBreakdownArgs = {
  dateRange: AiDateRangeInput;
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<AiScopeInput>;
};


export type QueryAiWorkflowDrilldownArgs = {
  depth?: Scalars['Int']['input'];
  limit?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
  rootId: Scalars['String']['input'];
  rootType: AiWorkflowRootTypeInput;
};


export type QueryAnalyticsArgs = {
  batch: AnalyticsRequestInput;
  orgId: Scalars['String']['input'];
};


export type QueryBusFactorArgs = {
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<BusFactorScopeInput>;
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


export type QueryComplexityTimeseriesArgs = {
  input: ComplexityTimeseriesInput;
};


export type QueryCompoundingRiskArgs = {
  filter?: InputMaybe<CompoundingRiskFilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryDataHealthArgs = {
  team: Scalars['ID']['input'];
};


export type QueryHomeArgs = {
  filters?: InputMaybe<FilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryHotspotsArgs = {
  input: HotspotsInput;
};


export type QueryOperatingReviewArgs = {
  input: OperatingReviewInput;
  orgId: Scalars['String']['input'];
};


export type QueryRecommendationsArgs = {
  orgId: Scalars['String']['input'];
  team: Scalars['ID']['input'];
  window: WindowInput;
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


export type QueryThroughputForecastArgs = {
  input: ThroughputForecastInput;
  orgId: Scalars['String']['input'];
};


export type QueryWorkGraphEdgesArgs = {
  filters?: InputMaybe<WorkGraphEdgeFilterInput>;
  orgId: Scalars['String']['input'];
};

export type Recommendation = {
  __typename?: 'Recommendation';
  computedAt: Scalars['DateTime']['output'];
  evidence: Array<EvidenceRef>;
  orgId: Scalars['String']['output'];
  rationale: Scalars['String']['output'];
  ruleId: Scalars['String']['output'];
  severity: Severity;
  successCriterion: Scalars['String']['output'];
  teamId: Scalars['String']['output'];
  title: Scalars['String']['output'];
  windowEnd: Scalars['Date']['output'];
  windowStart: Scalars['Date']['output'];
};

export type RepoAlertCount = {
  __typename?: 'RepoAlertCount';
  count: Scalars['Int']['output'];
  repoId: Scalars['String']['output'];
  repoName: Scalars['String']['output'];
  repoUrl?: Maybe<Scalars['String']['output']>;
};

export type RepoBusFactor = {
  __typename?: 'RepoBusFactor';
  evidenceSampleCount: Scalars['Int']['output'];
  repoId: Scalars['String']['output'];
  repoName: Scalars['String']['output'];
  topMaintainers: Array<MaintainerShare>;
  value: Scalars['Int']['output'];
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

export type Severity =
  | 'CRITICAL'
  | 'WARNING';

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

export type ThroughputForecast = {
  __typename?: 'ThroughputForecast';
  backlogSize: Scalars['Int']['output'];
  computedAt: Scalars['String']['output'];
  forecastId: Scalars['String']['output'];
  historyWeeks: Scalars['Int']['output'];
  incidentLoad: ThroughputRiskOverlay;
  insufficientHistory: Scalars['Boolean']['output'];
  p50Weeks?: Maybe<Scalars['Int']['output']>;
  p75Weeks?: Maybe<Scalars['Int']['output']>;
  p90Weeks?: Maybe<Scalars['Int']['output']>;
  primaryRisk: ThroughputRiskOverlay;
  reviewBottleneck: ThroughputRiskOverlay;
  rollingWindows: Array<ThroughputRollingWindow>;
  teamId: Scalars['String']['output'];
  wipCongestion: ThroughputRiskOverlay;
  workScopeId?: Maybe<Scalars['String']['output']>;
};

export type ThroughputForecastInput = {
  backlogSize: Scalars['Int']['input'];
  historyWeeks?: Scalars['Int']['input'];
  teamId: Scalars['String']['input'];
  workScopeId?: InputMaybe<Scalars['String']['input']>;
};

export type ThroughputRiskOverlay = {
  __typename?: 'ThroughputRiskOverlay';
  active: Scalars['Boolean']['output'];
  kind: Scalars['String']['output'];
  label: Scalars['String']['output'];
  score: Scalars['Float']['output'];
  threshold: Scalars['Float']['output'];
  value: Scalars['Float']['output'];
};

export type ThroughputRollingWindow = {
  __typename?: 'ThroughputRollingWindow';
  insufficientHistory: Scalars['Boolean']['output'];
  meanWeeklyThroughput: Scalars['Float']['output'];
  sampleCount: Scalars['Int']['output'];
  windowWeeks: Scalars['Int']['output'];
};

export type TimeGranularity =
  | 'DAY'
  | 'WEEK';

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

export type UnmappedIdentity = {
  __typename?: 'UnmappedIdentity';
  displayName?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  observedCount?: Maybe<Scalars['Int']['output']>;
  provider: Scalars['String']['output'];
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

export type WindowInput = {
  unit?: WindowUnit;
  value?: Scalars['Int']['input'];
};

export type WindowSpec = {
  __typename?: 'WindowSpec';
  durationDays?: Maybe<Scalars['Int']['output']>;
  kind: Scalars['String']['output'];
};

export type WindowUnit =
  | 'CYCLE'
  | 'DAY'
  | 'WEEK';

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
  | 'DEPLOYS'
  | 'DUPLICATES'
  | 'FIXES'
  | 'GENERATES'
  | 'GUARDS'
  | 'HAS_AI_WORKFLOW'
  | 'HAS_REVIEW_OUTCOME'
  | 'IMPACTS'
  | 'IMPLEMENTS'
  | 'INTRODUCED_BY'
  | 'IS_BLOCKED_BY'
  | 'IS_DUPLICATE_OF'
  | 'IS_RELATED_TO'
  | 'LINKED_INCIDENT'
  | 'PARENT_OF'
  | 'REFERENCES'
  | 'RELATES'
  | 'TOUCHES';

export type WorkGraphEdgeTypeInput =
  | 'BLOCKS'
  | 'CHILD_OF'
  | 'CONFIG_CHANGED_BY'
  | 'CONTAINS'
  | 'DEPLOYS'
  | 'DUPLICATES'
  | 'FIXES'
  | 'GENERATES'
  | 'GUARDS'
  | 'HAS_AI_WORKFLOW'
  | 'HAS_REVIEW_OUTCOME'
  | 'IMPACTS'
  | 'IMPLEMENTS'
  | 'INTRODUCED_BY'
  | 'IS_BLOCKED_BY'
  | 'IS_DUPLICATE_OF'
  | 'IS_RELATED_TO'
  | 'LINKED_INCIDENT'
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
  | 'AI_WORKFLOW_RUN'
  | 'COMMIT'
  | 'DEPLOYMENT'
  | 'DIFF'
  | 'FEATURE_FLAG'
  | 'FILE'
  | 'INCIDENT'
  | 'ISSUE'
  | 'PR'
  | 'RELEASE'
  | 'REVIEW_OUTCOME';

export type WorkGraphNodeTypeInput =
  | 'AI_WORKFLOW_RUN'
  | 'COMMIT'
  | 'DEPLOYMENT'
  | 'DIFF'
  | 'FEATURE_FLAG'
  | 'FILE'
  | 'INCIDENT'
  | 'ISSUE'
  | 'PR'
  | 'RELEASE'
  | 'REVIEW_OUTCOME';

export type WorkGraphProvenance =
  | 'EXPLICIT_TEXT'
  | 'HEURISTIC'
  | 'NATIVE';
