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
