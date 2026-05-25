import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProductTelemetryDashboardViaGraphQL } from "../productTelemetryFetchers";

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
