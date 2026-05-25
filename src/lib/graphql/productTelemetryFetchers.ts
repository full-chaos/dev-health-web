import { graphqlFetch } from "./server";

export const PRODUCT_TELEMETRY_DASHBOARD_QUERY = `
query ProductTelemetryDashboard($orgId: String!, $input: ProductTelemetryDashboardInput!) {
  productTelemetryDashboard(orgId: $orgId, input: $input) {
    dailyActiveUsers {
      day
      activeAnonymousUsers
    }
    topRoutes {
      routePattern
      events
      sessions
      anonymousUsers
    }
    featureViews {
      feature
      surface
      views
      anonymousUsers
    }
    filterChanges {
      view
      filterKey
      changes
      avgValueCount
    }
    chartInteractions {
      chart
      action
      surface
      interactions
      sessions
    }
    clientErrors {
      routePattern
      boundary
      errorClass
      errors
      affectedAnonymousUsers
    }
    sessionSummary {
      p50DurationMs
      p75DurationMs
      p90DurationMs
      p95DurationMs
      avgPagesViewed
      avgInteractions
    }
  }
}
`;

export type ProductTelemetryDashboardData = {
  dailyActiveUsers: Array<{ day: string; activeAnonymousUsers: number }>;
  topRoutes: Array<{
    routePattern: string;
    events: number;
    sessions: number;
    anonymousUsers: number;
  }>;
  featureViews: Array<{
    feature: string;
    surface: string;
    views: number;
    anonymousUsers: number;
  }>;
  filterChanges: Array<{
    view: string;
    filterKey: string;
    changes: number;
    avgValueCount?: number | null;
  }>;
  chartInteractions: Array<{
    chart: string;
    action: string;
    surface: string;
    interactions: number;
    sessions: number;
  }>;
  clientErrors: Array<{
    routePattern: string;
    boundary: string;
    errorClass: string;
    errors: number;
    affectedAnonymousUsers: number;
  }>;
  sessionSummary: {
    p50DurationMs?: number | null;
    p75DurationMs?: number | null;
    p90DurationMs?: number | null;
    p95DurationMs?: number | null;
    avgPagesViewed?: number | null;
    avgInteractions?: number | null;
  };
};

type ProductTelemetryDashboardResponse = {
  productTelemetryDashboard: ProductTelemetryDashboardData;
};

type ProductTelemetryDashboardParams = {
  orgId: string;
  startDate: string;
  endDate: string;
};

export async function getProductTelemetryDashboardViaGraphQL({
  orgId,
  startDate,
  endDate,
}: ProductTelemetryDashboardParams): Promise<ProductTelemetryDashboardData> {
  const response = await graphqlFetch<ProductTelemetryDashboardResponse>(
    PRODUCT_TELEMETRY_DASHBOARD_QUERY,
    { orgId, input: { startDate, endDate } },
    { orgId },
  );

  return response.productTelemetryDashboard;
}

// =============================================================================
// Platform-admin (cross-org) dashboard. Requires is_superuser on the backend.
// Reuses the same per-section shapes as the per-org dashboard so the existing
// ProductTelemetryDashboard component can render the section payloads, while
// the totals + topOrgs rollups feed the Super-admin overview.
// =============================================================================

export const PRODUCT_TELEMETRY_PLATFORM_DASHBOARD_QUERY = `
query ProductTelemetryPlatformDashboard($input: ProductTelemetryDashboardInput!) {
  productTelemetryPlatformDashboard(input: $input) {
    totals {
      activeOrgs
      anonymousUsers
      sessions
      events
    }
    dailyActiveUsers {
      day
      activeAnonymousUsers
    }
    topRoutes {
      routePattern
      events
      sessions
      anonymousUsers
    }
    featureViews {
      feature
      surface
      views
      anonymousUsers
    }
    filterChanges {
      view
      filterKey
      changes
      avgValueCount
    }
    chartInteractions {
      chart
      action
      surface
      interactions
      sessions
    }
    clientErrors {
      routePattern
      boundary
      errorClass
      errors
      affectedAnonymousUsers
    }
    sessionSummary {
      p50DurationMs
      p75DurationMs
      p90DurationMs
      p95DurationMs
      avgPagesViewed
      avgInteractions
    }
    topOrgs {
      orgIdHash
      events
      sessions
      anonymousUsers
      orgId
      orgName
      orgSlug
    }
  }
}
`;

export type ProductTelemetryPlatformTotals = {
  activeOrgs: number;
  anonymousUsers: number;
  sessions: number;
  events: number;
};

export type ProductTelemetryTopOrg = {
  orgIdHash: string;
  events: number;
  sessions: number;
  anonymousUsers: number;
  orgId?: string | null;
  orgName?: string | null;
  orgSlug?: string | null;
};

export type ProductTelemetryPlatformDashboardData = ProductTelemetryDashboardData & {
  totals: ProductTelemetryPlatformTotals;
  topOrgs: ProductTelemetryTopOrg[];
};

type ProductTelemetryPlatformDashboardResponse = {
  productTelemetryPlatformDashboard: ProductTelemetryPlatformDashboardData;
};

type ProductTelemetryPlatformDashboardParams = {
  startDate: string;
  endDate: string;
};

export async function getProductTelemetryPlatformDashboardViaGraphQL({
  startDate,
  endDate,
}: ProductTelemetryPlatformDashboardParams): Promise<ProductTelemetryPlatformDashboardData> {
  // No orgId — the resolver is gated by is_superuser and aggregates across
  // every tenant. The graphqlFetch helper still receives an empty orgId so
  // existing org-scoped middleware doesn't reject the call.
  const response = await graphqlFetch<ProductTelemetryPlatformDashboardResponse>(
    PRODUCT_TELEMETRY_PLATFORM_DASHBOARD_QUERY,
    { input: { startDate, endDate } },
    { orgId: "" },
  );

  return response.productTelemetryPlatformDashboard;
}
