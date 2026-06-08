/**
 * GraphQL query definitions for Investment view.
 *
 * These queries are designed to replicate the data shapes
 * returned by the REST endpoints for feature-flag parity.
 */

// Query for fetching investment breakdown by theme and subcategory
export const INVESTMENT_BREAKDOWN_QUERY = `
query InvestmentBreakdown($orgId: String!, $batch: AnalyticsRequestInput!) {
  analytics(orgId: $orgId, batch: $batch) {
    breakdowns {
      dimension
      measure
      items {
        key
        value
      }
    }
  }
}
`;

// Query for fetching Sankey flow data
export const INVESTMENT_SANKEY_QUERY = `
query InvestmentSankey($orgId: String!, $batch: AnalyticsRequestInput!) {
  analytics(orgId: $orgId, batch: $batch) {
    sankey {
      nodes {
        id
        label
        dimension
        value
      }
      edges {
        source
        target
        value
      }
    }
  }
}
`;

// Query for fetching same-dimension flow matrix (team↔team, repo↔repo, work_type↔work_type).
// Backed by analytics.flowMatrix resolver (CHAOS-1289) — returns directional N×N data
// where source and target share a single dimension.
export const FLOW_MATRIX_QUERY = `
query FlowMatrix($orgId: String!, $batch: AnalyticsRequestInput!) {
  analytics(orgId: $orgId, batch: $batch) {
    flowMatrix {
      nodes {
        id
        label
        dimension
        value
      }
      edges {
        source
        target
        value
      }
    }
  }
}
`;

// Query for fetching filter dropdown values (catalog dimension values)
export const CATALOG_VALUES_QUERY = `
query CatalogValues($orgId: String!, $dimension: DimensionInput!) {
  catalog(orgId: $orgId, dimension: $dimension) {
    values {
      value
      count
    }
  }
}
`;

export const BUS_FACTOR_QUERY = `
query BusFactor($orgId: String!, $scope: BusFactorScopeInput = null) {
  busFactor(orgId: $orgId, scope: $scope) {
    orgId
    scope {
      repoId
      teamId
    }
    value
    evidenceSampleCount
    topMaintainers {
      author
      sharePercent
    }
    repos {
      repoId
      repoName
      value
      evidenceSampleCount
      topMaintainers {
        author
        sharePercent
      }
    }
  }
}
`;

// Compounding Risk surface (CHAOS-1642)
//
// Reads from compounding_risk_daily (CHAOS-1641). Every field carries enough
// audit data (weights, thresholds, raw inputs, normalized components) that the
// UI can render the score's full provenance without a second roundtrip.
export const COMPOUNDING_RISK_QUERY = `
query CompoundingRisk(
  $orgId: String!,
  $filter: CompoundingRiskFilterInput = null
) {
  compoundingRisk(orgId: $orgId, filter: $filter) {
    orgId
    breakout
    generatedAt
    rows {
      day
      scope
      scopeId
      scopeLabel
      score
      severity
      computedAt
      components {
        churnNorm
        complexityNorm
        ownershipNorm
        reviewNorm
        reworkChurn
        complexityDelta
        busFactor
        ownershipGini
        singleOwnerRatio
        reviewLatencyP90h
      }
      weights {
        churn
        complexity
        ownership
        review
      }
      thresholds {
        elevated
        high
      }
    }
    trend {
      day
      score
      severity
    }
  }
}
`;

// Combined query for investment view (breakdowns + sankey)
export const INVESTMENT_FULL_QUERY = `
query InvestmentFull($orgId: String!, $batch: AnalyticsRequestInput!) {
  analytics(orgId: $orgId, batch: $batch) {
    breakdowns {
      dimension
      measure
      items {
        key
        value
      }
    }
    sankey {
      nodes {
        id
        label
        dimension
        value
      }
      edges {
        source
        target
        value
      }
    }
  }
}
`;

// ==== Capacity Planning Queries ====

// Query for on-demand capacity forecast computation
export const CAPACITY_FORECAST_QUERY = `
query CapacityForecast($orgId: String!, $input: CapacityForecastInput) {
  capacityForecast(orgId: $orgId, input: $input) {
    forecastId
    computedAt
    teamId
    workScopeId
    backlogSize
    targetItems
    targetDate
    p50Date
    p85Date
    p95Date
    p50Days
    p85Days
    p95Days
    p50Items
    p85Items
    p95Items
    throughputMean
    throughputStddev
    historyDays
    insufficientHistory
    highVariance
  }
}
`;

export const THROUGHPUT_FORECAST_QUERY = `
query ThroughputForecast($orgId: String!, $input: ThroughputForecastInput!) {
  throughputForecast(orgId: $orgId, input: $input) {
    forecastId
    computedAt
    teamId
    workScopeId
    backlogSize
    historyWeeks
    p50Weeks
    p75Weeks
    p90Weeks
    insufficientHistory
    rollingWindows {
      windowWeeks
      meanWeeklyThroughput
      sampleCount
      insufficientHistory
    }
    primaryRisk {
      kind
      score
      label
      value
      threshold
      active
    }
    wipCongestion {
      kind
      score
      label
      value
      threshold
      active
    }
    reviewBottleneck {
      kind
      score
      label
      value
      threshold
      active
    }
    incidentLoad {
      kind
      score
      label
      value
      threshold
      active
    }
  }
}
`;

// Query for listing persisted capacity forecasts
export const CAPACITY_FORECASTS_QUERY = `
query CapacityForecasts($orgId: String!, $filters: CapacityForecastFilterInput) {
  capacityForecasts(orgId: $orgId, filters: $filters) {
    edges {
      node {
        forecastId
        computedAt
        teamId
        workScopeId
        backlogSize
        targetItems
        targetDate
        p50Date
        p85Date
        p95Date
        p50Days
        p85Days
        p95Days
        p50Items
        p85Items
        p95Items
        throughputMean
        throughputStddev
        historyDays
        insufficientHistory
        highVariance
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
}
`;

// ==== Operating Review Queries ====

export const OPERATING_REVIEW_QUERY = `
query OperatingReview($orgId: String!, $input: OperatingReviewInput!) {
  operatingReview(orgId: $orgId, input: $input) {
    orgId
    teamId
    weekStart
    priorWeekStart
    sections {
      key
      title
      changed
      improved
      worsened
      metrics {
        key
        label
        value
        unit
        delta {
          value
          priorValue
          absolute
          percent
          status
        }
      }
    }
    recommendations
    recommendationsEmptyState
  }
}
`;

export const WORK_GRAPH_EDGES_QUERY = `
query WorkGraphEdges($orgId: String!, $filters: WorkGraphEdgeFilterInput) {
  workGraphEdges(orgId: $orgId, filters: $filters) {
    edges {
      edgeId
      sourceType
      sourceId
      sourceDisplayName
      targetType
      targetId
      targetDisplayName
      edgeType
      provenance
      confidence
      evidence
      repoId
      provider
    }
    totalCount
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}
`;

// ==== Security Alert Queries ====

export const SECURITY_OVERVIEW_QUERY = `
query SecurityOverview($orgId: String!, $filters: SecurityAlertFilterInput) {
  securityOverview(orgId: $orgId, filters: $filters) {
    kpis {
      openTotal
      critical
      high
      meanDaysToFix30d
      openDelta30d
    }
    severityBreakdown {
      severity
      count
    }
    topRepos {
      repoId
      repoName
      repoUrl
      count
    }
    trend {
      day
      opened
      fixed
    }
  }
}
`;

// ==== AI Workflow Analytics Queries ====

export const AI_IMPACT_SUMMARY_QUERY = `
query AIImpactSummary($orgId: String!, $dateRange: AIDateRangeInput!, $scope: AIScopeInput) {
  aiImpactSummary(orgId: $orgId, dateRange: $dateRange, scope: $scope) {
    orgId
    startDate
    endDate
    totalPrs
    aiAssistedPrs
    agentCreatedPrs
    humanPrs
    unknownPrs
    aiAssistedPrRatio
    dataAvailable
    computedAt
    byBucket {
      bucket
      prsTotal
      prsMerged
      aiAssistedPrRatio
      agentCreatedPrCount
      cycleTimeAvgHours
      aiCycleTimeDeltaHours
      aiReviewAmplification
      reworkDragRate
      revertRate
      incidentDragRate
      testGapRate
      leverage {
        prsComponent
        cycleTimeComponent
        reviewComponent
        reworkComponent
        testComponent
        incidentComponent
      }
    }
    daily {
      bucket
      prsTotal
      prsMerged
      cycleTimeAvgHours
      reviewsPerPr
      changesRequestedPerPr
      reworkPrs
      reworkRate
      revertPrs
      revertRate
      incidentsCount
      incidentRate
      testGapPrs
      testGapRate
    }
  }
}
`;

export const AI_COMPARISON_QUERY = `
query AIComparison($orgId: String!, $dateRange: AIDateRangeInput!, $scope: AIScopeInput) {
  aiComparison(orgId: $orgId, dateRange: $dateRange, scope: $scope) {
    orgId
    startDate
    endDate
    dataAvailable
    aiSide {
      bucket
      prsTotal
      prsMerged
      cycleTimeAvgHours
      reviewsPerPr
      reworkRate
      revertRate
      testGapRate
      incidentRate
    }
    baselineSide {
      bucket
      prsTotal
      prsMerged
      cycleTimeAvgHours
      reviewsPerPr
      reworkRate
      revertRate
      testGapRate
      incidentRate
    }
    delta {
      cycleTimeDeltaHours
      reviewsPerPrDelta
      reworkRateDelta
      revertRateDelta
      testGapRateDelta
      incidentRateDelta
    }
  }
}
`;

export const AI_OPPORTUNITIES_QUERY = `
query AIOpportunities($orgId: String!, $scope: AIScopeInput, $limit: Int! = 5) {
  aiOpportunities(orgId: $orgId, scope: $scope, limit: $limit) {
    orgId
    detectorReady
    recommendations {
      opportunityId
      kind
      repoId
      teamId
      title
      rationale
      score
      evidenceRefs
      workGraphDrilldowns {
        rootType
        rootId
        label
      }
    }
  }
}
`;

export const AI_WORKFLOW_DRILLDOWN_QUERY = `
query AIWorkflowDrilldown($orgId: String!, $rootType: AIWorkflowRootTypeInput!, $rootId: String!, $depth: Int! = 3, $limit: Int! = 100) {
  aiWorkflowDrilldown(orgId: $orgId, rootType: $rootType, rootId: $rootId, depth: $depth, limit: $limit) {
    orgId
    rootType
    rootId
    partial
    dataAvailable
    nodes {
      nodeType
      nodeId
    }
    edges {
      edgeId
      sourceType
      sourceId
      targetType
      targetId
      edgeType
      confidence
      source
      evidence
      provider
      repoId
    }
  }
}
`;

export const SECURITY_ALERTS_QUERY = `
query SecurityAlerts($orgId: String!, $filters: SecurityAlertFilterInput, $pagination: SecurityPaginationInput) {
  securityAlerts(orgId: $orgId, filters: $filters, pagination: $pagination) {
    edges {
      node {
        alertId
        repoId
        repoName
        repoUrl
        source
        severity
        state
        packageName
        cveId
        url
        title
        description
        createdAt
        fixedAt
        dismissedAt
      }
      cursor
    }
    totalCount
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}
`;

// ---------------------------------------------------------------------------
// AI review-load and risk diagnostic views (CHAOS-1585)
// ---------------------------------------------------------------------------

export const AI_REVIEW_LOAD_QUERY = `
query AIReviewLoad($orgId: String!, $dateRange: AIDateRangeInput!, $scope: AIScopeInput) {
  aiReviewLoad(orgId: $orgId, dateRange: $dateRange, scope: $scope) {
    orgId
    startDate
    endDate
    dataAvailable
    byBucket {
      bucket
      prsTotal
      reviewsTotal
      reviewsPerPr
      changesRequestedPerPr
      reviewAmplification
      postFirstReviewPushesCount
      postFirstReviewPushesPerPr
    }
    daily {
      bucket
      prsTotal
      reviewsTotal
      reviewsPerPr
      changesRequestedPerPr
      reviewAmplification
      postFirstReviewPushesCount
      postFirstReviewPushesPerPr
    }
    reviewerConcentration {
      dataAvailable
      reviewerCount
      reviewerGini
    }
    missingStates {
      key
      title
      guidance
    }
  }
  aiComparison(orgId: $orgId, dateRange: $dateRange, scope: $scope) {
    orgId
    startDate
    endDate
    dataAvailable
    aiSide {
      bucket
      prsTotal
      prsMerged
      cycleTimeAvgHours
      reviewsPerPr
      reworkRate
      revertRate
      testGapRate
      incidentRate
    }
    baselineSide {
      bucket
      prsTotal
      prsMerged
      cycleTimeAvgHours
      reviewsPerPr
      reworkRate
      revertRate
      testGapRate
      incidentRate
    }
    delta {
      cycleTimeDeltaHours
      reviewsPerPrDelta
      reworkRateDelta
      revertRateDelta
      testGapRateDelta
      incidentRateDelta
    }
  }
}
`;

export const AI_RISK_BREAKDOWN_QUERY = `
query AIRiskBreakdown($orgId: String!, $dateRange: AIDateRangeInput!, $scope: AIScopeInput) {
  aiRiskBreakdown(orgId: $orgId, dateRange: $dateRange, scope: $scope) {
    orgId
    startDate
    endDate
    dataAvailable
    byBucket {
      bucket
      prsTotal
      reworkPrs
      reworkRate
      revertPrs
      revertRate
      testGapPrs
      testGapRate
      incidentsCount
      incidentRate
    }
    missingStates {
      key
      title
      guidance
    }
  }
  aiComparison(orgId: $orgId, dateRange: $dateRange, scope: $scope) {
    orgId
    startDate
    endDate
    dataAvailable
    aiSide {
      bucket
      prsTotal
      prsMerged
      cycleTimeAvgHours
      reviewsPerPr
      reworkRate
      revertRate
      testGapRate
      incidentRate
    }
    baselineSide {
      bucket
      prsTotal
      prsMerged
      cycleTimeAvgHours
      reviewsPerPr
      reworkRate
      revertRate
      testGapRate
      incidentRate
    }
    delta {
      cycleTimeDeltaHours
      reviewsPerPrDelta
      reworkRateDelta
      revertRateDelta
      testGapRateDelta
      incidentRateDelta
    }
  }
}
`;

export const AI_GOVERNANCE_SUMMARY_QUERY = `
query AIGovernanceSummary($orgId: String!, $dateRange: AIDateRangeInput!, $scope: AIScopeInput, $violationLimit: Int! = 50) {
  aiGovernanceSummary(orgId: $orgId, dateRange: $dateRange, scope: $scope, violationLimit: $violationLimit) {
    orgId
    startDate
    endDate
    dataAvailable
    recentViolations {
      ruleId
      severity
      subjectType
      subjectId
      teamId
      repoId
      observedAt
      evidence
    }
  }
}
`;

// ---------------------------------------------------------------------------
// AI-attributed PR drilldown selector (CHAOS-1738/1739)
// ---------------------------------------------------------------------------

export const AI_ATTRIBUTED_PRS_QUERY = `
query AIAttributedPrs($orgId: String!, $dateRange: AIDateRangeInput!, $scope: AIScopeInput, $limit: Int! = 50, $offset: Int! = 0) {
  aiAttributedPrs(orgId: $orgId, dateRange: $dateRange, scope: $scope, limit: $limit, offset: $offset) {
    orgId
    startDate
    endDate
    total
    hasMore
    dataAvailable
    rows {
      repoId
      number
      title
      kind
      workType
      teamId
      mergedAt
    }
  }
}
`;

// ==== Complexity Queries (CHAOS-1745) ====

// Query for complexity timeseries — repo-level cyclomatic complexity over time.
// Backed by repo_complexity_daily (CHAOS-1756).
export const COMPLEXITY_TIMESERIES_QUERY = `
query ComplexityTimeseries($input: ComplexityTimeseriesInput!) {
  complexityTimeseries(input: $input) {
    points {
      date
      scopeId
      scopeName
      locTotal
      cyclomaticPerKloc
      cyclomaticTotal
      cyclomaticAvg
      highComplexityFunctions
      veryHighComplexityFunctions
    }
    totalScope
  }
}
`;

// Query for file hotspots — top N files ranked by risk_score (churn × complexity).
// Backed by file_hotspot_daily (CHAOS-1756).
export const HOTSPOTS_QUERY = `
query Hotspots($input: HotspotsInput!) {
  hotspots(input: $input) {
    rows {
      filePath
      repoId
      repoName
      churnLoc30d
      churnCommits30d
      cyclomaticTotal
      cyclomaticAvg
      blameConcentration
      riskScore
      evidenceUrl
    }
  }
}
`;

// ==== Cognitive Load Queries (CHAOS-2077) ====

// Daily cognitive-load signals: PR interruption load, context spread, review request load,
// after-hours and weekend commit ratios. Backed by user_metrics_daily and team_metrics_daily.
export const COGNITIVE_LOAD_QUERY = `
query CognitiveLoad($input: CognitiveLoadInput!) {
  cognitiveLoad(input: $input) {
    orgId
    teamId
    totalDays
    signals {
      day
      prInterruptionLoad
      contextSpreadCount
      reviewRequestLoad
      afterHoursCommitRatio
      weekendCommitRatio
    }
  }
}
`;

// ==== Review Edges Queries (CHAOS-2077) ====

// Reviewer→author collaboration edges from review_edges_daily.
// Used by the Work-Graph "Review Network" tab.
export const REVIEW_EDGES_QUERY = `
query ReviewEdges($input: ReviewEdgesInput!) {
  reviewEdges(input: $input) {
    edges {
      reviewer
      author
      reviewsCount
      day
      repoId
    }
    totalCount
  }
}
`;
