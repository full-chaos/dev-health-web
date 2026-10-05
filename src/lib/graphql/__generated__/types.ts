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

export type AiAttributionEvidenceRow = {
  __typename?: 'AIAttributionEvidenceRow';
  actor?: Maybe<Scalars['String']['output']>;
  confidence: Scalars['Float']['output'];
  evidence: Scalars['String']['output'];
  kind: Scalars['String']['output'];
  observedAt: Scalars['DateTime']['output'];
  provider: Scalars['String']['output'];
  repoId?: Maybe<Scalars['String']['output']>;
  source: Scalars['String']['output'];
  subjectId: Scalars['String']['output'];
  subjectType: Scalars['String']['output'];
  teamId?: Maybe<Scalars['String']['output']>;
};

export type AiAttributionMixRow = {
  __typename?: 'AIAttributionMixRow';
  count: Scalars['Int']['output'];
  kind: Scalars['String']['output'];
  share: Scalars['Float']['output'];
};

export type AiAttributionOverviewResult = {
  __typename?: 'AIAttributionOverviewResult';
  dataAvailable: Scalars['Boolean']['output'];
  endDate: Scalars['Date']['output'];
  hasMore: Scalars['Boolean']['output'];
  mix: Array<AiAttributionMixRow>;
  orgId: Scalars['String']['output'];
  rows: Array<AiAttributionEvidenceRow>;
  startDate: Scalars['Date']['output'];
  totalAttributed: Scalars['Int']['output'];
};

export type AiAttributionScopeInput = {
  buckets?: InputMaybe<Array<AiAttributionBucketInput>>;
  repoId?: InputMaybe<Scalars['String']['input']>;
  teamId?: InputMaybe<Scalars['String']['input']>;
};

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

export type AiComplexityOverlapRow = {
  __typename?: 'AIComplexityOverlapRow';
  bucket: Scalars['String']['output'];
  complexityOverlapRate?: Maybe<Scalars['Float']['output']>;
  prsTotal: Scalars['Int']['output'];
  prsTouchingHighComplexity: Scalars['Int']['output'];
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

export type AiHotspotOverlapRow = {
  __typename?: 'AIHotspotOverlapRow';
  avgHotspotRiskScore?: Maybe<Scalars['Float']['output']>;
  bucket: Scalars['String']['output'];
  hotspotOverlapRate?: Maybe<Scalars['Float']['output']>;
  prsTotal: Scalars['Int']['output'];
  prsTouchingHotspots: Scalars['Int']['output'];
};

export type AiImpactBucketRow = {
  __typename?: 'AIImpactBucketRow';
  bucket: Scalars['String']['output'];
  changesRequestedPerPr?: Maybe<Scalars['Float']['output']>;
  cycleTimeAvgHours?: Maybe<Scalars['Float']['output']>;
  day: Scalars['Date']['output'];
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

export type AiImpactScopeRollupRow = {
  __typename?: 'AIImpactScopeRollupRow';
  aiAssistedPrRatio?: Maybe<Scalars['Float']['output']>;
  aiPrsTotal: Scalars['Int']['output'];
  reworkRateDelta?: Maybe<Scalars['Float']['output']>;
  scopeId: Scalars['String']['output'];
  scopeLabel: Scalars['String']['output'];
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
  repoBreakdown: Array<AiImpactScopeRollupRow>;
  startDate: Scalars['Date']['output'];
  teamBreakdown: Array<AiImpactScopeRollupRow>;
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
  /** The repository's full name in the org's repository catalogue (CHAOS-8114). Null = the catalogue holds no name for ``repoId``, or the catalogue could not be read. It is never the id. */
  repoName?: Maybe<Scalars['String']['output']>;
  score: Scalars['Float']['output'];
  teamId?: Maybe<Scalars['String']['output']>;
  /** The name of the team ``teamId`` names, from the org's team catalogue (CHAOS-8114). Null = the opportunity has no team, the catalogue holds no name for it, or the catalogue could not be read. It is never the id. */
  teamName?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  workGraphDrilldowns: Array<AiWorkGraphDrilldownRef>;
};

export type AiOpportunityKind =
  | 'DEPENDENCY_UPDATES'
  | 'DOCUMENTATION_DRIFT'
  | 'FLAKY_TEST_TRIAGE'
  | 'HIGH_REVIEW_LOAD'
  | 'HIGH_REWORK'
  | 'MECHANICAL_MIGRATIONS'
  | 'REPETITIVE_CHANGE'
  | 'SLOW_CYCLE'
  | 'TEST_GENERATION'
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
  pickupLatencyHours?: Maybe<Scalars['Float']['output']>;
  postFirstReviewPushesCount: Scalars['Int']['output'];
  postFirstReviewPushesPerPr?: Maybe<Scalars['Float']['output']>;
  prsTotal: Scalars['Int']['output'];
  reviewAmplification?: Maybe<Scalars['Float']['output']>;
  reviewCommentsPerLoc?: Maybe<Scalars['Float']['output']>;
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
  complexityOverlap: Array<AiComplexityOverlapRow>;
  dataAvailable: Scalars['Boolean']['output'];
  endDate: Scalars['Date']['output'];
  hotspotOverlap: Array<AiHotspotOverlapRow>;
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
  /** The node's display name (CHAOS-8113). By ``nodeType``: ``pr`` = the pull request's title; ``deployment`` = "<environment> deploy"; ``incident`` = "<title> (<status>)"; ``issue`` = the issue's own id when it is a readable key. Null = no name is known: the catalogue does not name the node, the name read failed, or the type carries no name (see ``nameExpected``). It is never an id that is, or holds, a UUID or an opaque hash. Every end of an edge in ``edges`` that has an id has a node in ``nodes`` with the same type and id, so a client names an edge end by that node. */
  displayName?: Maybe<Scalars['String']['output']>;
  /** True = nodes of this type carry a name (``pr``, ``deployment``, ``incident``, ``issue``): a null ``displayName`` is then a gap, and a client draws "Not reported". False = the type has no name by design (a review outcome, an AI workflow run, a diff): a client draws the type words alone. */
  nameExpected: Scalars['Boolean']['output'];
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
  repoName?: Maybe<Scalars['String']['output']>;
  teamId?: Maybe<Scalars['String']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
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
  evidenceQualityDistribution?: Maybe<Scalars['JSON']['output']>;
  evidenceQualityStats?: Maybe<EvidenceQualityStats>;
  flowMatrix?: Maybe<FlowMatrixResult>;
  sankey?: Maybe<SankeyResult>;
  timeseries: Array<TimeseriesResult>;
};

export type BreakdownItem = {
  __typename?: 'BreakdownItem';
  key: Scalars['String']['output'];
  label?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['Float']['output']>;
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

/**
 * One forecast's simulation results as histograms: for each mode, the distinct
 * outcomes of the runs and how many runs produced each, ascending by value. A
 * mode that did not simulate is null. The counts of one mode sum to the
 * forecast's simulation count, so any percentile can be recomputed from the bins.
 */
export type CapacityDistribution = {
  __typename?: 'CapacityDistribution';
  /** Fixed-scope mode: days to complete the target items, one bin per distinct day count. */
  days?: Maybe<Array<CapacityDistributionBin>>;
  /**
   * The horizon of the days simulation, in days (CHAOS-8477): 365. A ``days`` bin
   * with this value means "this many days or more".
   */
  horizonDays: Scalars['Int']['output'];
  /** Fixed-date mode: items completed by the target date, one bin per distinct total. */
  items?: Maybe<Array<CapacityDistributionBin>>;
  /**
   * The number of simulation runs behind each mode (CHAOS-8477): the counts of one
   * mode's bins sum to it, the runs that did not finish included. The modes of one
   * forecast come from one simulation and hold the same number of runs. The share
   * of the runs that finished is served on each bin (cumulativeShare).
   */
  runs: Scalars['Int']['output'];
  /**
   * The number of days-mode runs that did NOT finish inside the simulated horizon
   * (CHAOS-8477): the simulation stops a run after ``horizonDays`` days, with
   * items still open, and records it in the ``days`` bin at ``horizonDays``. Such
   * a run is not done. A run that needs exactly ``horizonDays`` days is recorded
   * in the same bin and cannot be told apart, so it is counted here too. Null =
   * the days mode did not simulate (``days`` is null).
   */
  unfinishedRuns?: Maybe<Scalars['Int']['output']>;
};

export type CapacityDistributionBin = {
  __typename?: 'CapacityDistributionBin';
  /** How many simulation runs ended on this value. In the days bin at horizonDays: how many runs were stopped there. */
  count: Scalars['Int']['output'];
  /**
   * The share of ALL the mode's simulation runs (CHAOS-8477), from the same Monte
   * Carlo distribution as p50Days / p85Days / p95Days: 0 to 1, never lower than
   * on the bin before. In the days mode it is the share of the runs that FINISHED
   * (the target items were done) on or before that day. A run that reached the
   * horizon is not done: the bin at horizonDays adds nothing to the share, so the
   * last share is below 1 when any run reached the horizon (unfinishedRuns), and
   * it is 1 only when every run finished. In the items mode it is the share of
   * the runs with this many items or fewer, and 1 on the last bin. The percentile
   * days are an interpolated rank of the same runs: the day on which this share
   * first reaches 0.50 and p50Days both lie between the outcomes of the same two
   * consecutive ranked runs, so they are the same day unless those two runs ended
   * on different days (and so for 0.85 and p85Days, 0.95 and p95Days). When so
   * many runs reached the horizon that the share never reaches a percentile, that
   * percentile day is horizonDays and means "horizonDays or more".
   */
  cumulativeShare: Scalars['Float']['output'];
  /**
   * The outcome: a day count (days) or an item count (items). A day count is the
   * number of days after the day the forecast was computed: the same axis as
   * p50Days, p85Days and p95Days (p50Date is that day plus p50Days). A day count
   * equal to the distribution's horizonDays means "that many days or more": the
   * simulation stops a run there, done or not.
   */
  value: Scalars['Int']['output'];
};

export type CapacityForecast = {
  __typename?: 'CapacityForecast';
  backlogSize: Scalars['Int']['output'];
  /**
   * The Monte Carlo distribution the p50 / p85 / p95 above were taken from, as
   * histograms (CHAOS-7624). Null = no distribution: a forecast stored before it
   * existed, or one where neither mode simulated. Never an object of zero bins.
   */
  completionDistribution?: Maybe<CapacityDistribution>;
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
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
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

export type CognitiveLoadInput = {
  orgId: Scalars['String']['input'];
  repoId?: InputMaybe<Scalars['String']['input']>;
  sinceDate: Scalars['Date']['input'];
  teamId?: InputMaybe<Scalars['String']['input']>;
  untilDate: Scalars['Date']['input'];
};

export type CognitiveLoadResult = {
  __typename?: 'CognitiveLoadResult';
  orgId: Scalars['String']['output'];
  signals: Array<CognitiveLoadSignal>;
  teamId?: Maybe<Scalars['String']['output']>;
  totalDays: Scalars['Int']['output'];
};

export type CognitiveLoadSignal = {
  __typename?: 'CognitiveLoadSignal';
  afterHoursCommitRatio?: Maybe<Scalars['Float']['output']>;
  contextSpreadCount: Scalars['Float']['output'];
  day: Scalars['Date']['output'];
  prInterruptionLoad: Scalars['Float']['output'];
  reviewRequestLoad: Scalars['Float']['output'];
  weekendCommitRatio?: Maybe<Scalars['Float']['output']>;
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
  scopeEntity: CompoundingRiskScopeEntity;
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

export type CompoundingRiskScopeEntity = {
  __typename?: 'CompoundingRiskScopeEntity';
  displayName: Scalars['String']['output'];
  id: Scalars['String']['output'];
};

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

export type ConstraintCard = {
  __typename?: 'ConstraintCard';
  claim: Scalars['String']['output'];
  evidence: Array<ConstraintEvidence>;
  experiments: Array<Scalars['String']['output']>;
  title: Scalars['String']['output'];
};

export type ConstraintEvidence = {
  __typename?: 'ConstraintEvidence';
  label: Scalars['String']['output'];
  link: Scalars['String']['output'];
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

export type EventItem = {
  __typename?: 'EventItem';
  link: Scalars['String']['output'];
  text: Scalars['String']['output'];
  ts: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type EvidenceQualityStats = {
  __typename?: 'EvidenceQualityStats';
  bandCounts: Scalars['JSON']['output'];
  mean?: Maybe<Scalars['Float']['output']>;
  stddev?: Maybe<Scalars['Float']['output']>;
  total: Scalars['Int']['output'];
};

export type EvidenceRef = {
  __typename?: 'EvidenceRef';
  field: Scalars['String']['output'];
  metricTable: Scalars['String']['output'];
  teamId: Scalars['String']['output'];
  value: Scalars['Float']['output'];
  windowEnd: Scalars['Date']['output'];
  windowStart: Scalars['Date']['output'];
};

export type Experiment = {
  __typename?: 'Experiment';
  hypothesis: Scalars['String']['output'];
  id: Scalars['String']['output'];
  metric: Scalars['String']['output'];
  opportunityId: Scalars['String']['output'];
  outcome?: Maybe<Scalars['String']['output']>;
  owner: Scalars['String']['output'];
  startDate?: Maybe<Scalars['Date']['output']>;
  status: ExperimentStatus;
  stopCondition: Scalars['String']['output'];
  stopDate?: Maybe<Scalars['Date']['output']>;
};

export type ExperimentStatus =
  | 'ABANDONED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'SUGGESTED';

export type ExperimentsResult = {
  __typename?: 'ExperimentsResult';
  derivedFromOpportunities: Scalars['Boolean']['output'];
  items: Array<Experiment>;
};

export type FeatureFlagEventItem = {
  __typename?: 'FeatureFlagEventItem';
  actorType: Scalars['String']['output'];
  environment: Scalars['String']['output'];
  eventTs: Scalars['String']['output'];
  eventType: Scalars['String']['output'];
  flagKey: Scalars['String']['output'];
  nextState: Scalars['String']['output'];
  prevState: Scalars['String']['output'];
};

export type FeatureFlagEventsResult = {
  __typename?: 'FeatureFlagEventsResult';
  degradedReason?: Maybe<Scalars['String']['output']>;
  events: Array<FeatureFlagEventItem>;
  totalCount: Scalars['Int']['output'];
};

export type FeatureFlagItem = {
  __typename?: 'FeatureFlagItem';
  archivedAt?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  flagId: Scalars['String']['output'];
  flagKey: Scalars['String']['output'];
  flagType: Scalars['String']['output'];
  projectKey: Scalars['String']['output'];
  provider: Scalars['String']['output'];
};

export type FeatureFlagRegistryResult = {
  __typename?: 'FeatureFlagRegistryResult';
  degradedReason?: Maybe<Scalars['String']['output']>;
  flags: Array<FeatureFlagItem>;
  totalCount: Scalars['Int']['output'];
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
  /**
   * Non-null only when the underlying ClickHouse execution failed and
   * was swallowed to an empty nodes/edges result (Python-parity
   * behaviour, analytics.py:959-961) -- CHAOS-7092: the caller must be
   * able to tell a genuinely empty result apart from a degraded one.
   */
  degradedReason?: Maybe<Scalars['String']['output']>;
  edges: Array<SankeyEdge>;
  nodes: Array<SankeyNode>;
};

export type Freshness = {
  __typename?: 'Freshness';
  coverage?: Maybe<Coverage>;
  lastIngestedAt?: Maybe<Scalars['String']['output']>;
  /** ISO timestamp of the most recent sync that succeeded across every connected source, or null when none ever has. */
  latestSuccessfulSyncAt?: Maybe<Scalars['String']['output']>;
  /** One entry per connected source (provider name and its own sync status) -- not a fixed set of keys. */
  sources: Array<HomeFreshnessSource>;
};

export type HealthState = {
  __typename?: 'HealthState';
  asOf?: Maybe<Scalars['String']['output']>;
  headline: Scalars['String']['output'];
  status: Scalars['String']['output'];
  summary: Scalars['String']['output'];
};

export type HomeDataConfidence = {
  __typename?: 'HomeDataConfidence';
  caveats: Array<Scalars['String']['output']>;
  connectedSources: Array<Scalars['String']['output']>;
  /** Null when coverage could not be computed for this window. */
  coveragePct?: Maybe<Scalars['Float']['output']>;
  level: Scalars['String']['output'];
  missingSources: Array<Scalars['String']['output']>;
};

export type HomeFreshnessSource = {
  __typename?: 'HomeFreshnessSource';
  provider: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type HomeLimitingFactor = {
  __typename?: 'HomeLimitingFactor';
  claim: Scalars['String']['output'];
  confidence: Scalars['String']['output'];
  evidenceRef?: Maybe<Scalars['String']['output']>;
  recommendedAction: Scalars['String']['output'];
  whyItMatters: Scalars['String']['output'];
};

export type HomeResult = {
  __typename?: 'HomeResult';
  constraint: ConstraintCard;
  dataConfidence: HomeDataConfidence;
  deltas: Array<MetricDelta>;
  events: Array<EventItem>;
  freshness: Freshness;
  healthState: HealthState;
  limitingFactor: HomeLimitingFactor;
  reworkThemeAllocation: Array<ReworkThemeAllocation>;
  /** Coverage and ingestion quality for the selected repository scope; distinct from org-wide dataConfidence. */
  scopeDataConfidence: HomeScopeDataConfidence;
  signals: Array<HomeSignal>;
  summary: Array<SummarySentence>;
  tiles: Array<HomeTileEntry>;
};

/** Coverage and metric-ingestion quality for the repositories selected by this Home request. */
export type HomeScopeDataConfidence = {
  __typename?: 'HomeScopeDataConfidence';
  caveats: Array<Scalars['String']['output']>;
  /** Null when the selected scope has no repositories. */
  coveragePct?: Maybe<Scalars['Float']['output']>;
  /** Most recent in-window repository-metric ingestion, or null when the scope has none. */
  lastIngestedAt?: Maybe<Scalars['String']['output']>;
  level: Scalars['String']['output'];
};

export type HomeSignal = {
  __typename?: 'HomeSignal';
  affectedScope: Scalars['String']['output'];
  category: Scalars['String']['output'];
  confidence: Scalars['String']['output'];
  currentValue: Scalars['String']['output'];
  delta?: Maybe<Scalars['String']['output']>;
  direction: Scalars['String']['output'];
  evidenceCount: Scalars['Int']['output'];
  /** Opaque reference into the evidence store, or null when the signal carries none. */
  evidenceRef?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  metric: Scalars['String']['output'];
  priorValue?: Maybe<Scalars['String']['output']>;
  /** The action the builder recommends, verbatim -- deterministic output of home.BuildResponse, not an LLM suggestion and not re-ranked here. */
  recommendedAction: Scalars['String']['output'];
  /** Null when the signal is not scoped to one entity (e.g. an org-wide signal). */
  scopeEntity?: Maybe<ScopeEntityRef>;
  severity: Scalars['String']['output'];
  title: Scalars['String']['output'];
  whyItMatters: Scalars['String']['output'];
};

export type HomeTile = {
  __typename?: 'HomeTile';
  link: Scalars['String']['output'];
  subtitle: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

/** One entry of HomeResult.tiles -- a list, not a map, so field order matches the builder's own ordering. */
export type HomeTileEntry = {
  __typename?: 'HomeTileEntry';
  key: Scalars['String']['output'];
  value: HomeTile;
};

/** Time window of the `home` query, the same members as `filters.time` of the REST home endpoint (range_days, compare_days, start_date, end_date). An unset member takes the REST default: 14, 14, no explicit dates. */
export type HomeWindowInput = {
  compareDays?: InputMaybe<Scalars['Int']['input']>;
  endDate?: InputMaybe<Scalars['Date']['input']>;
  rangeDays?: InputMaybe<Scalars['Int']['input']>;
  startDate?: InputMaybe<Scalars['Date']['input']>;
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

export type ImproveOpportunitiesResult = {
  __typename?: 'ImproveOpportunitiesResult';
  detectorReady: Scalars['Boolean']['output'];
  opportunities: Array<ImproveOpportunity>;
  orgId: Scalars['String']['output'];
  totalCount: Scalars['Int']['output'];
};

export type ImproveOpportunity = {
  __typename?: 'ImproveOpportunity';
  entityId: Scalars['String']['output'];
  entityType: Scalars['String']['output'];
  evidenceRefs: Array<Scalars['String']['output']>;
  kind: ImproveOpportunityKind;
  opportunityId: Scalars['String']['output'];
  rationale: Scalars['String']['output'];
  recommendedAction: Scalars['String']['output'];
  score: Scalars['Float']['output'];
  severity: Scalars['String']['output'];
  /** The rule's limit, in `unit`. A fixed constant of the detector, not a per-organization setting. */
  threshold: Scalars['Float']['output'];
  /** Which side of the threshold fires the rule: ABOVE (value > threshold) or BELOW (value < threshold). */
  thresholdDirection: ThresholdDirection;
  title: Scalars['String']['output'];
  unit: ImproveOpportunityUnit;
  /** The measured metric the rule compared, in `unit`. The same number the rationale states. */
  value: Scalars['Float']['output'];
};

export type ImproveOpportunityKind =
  | 'HIGH_CHANGE_FAILURE'
  | 'HIGH_CHURN'
  | 'HIGH_REVIEW_LATENCY'
  | 'HIGH_REWORK'
  | 'HIGH_WIP'
  | 'LOW_THROUGHPUT'
  | 'SLOW_CYCLE_TIME';

export type ImproveOpportunityUnit =
  | 'HOURS'
  | 'ITEMS'
  | 'RATIO';

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
  | 'PR_REWORK_RATIO'
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
  /** False = the prior week holds no stored value for the metric (CHAOS-8115); see ``OperatingReviewMetric.hasData``. ``priorValue`` is then a 0 placeholder, and ``absolute``, ``percent`` and ``status`` compare with that placeholder: a client draws "No data" for the prior week and no change. */
  hasPriorData: Scalars['Boolean']['output'];
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
  /** True = the week holds a stored value for the metric (CHAOS-8115). False = no row of the metric's daily table in the week, only NULL values, or a read that failed: ``value`` is then a 0 placeholder, not a measured zero, and a client draws "No data". True with ``value`` 0 is a stored zero. */
  hasData: Scalars['Boolean']['output'];
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

export type ProductTelemetryChartInteractionType = {
  __typename?: 'ProductTelemetryChartInteractionType';
  action: Scalars['String']['output'];
  chart: Scalars['String']['output'];
  interactions: Scalars['Int']['output'];
  sessions: Scalars['Int']['output'];
  surface: Scalars['String']['output'];
};

export type ProductTelemetryClientErrorType = {
  __typename?: 'ProductTelemetryClientErrorType';
  affectedAnonymousUsers: Scalars['Int']['output'];
  boundary: Scalars['String']['output'];
  errorClass: Scalars['String']['output'];
  errors: Scalars['Int']['output'];
  routePattern: Scalars['String']['output'];
};

export type ProductTelemetryDailyActiveUsersType = {
  __typename?: 'ProductTelemetryDailyActiveUsersType';
  activeAnonymousUsers: Scalars['Int']['output'];
  day: Scalars['Date']['output'];
};

export type ProductTelemetryDashboardInput = {
  endDate: Scalars['Date']['input'];
  startDate: Scalars['Date']['input'];
};

export type ProductTelemetryDashboardType = {
  __typename?: 'ProductTelemetryDashboardType';
  chartInteractions: Array<ProductTelemetryChartInteractionType>;
  clientErrors: Array<ProductTelemetryClientErrorType>;
  dailyActiveUsers: Array<ProductTelemetryDailyActiveUsersType>;
  featureViews: Array<ProductTelemetryFeatureViewType>;
  filterChanges: Array<ProductTelemetryFilterChangeType>;
  sessionSummary: ProductTelemetrySessionSummaryType;
  topRoutes: Array<ProductTelemetryRouteUsageType>;
};

export type ProductTelemetryFeatureViewType = {
  __typename?: 'ProductTelemetryFeatureViewType';
  anonymousUsers: Scalars['Int']['output'];
  feature: Scalars['String']['output'];
  surface: Scalars['String']['output'];
  views: Scalars['Int']['output'];
};

export type ProductTelemetryFilterChangeType = {
  __typename?: 'ProductTelemetryFilterChangeType';
  avgValueCount?: Maybe<Scalars['Float']['output']>;
  changes: Scalars['Int']['output'];
  filterKey: Scalars['String']['output'];
  view: Scalars['String']['output'];
};

export type ProductTelemetryPlatformDashboardType = {
  __typename?: 'ProductTelemetryPlatformDashboardType';
  chartInteractions: Array<ProductTelemetryChartInteractionType>;
  clientErrors: Array<ProductTelemetryClientErrorType>;
  dailyActiveUsers: Array<ProductTelemetryDailyActiveUsersType>;
  featureViews: Array<ProductTelemetryFeatureViewType>;
  filterChanges: Array<ProductTelemetryFilterChangeType>;
  sessionSummary: ProductTelemetrySessionSummaryType;
  topOrgs: Array<ProductTelemetryTopOrgType>;
  topRoutes: Array<ProductTelemetryRouteUsageType>;
  totals: ProductTelemetryPlatformTotalsType;
};

export type ProductTelemetryPlatformTotalsType = {
  __typename?: 'ProductTelemetryPlatformTotalsType';
  activeOrgs: Scalars['Int']['output'];
  anonymousUsers: Scalars['Int']['output'];
  events: Scalars['Int']['output'];
  sessions: Scalars['Int']['output'];
};

export type ProductTelemetryRouteUsageType = {
  __typename?: 'ProductTelemetryRouteUsageType';
  anonymousUsers: Scalars['Int']['output'];
  events: Scalars['Int']['output'];
  routePattern: Scalars['String']['output'];
  sessions: Scalars['Int']['output'];
};

export type ProductTelemetrySessionSummaryType = {
  __typename?: 'ProductTelemetrySessionSummaryType';
  avgInteractions?: Maybe<Scalars['Float']['output']>;
  avgPagesViewed?: Maybe<Scalars['Float']['output']>;
  p50DurationMs?: Maybe<Scalars['Int']['output']>;
  p75DurationMs?: Maybe<Scalars['Int']['output']>;
  p90DurationMs?: Maybe<Scalars['Int']['output']>;
  p95DurationMs?: Maybe<Scalars['Int']['output']>;
};

export type ProductTelemetryTopOrgType = {
  __typename?: 'ProductTelemetryTopOrgType';
  anonymousUsers: Scalars['Int']['output'];
  events: Scalars['Int']['output'];
  orgId?: Maybe<Scalars['String']['output']>;
  orgIdHash: Scalars['String']['output'];
  orgName?: Maybe<Scalars['String']['output']>;
  orgSlug?: Maybe<Scalars['String']['output']>;
  sessions: Scalars['Int']['output'];
};

export type PullRequestCommit = {
  __typename?: 'PullRequestCommit';
  authorEmail?: Maybe<Scalars['String']['output']>;
  authorName?: Maybe<Scalars['String']['output']>;
  authorWhen?: Maybe<Scalars['DateTime']['output']>;
  confidence?: Maybe<Scalars['Float']['output']>;
  evidence?: Maybe<Scalars['String']['output']>;
  hash: Scalars['String']['output'];
  message?: Maybe<Scalars['String']['output']>;
  provenance?: Maybe<Scalars['String']['output']>;
};

export type PullRequestDetail = {
  __typename?: 'PullRequestDetail';
  additions?: Maybe<Scalars['Int']['output']>;
  authorEmail?: Maybe<Scalars['String']['output']>;
  authorName?: Maybe<Scalars['String']['output']>;
  baseBranch?: Maybe<Scalars['String']['output']>;
  body?: Maybe<Scalars['String']['output']>;
  changedFiles?: Maybe<Scalars['Int']['output']>;
  changesRequestedCount: Scalars['Int']['output'];
  closedAt?: Maybe<Scalars['DateTime']['output']>;
  commentsCount: Scalars['Int']['output'];
  commits: Array<PullRequestCommit>;
  createdAt: Scalars['DateTime']['output'];
  deletions?: Maybe<Scalars['Int']['output']>;
  firstCommentAt?: Maybe<Scalars['DateTime']['output']>;
  firstReviewAt?: Maybe<Scalars['DateTime']['output']>;
  headBranch?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  linkedIssues: Array<PullRequestIssueLink>;
  mergedAt?: Maybe<Scalars['DateTime']['output']>;
  number: Scalars['Int']['output'];
  orgId: Scalars['String']['output'];
  repoId: Scalars['ID']['output'];
  repoName?: Maybe<Scalars['String']['output']>;
  reviews: Array<PullRequestReview>;
  reviewsCount: Scalars['Int']['output'];
  state?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type PullRequestIssueLink = {
  __typename?: 'PullRequestIssueLink';
  confidence: Scalars['Float']['output'];
  evidence: Scalars['String']['output'];
  provenance: Scalars['String']['output'];
  workItemId: Scalars['String']['output'];
};

export type PullRequestReview = {
  __typename?: 'PullRequestReview';
  reviewId: Scalars['String']['output'];
  reviewer: Scalars['String']['output'];
  state: Scalars['String']['output'];
  submittedAt: Scalars['DateTime']['output'];
};

export type Query = {
  __typename?: 'Query';
  /** List AI-attributed pull requests in the requested window so the UI can offer a concrete drilldown selector. Rows come from ai_attribution_resolved joined to git_pull_requests; no aggregation, no fabrication. */
  aiAttributedPrs: AiAttributedPrsResult;
  /** AI attribution mix and provenance evidence for the requested window. Reads ai_attribution_resolved only - the highest-precedence, non-superseded signal per subject - so every row carries source, confidence, and evidence. Does not include a synthesized human bucket; use aiImpactSummary for the full AI-vs-human PR split. */
  aiAttributionOverview: AiAttributionOverviewResult;
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
  /** Daily cognitive-load signals (PR interruption, context spread, review request load, after-hours and weekend commit ratios). Reads from ``user_metrics_daily`` and ``team_metrics_daily`` — no recomputation, pure surface of persisted metrics. */
  cognitiveLoad: CognitiveLoadResult;
  /** Cyclomatic complexity trend by repo or file. Reads from append-only ``repo_complexity_daily`` / ``file_complexity_snapshots`` tables — no recomputation, pure surface of persisted data. */
  complexityTimeseries: ComplexityTimeseriesResult;
  /** Compounding Risk composite: churn × complexity × ownership × review-latency. Inspectable score with persisted weights, thresholds, raw inputs, and normalized components. */
  compoundingRisk: CompoundingRiskResult;
  /** Each repository's coverage baseline (CHAOS-8111): its own mean coverage over the 30 days before ``endDate`` (``endDate`` itself is not included). Not a set target. One row per repository with a stored coverage row in those 30 days, in ``repoId`` order. */
  coverageBaselines: Array<RepoCoverageBaseline>;
  /** Operator data-health and trust surface */
  dataHealth: DataHealth;
  /** Experiments derived from opportunity suggested_experiments (CHAOS-2219). v1: computed at query-time — no persistence table. Each experiment is a typed promotion of a suggestion string with hypothesis / metric / owner / stop_condition. ``derived_from_opportunities`` is False when the opportunities service was unavailable; items will be empty in that case. */
  experiments: ExperimentsResult;
  /** List feature flag state-change events */
  featureFlagEvents: FeatureFlagEventsResult;
  /** List feature flags from the ClickHouse registry */
  featureFlags: FeatureFlagRegistryResult;
  /** Get home dashboard metrics */
  home: HomeResult;
  /** Top file hotspots ranked by risk_score (churn x complexity x ownership concentration). Reads from the append-only ``file_hotspot_daily`` table. */
  hotspots: HotspotsResult;
  /** Non-AI flow opportunity recommendations for the Improve surface (CHAOS-2220). Fires threshold rules over repo and team metrics (review latency, cycle time, rework, WIP, throughput, churn, change failure) and returns scored candidates. An empty list means all metrics are within thresholds — not an error. */
  improveOpportunities: ImproveOpportunitiesResult;
  /** Weekly Engineering Operating Review */
  operatingReview: OperatingReview;
  /** Pull request detail by stable id ({repo_id}#pr{number}) from persisted ClickHouse PR, review, commit, and Work Graph tables. */
  pr?: Maybe<PullRequestDetail>;
  /** Get first-party product telemetry dashboard metrics */
  productTelemetryDashboard: ProductTelemetryDashboardType;
  /** Cross-org product telemetry dashboard for platform/super admins. Requires is_superuser. Returns global aggregates plus a top-orgs rollup with org names resolved from Postgres. */
  productTelemetryPlatformDashboard: ProductTelemetryPlatformDashboardType;
  /** Latest rule-based recommendations for a team within a lookback window. */
  recommendations: Array<Recommendation>;
  /** List report runs for a saved report */
  reportRuns: ReportRunConnection;
  /** Reviewer-to-author collaboration edges from ``review_edges_daily``. Ordered by review count descending.  Use ``repoIds`` to narrow to specific repositories.  Org-scoped; no recomputation. */
  reviewEdges: ReviewEdgesResult;
  /** Get a saved report by ID */
  savedReport?: Maybe<SavedReportType>;
  /** List saved reports for an organization */
  savedReports: SavedReportConnection;
  /** Paginated list of security alerts */
  securityAlerts: SecurityAlertConnection;
  /** Aggregated security posture for the dashboard */
  securityOverview: SecurityOverview;
  /** CI job names that failed in a window, by workflow and job name (CHAOS-8513). Computed at read time from the stored job runs of every CI provider. */
  testopsJobFailures: TestOpsJobFailuresResult;
  /** Persisted TestOps Delivery Risk metrics from release confidence, quality drag, and pipeline stability tables. */
  testopsRisk: TestOpsRiskResult;
  /** Compute throughput-based capacity forecast */
  throughputForecast?: Maybe<ThroughputForecast>;
  /** Top-N work graph nodes ranked by degree over the full graph */
  workGraphArtifacts: WorkGraphArtifactsResult;
  /** Query work graph edges with optional filters */
  workGraphEdges: WorkGraphEdgesResult;
  /** Per-node-type inflow/outflow over the full work graph */
  workGraphFlow: WorkGraphFlowResult;
  /** Team-attribution provenance per work item (source/confidence/evidence/is_primary) — CHAOS-2600 */
  workItemTeamAttributions: Array<WorkItemTeamAttribution>;
  /** The owning team per work UNIT (investment cluster), collapsed from its member work-item attributions by source precedence — CHAOS-2600 */
  workUnitTeamAttributions: Array<WorkUnitTeamAttribution>;
};


export type QueryAiAttributedPrsArgs = {
  dateRange: AiDateRangeInput;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<AiScopeInput>;
};


export type QueryAiAttributionOverviewArgs = {
  dateRange: AiDateRangeInput;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
  scope?: InputMaybe<AiAttributionScopeInput>;
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


export type QueryCognitiveLoadArgs = {
  input: CognitiveLoadInput;
};


export type QueryComplexityTimeseriesArgs = {
  input: ComplexityTimeseriesInput;
};


export type QueryCompoundingRiskArgs = {
  filter?: InputMaybe<CompoundingRiskFilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryCoverageBaselinesArgs = {
  endDate: Scalars['Date']['input'];
  orgId: Scalars['String']['input'];
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryDataHealthArgs = {
  team: Scalars['ID']['input'];
};


export type QueryExperimentsArgs = {
  filters?: InputMaybe<FilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryFeatureFlagEventsArgs = {
  environment?: InputMaybe<Scalars['String']['input']>;
  flagKey?: InputMaybe<Scalars['String']['input']>;
  limit?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
};


export type QueryFeatureFlagsArgs = {
  includeArchived?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
  project?: InputMaybe<Scalars['String']['input']>;
  provider?: InputMaybe<Scalars['String']['input']>;
};


export type QueryHomeArgs = {
  filters?: InputMaybe<FilterInput>;
  orgId: Scalars['String']['input'];
  window?: InputMaybe<HomeWindowInput>;
};


export type QueryHotspotsArgs = {
  input: HotspotsInput;
};


export type QueryImproveOpportunitiesArgs = {
  limit?: Scalars['Int']['input'];
  scope?: InputMaybe<AiScopeInput>;
  windowDays?: Scalars['Int']['input'];
};


export type QueryOperatingReviewArgs = {
  input: OperatingReviewInput;
  orgId: Scalars['String']['input'];
};


export type QueryPrArgs = {
  id: Scalars['ID']['input'];
  orgId: Scalars['String']['input'];
};


export type QueryProductTelemetryDashboardArgs = {
  input: ProductTelemetryDashboardInput;
  orgId: Scalars['String']['input'];
};


export type QueryProductTelemetryPlatformDashboardArgs = {
  input: ProductTelemetryDashboardInput;
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


export type QueryReviewEdgesArgs = {
  input: ReviewEdgesInput;
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


export type QueryTestopsJobFailuresArgs = {
  input: TestOpsJobFailuresInput;
  orgId: Scalars['String']['input'];
};


export type QueryTestopsRiskArgs = {
  input: TestOpsRiskInput;
  orgId: Scalars['String']['input'];
};


export type QueryThroughputForecastArgs = {
  input: ThroughputForecastInput;
  orgId: Scalars['String']['input'];
};


export type QueryWorkGraphArtifactsArgs = {
  filters?: InputMaybe<WorkGraphEdgeFilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryWorkGraphEdgesArgs = {
  filters?: InputMaybe<WorkGraphEdgeFilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryWorkGraphFlowArgs = {
  filters?: InputMaybe<WorkGraphEdgeFilterInput>;
  orgId: Scalars['String']['input'];
};


export type QueryWorkItemTeamAttributionsArgs = {
  orgId: Scalars['String']['input'];
  teamId?: InputMaybe<Scalars['String']['input']>;
  workItemIds?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryWorkUnitTeamAttributionsArgs = {
  orgId: Scalars['String']['input'];
  teamId?: InputMaybe<Scalars['String']['input']>;
  workUnitIds?: InputMaybe<Array<Scalars['String']['input']>>;
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

export type RepoCoverageBaseline = {
  __typename?: 'RepoCoverageBaseline';
  /** Mean branch coverage, in percent; the same rules as ``lineBaselinePct``. */
  branchBaselinePct?: Maybe<Scalars['Float']['output']>;
  /** Days of the 30 that hold a branch coverage value. */
  branchDays: Scalars['Int']['output'];
  /** Mean line coverage, in percent (0 to 100), over the days of the 30 that hold a value. Null = fewer than 7 such days (``lineDays``): then there is no baseline. Never 0 for "none", never the current value. */
  lineBaselinePct?: Maybe<Scalars['Float']['output']>;
  /** Days of the 30 that hold a line coverage value. */
  lineDays: Scalars['Int']['output'];
  repoId: Scalars['String']['output'];
  /** The repository's full name in the org's catalogue. Null = the catalogue holds no name; never the id. */
  repoName?: Maybe<Scalars['String']['output']>;
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

export type ReviewEdgeRow = {
  __typename?: 'ReviewEdgeRow';
  /** The stored identity of the author: the pull request's author e-mail address when there is one, else its author name, else "unknown". It can be an e-mail address. Deprecated in favour of authorName and authorKey (CHAOS-8485): a client that may not show an e-mail address must not select it. */
  author: Scalars['String']['output'];
  /** An opaque key of the author inside the org (CHAOS-8485); see reviewerKey. */
  authorKey: Scalars['String']['output'];
  /** The author's display name (CHAOS-8485): the display name of the org's identity the stored author belongs to; else, for an author stored by e-mail address, the author name the provider gave on the pull request; else the stored author itself when it is not an e-mail address. Never an e-mail address. Null = no name is known. */
  authorName?: Maybe<Scalars['String']['output']>;
  day: Scalars['Date']['output'];
  repoId?: Maybe<Scalars['String']['output']>;
  /** The stored identity of the reviewer: a provider login or a display name. Deprecated in favour of reviewerName and reviewerKey (CHAOS-8485); it stays for clients that still read it. */
  reviewer: Scalars['String']['output'];
  /** An opaque key of the reviewer inside the org (CHAOS-8485): the same person has the same key in every answer, as reviewer and as author when the identity resolves. It is not an e-mail address and not a name; use it only to tell people apart and to join rows. */
  reviewerKey: Scalars['String']['output'];
  /** The reviewer's display name (CHAOS-8485): the display name of the org's identity the stored reviewer belongs to; else the stored reviewer itself when it is not an e-mail address (a provider login). Never an e-mail address. Null = no name is known. */
  reviewerName?: Maybe<Scalars['String']['output']>;
  reviewsCount: Scalars['Int']['output'];
};

export type ReviewEdgesInput = {
  limit?: Scalars['Int']['input'];
  orgId: Scalars['String']['input'];
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  sinceDate: Scalars['Date']['input'];
  /** Team ids (CHAOS-7785). Narrows the edges to the repositories these teams OWN (team_repo_ownership, as of now); person membership is never read. Combined with ``repoIds`` the two both apply (a pair must be on a listed repository and on a team-owned one). */
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
  untilDate: Scalars['Date']['input'];
};

export type ReviewEdgesResult = {
  __typename?: 'ReviewEdgesResult';
  edges: Array<ReviewEdgeRow>;
  /** Number of deduplicated (pair, day) rows the filters match, before the ``limit`` cut (CHAOS-7786). One row is one reviewer-to-author pair on one day, so this counts rows, not distinct pairs. Never less than ``edges``. */
  totalCount: Scalars['Int']['output'];
  /** True when ``totalCount`` is greater than the number of ``edges`` returned: the list was cut by ``limit`` (CHAOS-7786). */
  truncated: Scalars['Boolean']['output'];
};

export type ReworkThemeAllocation = {
  __typename?: 'ReworkThemeAllocation';
  allocation: Scalars['Float']['output'];
  allocationPct: Scalars['Float']['output'];
  churnLoc: Scalars['Int']['output'];
  label: Scalars['String']['output'];
  prsMerged: Scalars['Int']['output'];
  theme: Scalars['String']['output'];
};

export type SankeyCoverage = {
  __typename?: 'SankeyCoverage';
  directRepoCoverage?: Maybe<Scalars['Float']['output']>;
  repoCoverage: Scalars['Float']['output'];
  repoFanoutReposPerUnit?: Maybe<Scalars['Float']['output']>;
  teamCoverage: Scalars['Float']['output'];
  teamFallbackRepoCoverage?: Maybe<Scalars['Float']['output']>;
};

export type SankeyEdge = {
  __typename?: 'SankeyEdge';
  source: Scalars['String']['output'];
  target: Scalars['String']['output'];
  value?: Maybe<Scalars['Float']['output']>;
};

export type SankeyNode = {
  __typename?: 'SankeyNode';
  dimension: Scalars['String']['output'];
  id: Scalars['String']['output'];
  label: Scalars['String']['output'];
  value?: Maybe<Scalars['Float']['output']>;
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
  unit: SankeyValueUnit;
};

export type SankeyValueUnit =
  | 'LOC'
  | 'WORK_UNITS';

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

export type ScopeEntityRef = {
  __typename?: 'ScopeEntityRef';
  displayName: Scalars['String']['output'];
  id: Scalars['String']['output'];
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

export type SummarySentence = {
  __typename?: 'SummarySentence';
  evidenceLink: Scalars['String']['output'];
  id: Scalars['String']['output'];
  text: Scalars['String']['output'];
};

export type TeamAttributionConfidence =
  | 'HIGH'
  | 'LOW'
  | 'MANUAL'
  | 'MEDIUM'
  | 'NONE';

export type TeamAttributionSource =
  | 'ASSIGNEE_MEMBERSHIP'
  | 'AUTHOR_MEMBERSHIP'
  | 'ISSUE_PROJECT'
  | 'LINKED_ISSUE'
  | 'MANUAL_FALLBACK'
  | 'NATIVE_TEAM'
  | 'PROJECT_OWNERSHIP'
  | 'REPO_OWNERSHIP'
  | 'UNASSIGNED';

export type TestOpsJobFailureGroup = {
  __typename?: 'TestOpsJobFailureGroup';
  /** The runs that failed (a failure, an error or a timeout). Always above 0: a group with no failed run is not served. */
  failedRuns: Scalars['Int']['output'];
  /** ``failedRuns / runs``: a share from 0 to 1, NOT a percent. Null = no run to divide by (not served today: every served group has a failed run). */
  failureRate?: Maybe<Scalars['Float']['output']>;
  jobName: Scalars['String']['output'];
  /** The CI provider of the runs, as the pipeline row stores it (for example ``github_actions``). Null = the job runs have no stored pipeline row. */
  provider?: Maybe<Scalars['String']['output']>;
  /** Job runs of this group that started in the window and reached a result (success, failure or cancelled). A skipped, queued or running job is not a run. */
  runs: Scalars['Int']['output'];
  /** The workflow (GitHub Actions) or pipeline (GitLab CI) name of the runs. Null = the job runs have no stored pipeline row, or the row has no name. */
  workflowName?: Maybe<Scalars['String']['output']>;
};

export type TestOpsJobFailuresInput = {
  /** Most groups to serve: 1 to 100. */
  limit?: Scalars['Int']['input'];
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  /** First day of the window (UTC), included. The day a job run started places it. */
  sinceDate: Scalars['Date']['input'];
  /** Team ids. Narrows the runs to the repositories these teams OWN (team_repo_ownership, as of now); person membership is never read. With ``repoIds`` both apply. */
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Last day of the window (UTC), included. At most 90 days after ``sinceDate`` (a "90 days" window of today minus 90 days to today is served); a later day, or a day before ``sinceDate``, is an error, not a cut answer. */
  untilDate: Scalars['Date']['input'];
};

export type TestOpsJobFailuresResult = {
  __typename?: 'TestOpsJobFailuresResult';
  /** The groups with the most failed runs first (then by job name, workflow name and provider), cut at ``limit``. */
  groups: Array<TestOpsJobFailureGroup>;
  /** Number of groups that match before the ``limit`` cut. Never less than ``groups``. */
  totalCount: Scalars['Int']['output'];
  /** True = ``totalCount`` is above the number of ``groups`` served. */
  truncated: Scalars['Boolean']['output'];
};

export type TestOpsRiskBreakdownItem = {
  __typename?: 'TestOpsRiskBreakdownItem';
  category: Scalars['String']['output'];
  hours: Scalars['Float']['output'];
};

export type TestOpsRiskInput = {
  endDate: Scalars['Date']['input'];
  startDate: Scalars['Date']['input'];
};

export type TestOpsRiskQuadrantPoint = {
  __typename?: 'TestOpsRiskQuadrantPoint';
  id: Scalars['String']['output'];
  pipelineSuccessRate?: Maybe<Scalars['Float']['output']>;
  testPassRate?: Maybe<Scalars['Float']['output']>;
};

export type TestOpsRiskResult = {
  __typename?: 'TestOpsRiskResult';
  confidenceDelta?: Maybe<Scalars['Float']['output']>;
  confidenceSpark: Array<TestOpsRiskSparkPoint>;
  dragDelta?: Maybe<Scalars['Float']['output']>;
  dragSpark: Array<TestOpsRiskSparkPoint>;
  orgId: Scalars['String']['output'];
  pipelineStability?: Maybe<Scalars['Float']['output']>;
  quadrantData: Array<TestOpsRiskQuadrantPoint>;
  qualityDragBreakdown: Array<TestOpsRiskBreakdownItem>;
  qualityDragHours?: Maybe<Scalars['Float']['output']>;
  releaseConfidence?: Maybe<Scalars['Float']['output']>;
  stabilityDelta?: Maybe<Scalars['Float']['output']>;
  stabilitySpark: Array<TestOpsRiskSparkPoint>;
  timeseries: Array<TestOpsRiskTrendPoint>;
};

export type TestOpsRiskSparkPoint = {
  __typename?: 'TestOpsRiskSparkPoint';
  ts: Scalars['Date']['output'];
  value: Scalars['Float']['output'];
};

export type TestOpsRiskTrendPoint = {
  __typename?: 'TestOpsRiskTrendPoint';
  date: Scalars['Date']['output'];
  riskScore: Scalars['Float']['output'];
};

export type ThresholdDirection =
  | 'ABOVE'
  | 'BELOW';

export type ThroughputEstimateCoverage = {
  __typename?: 'ThroughputEstimateCoverage';
  backlogSize: Scalars['Int']['output'];
  estimatedCount: Scalars['Int']['output'];
  ratio?: Maybe<Scalars['Float']['output']>;
  unestimatedCount: Scalars['Int']['output'];
};

export type ThroughputForecast = {
  __typename?: 'ThroughputForecast';
  backlogSize: Scalars['Int']['output'];
  computedAt: Scalars['String']['output'];
  estimateCoverage?: Maybe<ThroughputEstimateCoverage>;
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
  staleWip?: Maybe<ThroughputStaleWip>;
  teamId?: Maybe<Scalars['String']['output']>;
  wipCongestion: ThroughputRiskOverlay;
  workScopeId?: Maybe<Scalars['String']['output']>;
};

export type ThroughputForecastInput = {
  backlogSize?: InputMaybe<Scalars['Int']['input']>;
  historyWeeks?: Scalars['Int']['input'];
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
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

export type ThroughputStaleWip = {
  __typename?: 'ThroughputStaleWip';
  p50AgeHours?: Maybe<Scalars['Float']['output']>;
  p90AgeHours?: Maybe<Scalars['Float']['output']>;
};

export type TimeGranularity =
  | 'DAY'
  | 'WEEK';

export type TimeseriesBucket = {
  __typename?: 'TimeseriesBucket';
  date: Scalars['Date']['output'];
  value?: Maybe<Scalars['Float']['output']>;
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

export type WorkGraphArtifactRow = {
  __typename?: 'WorkGraphArtifactRow';
  degree: Scalars['Int']['output'];
  displayName?: Maybe<Scalars['String']['output']>;
  evidence?: Maybe<Scalars['String']['output']>;
  nodeId: Scalars['String']['output'];
  nodeType: WorkGraphNodeType;
};

export type WorkGraphArtifactsResult = {
  __typename?: 'WorkGraphArtifactsResult';
  degradedReason?: Maybe<Scalars['String']['output']>;
  isPartial: Scalars['Boolean']['output'];
  partialRepoIds: Array<Scalars['String']['output']>;
  partialScope?: Maybe<Scalars['String']['output']>;
  rows: Array<WorkGraphArtifactRow>;
};

export type WorkGraphEdgeFilterInput = {
  allowScopedPartial?: Scalars['Boolean']['input'];
  edgeType?: InputMaybe<WorkGraphEdgeTypeInput>;
  edgeTypes?: InputMaybe<Array<WorkGraphEdgeTypeInput>>;
  limit?: Scalars['Int']['input'];
  nodeId?: InputMaybe<Scalars['String']['input']>;
  repoIds?: InputMaybe<Array<Scalars['String']['input']>>;
  sourceType?: InputMaybe<WorkGraphNodeTypeInput>;
  subcategory?: InputMaybe<Scalars['String']['input']>;
  targetType?: InputMaybe<WorkGraphNodeTypeInput>;
  theme?: InputMaybe<Scalars['String']['input']>;
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
  sourceDisplayName?: Maybe<Scalars['String']['output']>;
  sourceId: Scalars['String']['output'];
  sourceType: WorkGraphNodeType;
  subcategory?: Maybe<Scalars['String']['output']>;
  targetDisplayName?: Maybe<Scalars['String']['output']>;
  targetId: Scalars['String']['output'];
  targetType: WorkGraphNodeType;
  theme?: Maybe<Scalars['String']['output']>;
};

export type WorkGraphEdgeType =
  | 'ASSIGNED_TO'
  | 'BLOCKS'
  | 'CHILD_OF'
  | 'CONFIG_CHANGED_BY'
  | 'CONTAINS'
  | 'DEPLOYS'
  | 'DUPLICATES'
  | 'ESCALATES_WITH'
  | 'FIXES'
  | 'GENERATES'
  | 'GUARDS'
  | 'HAS_AI_WORKFLOW'
  | 'HAS_ALERT'
  | 'HAS_INCIDENT'
  | 'HAS_RESPONDER'
  | 'HAS_REVIEW_OUTCOME'
  | 'HAS_TIMELINE_EVENT'
  | 'IMPACTS'
  | 'IMPLEMENTS'
  | 'INTRODUCED_BY'
  | 'IS_BLOCKED_BY'
  | 'IS_DUPLICATE_OF'
  | 'IS_RELATED_TO'
  | 'LINKED_INCIDENT'
  | 'MAPS_TO_REPOSITORY'
  | 'PARENT_OF'
  | 'REFERENCES'
  | 'RELATES'
  | 'REMEDIATED_BY'
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
  degradedReason?: Maybe<Scalars['String']['output']>;
  edges: Array<WorkGraphEdgeResult>;
  isPartial: Scalars['Boolean']['output'];
  pageInfo: PageInfo;
  partialRepoIds: Array<Scalars['String']['output']>;
  partialScope?: Maybe<Scalars['String']['output']>;
  totalCount: Scalars['Int']['output'];
};

export type WorkGraphFlowResult = {
  __typename?: 'WorkGraphFlowResult';
  degradedReason?: Maybe<Scalars['String']['output']>;
  isPartial: Scalars['Boolean']['output'];
  partialRepoIds: Array<Scalars['String']['output']>;
  partialScope?: Maybe<Scalars['String']['output']>;
  rows: Array<WorkGraphFlowRow>;
};

export type WorkGraphFlowRow = {
  __typename?: 'WorkGraphFlowRow';
  inflow: Scalars['Int']['output'];
  nodeType: WorkGraphNodeType;
  outflow: Scalars['Int']['output'];
};

export type WorkGraphNodeType =
  | 'AI_WORKFLOW_RUN'
  | 'COMMIT'
  | 'DEPLOYMENT'
  | 'DIFF'
  | 'ESCALATION_POLICY'
  | 'FEATURE_FLAG'
  | 'FILE'
  | 'INCIDENT'
  | 'INCIDENT_RESPONDER'
  | 'INCIDENT_TIMELINE_EVENT'
  | 'ISSUE'
  | 'OPERATIONAL_ALERT'
  | 'OPERATIONAL_SERVICE'
  | 'PR'
  | 'RELEASE'
  | 'REPOSITORY'
  | 'REVIEW_OUTCOME'
  | 'TEAM'
  | 'USER';

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

export type WorkItemTeamAttribution = {
  __typename?: 'WorkItemTeamAttribution';
  confidence: TeamAttributionConfidence;
  evidence: Scalars['String']['output'];
  isPrimary: Scalars['Boolean']['output'];
  provider: Scalars['String']['output'];
  source: TeamAttributionSource;
  teamId?: Maybe<Scalars['String']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
  workItemId: Scalars['String']['output'];
};

export type WorkUnitTeamAttribution = {
  __typename?: 'WorkUnitTeamAttribution';
  confidence: TeamAttributionConfidence;
  evidence: Scalars['String']['output'];
  isPrimary: Scalars['Boolean']['output'];
  memberCount: Scalars['Int']['output'];
  source: TeamAttributionSource;
  teamId?: Maybe<Scalars['String']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
  workUnitId: Scalars['String']['output'];
};
