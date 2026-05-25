import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getProductTelemetryDashboardViaGraphQL,
  getProductTelemetryPlatformDashboardViaGraphQL,
} from "../productTelemetryFetchers";

vi.mock("../server", () => ({
  graphqlFetch: vi.fn(),
}));

import { graphqlFetch } from "../server";

const mockedFetch = vi.mocked(graphqlFetch);

describe("getProductTelemetryDashboardViaGraphQL", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("requests all product telemetry dashboard sections", async () => {
    mockedFetch.mockResolvedValueOnce({
      productTelemetryDashboard: {
        dailyActiveUsers: [],
        topRoutes: [],
        featureViews: [],
        filterChanges: [],
        chartInteractions: [],
        clientErrors: [],
        sessionSummary: {},
      },
    });

    await getProductTelemetryDashboardViaGraphQL({
      orgId: "org-1",
      startDate: "2026-05-01",
      endDate: "2026-05-25",
    });

    const callArgs = mockedFetch.mock.calls[0];
    expect(callArgs[0]).toContain("productTelemetryDashboard");
    expect(callArgs[0]).toContain("dailyActiveUsers");
    expect(callArgs[0]).toContain("topRoutes");
    expect(callArgs[0]).toContain("featureViews");
    expect(callArgs[0]).toContain("filterChanges");
    expect(callArgs[0]).toContain("chartInteractions");
    expect(callArgs[0]).toContain("clientErrors");
    expect(callArgs[0]).toContain("sessionSummary");
    expect(callArgs[1]).toEqual({
      orgId: "org-1",
      input: { startDate: "2026-05-01", endDate: "2026-05-25" },
    });
    expect(callArgs[2]).toEqual({ orgId: "org-1" });
  });
});

describe("getProductTelemetryPlatformDashboardViaGraphQL", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("requests all platform dashboard sections and returns the platform payload", async () => {
    const platformDashboard = {
      totals: {
        activeOrgs: 12,
        anonymousUsers: 345,
        sessions: 789,
        events: 1234,
      },
      dailyActiveUsers: [],
      topRoutes: [],
      featureViews: [],
      filterChanges: [],
      chartInteractions: [],
      clientErrors: [],
      sessionSummary: {
        p50DurationMs: 120,
        p75DurationMs: 250,
        p90DurationMs: 480,
        p95DurationMs: 700,
        avgPagesViewed: 3.2,
        avgInteractions: 8.4,
      },
      topOrgs: [
        {
          orgIdHash: "hash-1",
          events: 444,
          sessions: 222,
          anonymousUsers: 111,
          orgId: "org-1",
          orgName: "Acme Corp",
          orgSlug: "acme",
        },
      ],
    };

    mockedFetch.mockResolvedValueOnce({
      productTelemetryPlatformDashboard: platformDashboard,
    });

    const result = await getProductTelemetryPlatformDashboardViaGraphQL({
      startDate: "2026-05-01",
      endDate: "2026-05-25",
    });

    const callArgs = mockedFetch.mock.calls[0];
    expect(callArgs[0]).toContain("productTelemetryPlatformDashboard");
    expect(callArgs[0]).toContain("totals");
    expect(callArgs[0]).toContain("topOrgs");
    expect(callArgs[0]).toContain("dailyActiveUsers");
    expect(callArgs[0]).toContain("topRoutes");
    expect(callArgs[0]).toContain("featureViews");
    expect(callArgs[0]).toContain("filterChanges");
    expect(callArgs[0]).toContain("chartInteractions");
    expect(callArgs[0]).toContain("clientErrors");
    expect(callArgs[0]).toContain("sessionSummary");
    expect(callArgs[1]).toEqual({
      input: { startDate: "2026-05-01", endDate: "2026-05-25" },
    });
    expect(callArgs[2]).toEqual({ orgId: "" });
    expect(result).toEqual(platformDashboard);
    expect(result.totals).toEqual({
      activeOrgs: 12,
      anonymousUsers: 345,
      sessions: 789,
      events: 1234,
    });
    expect(result.topOrgs).toEqual([
      {
        orgIdHash: "hash-1",
        events: 444,
        sessions: 222,
        anonymousUsers: 111,
        orgId: "org-1",
        orgName: "Acme Corp",
        orgSlug: "acme",
      },
    ]);
  });
});
