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
