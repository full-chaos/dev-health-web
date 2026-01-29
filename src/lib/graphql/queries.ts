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
