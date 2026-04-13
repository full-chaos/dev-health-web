import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

// Must mock auth and graphqlFetch before importing the module under test
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/graphql/urqlClient", () => ({
  graphqlFetch: vi.fn(),
}));

import { fetchRiskMetrics, fetchTestOpsData, fetchCoverageMetrics } from "../fetchers";
import { SAMPLE_RISK_DATA } from "../sample-data";
import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/urqlClient";

function mockSession(orgId?: string): Session {
  return {
    access_token: "test-token",
    user: {
      id: "user-1",
      org_id: orgId,
    } as Session["user"],
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

const emptyAnalytics = { timeseries: [], breakdowns: [] };

describe("fetchRiskMetrics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns sample data when isTestMode is true", async () => {
    const result = await fetchRiskMetrics({ timeseries: [], breakdowns: [] }, true);
    expect(result).toEqual(SAMPLE_RISK_DATA);
  });

  it("returns undefined metrics when API returns empty timeseries", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("org-1"));
    vi.mocked(graphqlFetch).mockResolvedValue({ analytics: emptyAnalytics });

    const result = await fetchRiskMetrics({ timeseries: [], breakdowns: [] }, false);

    expect(result).not.toBeNull();
    expect(result!.release_confidence).toBeUndefined();
    expect(result!.quality_drag_hours).toBeUndefined();
    expect(result!.pipeline_stability).toBeUndefined();
    expect(result!.quality_drag_breakdown).toEqual([]);
    expect(result!.timeseries).toEqual([]);
  });

  it("sample data includes sparkline and delta fields for KPI cards", () => {
    expect(SAMPLE_RISK_DATA.confidence_spark.length).toBeGreaterThan(1);
    expect(SAMPLE_RISK_DATA.drag_spark.length).toBeGreaterThan(1);
    expect(SAMPLE_RISK_DATA.stability_spark.length).toBeGreaterThan(1);
    expect(typeof SAMPLE_RISK_DATA.confidence_delta).toBe("number");
    expect(typeof SAMPLE_RISK_DATA.drag_delta).toBe("number");
    expect(typeof SAMPLE_RISK_DATA.stability_delta).toBe("number");
  });
});

describe("resolveOrgId via fetchTestOpsData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("resolves orgId from session and passes it to graphqlFetch", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("org-session-123"));
    vi.mocked(graphqlFetch).mockResolvedValue({ analytics: emptyAnalytics });

    await fetchTestOpsData({ timeseries: [], breakdowns: [] }, false);

    expect(auth).toHaveBeenCalled();
    expect(graphqlFetch).toHaveBeenCalled();
    const firstCallVars = vi.mocked(graphqlFetch).mock.calls[0][1] as { orgId: string };
    expect(firstCallVars.orgId).toBe("org-session-123");
  });

  it("falls back to 'default-org' when session has no org_id", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(undefined));
    vi.mocked(graphqlFetch).mockResolvedValue({ analytics: emptyAnalytics });

    await fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false);

    const callVars = vi.mocked(graphqlFetch).mock.calls[0][1] as { orgId: string };
    expect(callVars.orgId).toBe("default-org");
  });

  it("uses orgIdOverride when provided, skipping auth lookup", async () => {
    vi.mocked(graphqlFetch).mockResolvedValue({ analytics: emptyAnalytics });

    await fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false, "org-override");

    expect(auth).not.toHaveBeenCalled();
    const callVars = vi.mocked(graphqlFetch).mock.calls[0][1] as { orgId: string };
    expect(callVars.orgId).toBe("org-override");
  });
});
