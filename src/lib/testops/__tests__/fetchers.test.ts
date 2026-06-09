import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock auth and graphqlFetch before importing the module under test
vi.mock("@/lib/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/lib/graphql/urqlClient", () => ({
    graphqlFetch: vi.fn(),
}));

import {
    fetchRiskMetrics,
    fetchTestOpsData,
    fetchCoverageMetrics,
    normalizeAnalyticsDurations,
} from "../fetchers";
import { SAMPLE_RISK_DATA } from "../sample-data";
import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import { mockAuth } from "@/test/mocks/auth";

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
        mockAuth({ user: { org_id: "org-1" } });
        vi.mocked(graphqlFetch).mockResolvedValue({ analytics: emptyAnalytics });

        const result = await fetchRiskMetrics({ timeseries: [], breakdowns: [] }, false);

        expect(result).not.toBeNull();
        expect(result!.release_confidence).toBeUndefined();
        expect(result!.quality_drag_hours).toBeUndefined();
        expect(result!.pipeline_stability).toBeUndefined();
        expect(result!.quality_drag_breakdown).toEqual([]);
        expect(result!.quadrant_data).toEqual([]);
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
        mockAuth({ user: { org_id: "org-session-123" } });
        vi.mocked(graphqlFetch).mockResolvedValue({ analytics: emptyAnalytics });

        await fetchTestOpsData({ timeseries: [], breakdowns: [] }, false);

        expect(auth).toHaveBeenCalled();
        expect(graphqlFetch).toHaveBeenCalled();
        const firstCallVars = vi.mocked(graphqlFetch).mock.calls[0][1] as {
            orgId: string;
        };
        expect(firstCallVars.orgId).toBe("org-session-123");
    });

    it("falls back to 'default-org' when session has no org_id", async () => {
        mockAuth({ user: { org_id: undefined } });
        vi.mocked(graphqlFetch).mockResolvedValue({ analytics: emptyAnalytics });

        await fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false);

        const callVars = vi.mocked(graphqlFetch).mock.calls[0][1] as {
            orgId: string;
        };
        expect(callVars.orgId).toBe("default-org");
    });

    it("uses orgIdOverride when provided, skipping auth lookup", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({ analytics: emptyAnalytics });

        await fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false, "org-override");

        expect(auth).not.toHaveBeenCalled();
        const callVars = vi.mocked(graphqlFetch).mock.calls[0][1] as {
            orgId: string;
        };
        expect(callVars.orgId).toBe("org-override");
    });
});

describe("fetchCoverageMetrics schema hardening (CHAOS-2078)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("fails closed with empty analytics when the backend returns a malformed shape", async () => {
        mockAuth({ user: { org_id: "org-1" } });
        // Real-data hazard: backend returns a null nested array that would
        // otherwise crash the coverage page's lineCoverageSeries.buckets.map().
        vi.mocked(graphqlFetch).mockResolvedValue({
            analytics: {
                timeseries: [
                    {
                        dimension: "TEAM",
                        dimensionValue: "x",
                        measure: "COVERAGE_LINE_PCT",
                        buckets: null,
                    },
                ],
                breakdowns: [],
            },
        });

        const result = await fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false);

        expect(result).toEqual(emptyAnalytics);
    });

    it("returns parsed analytics for a well-formed response", async () => {
        mockAuth({ user: { org_id: "org-1" } });
        const good = {
            timeseries: [
                {
                    dimension: "TEAM",
                    dimensionValue: "x",
                    measure: "COVERAGE_LINE_PCT",
                    buckets: [{ date: "2026-01-01", value: 80 }],
                },
            ],
            breakdowns: [],
        };
        vi.mocked(graphqlFetch).mockResolvedValue({ analytics: good });

        const result = await fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false);

        expect(result).toEqual(good);
    });
});

// ---------------------------------------------------------------------------
// normalizeAnalyticsDurations (C1 regression guard)
// ---------------------------------------------------------------------------

describe("normalizeAnalyticsDurations", () => {
    it("converts PIPELINE_DURATION_P95 bucket values from seconds to minutes", () => {
        const input = {
            timeseries: [
                {
                    dimension: "TEAM",
                    dimensionValue: "all",
                    measure: "PIPELINE_DURATION_P95",
                    buckets: [
                        { date: "2024-01-01", value: 720 }, // 720s = 12 min
                        { date: "2024-01-02", value: 600 }, // 600s = 10 min
                    ],
                },
            ],
            breakdowns: [],
        };
        const result = normalizeAnalyticsDurations(input);
        const ts = result.timeseries[0];
        expect(ts.buckets[0].value).toBeCloseTo(12);
        expect(ts.buckets[1].value).toBeCloseTo(10);
    });

    it("converts PIPELINE_QUEUE_TIME and TEST_SUITE_DURATION_P95 values", () => {
        const input = {
            timeseries: [
                {
                    dimension: "TEAM",
                    dimensionValue: "all",
                    measure: "PIPELINE_QUEUE_TIME",
                    buckets: [{ date: "2024-01-01", value: 60 }], // 60s = 1 min
                },
                {
                    dimension: "TEAM",
                    dimensionValue: "all",
                    measure: "TEST_SUITE_DURATION_P95",
                    buckets: [{ date: "2024-01-01", value: 258 }], // 258s = 4.3 min
                },
            ],
            breakdowns: [],
        };
        const result = normalizeAnalyticsDurations(input);
        expect(result.timeseries[0].buckets[0].value).toBeCloseTo(1);
        expect(result.timeseries[1].buckets[0].value).toBeCloseTo(4.3);
    });

    it("does NOT convert non-duration measures (e.g. PIPELINE_SUCCESS_RATE)", () => {
        const input = {
            timeseries: [
                {
                    dimension: "TEAM",
                    dimensionValue: "all",
                    measure: "PIPELINE_SUCCESS_RATE",
                    buckets: [{ date: "2024-01-01", value: 92 }],
                },
            ],
            breakdowns: [],
        };
        const result = normalizeAnalyticsDurations(input);
        // Value must remain 92 — dividing by 60 would corrupt the percentage
        expect(result.timeseries[0].buckets[0].value).toBe(92);
    });

    it("sample data passthrough — 12 stays 12 (not converted a second time)", () => {
        // Sample PIPELINE_DURATION_P95 last value is 12 (already in minutes).
        // normalizeAnalyticsDurations is NOT called on sample data paths;
        // this test guards against accidental double-conversion if it were.
        const sampleLike = {
            timeseries: [
                {
                    dimension: "TEAM",
                    dimensionValue: "all",
                    measure: "PIPELINE_SUCCESS_RATE", // non-duration, must pass through
                    buckets: [{ date: "2024-01-07", value: 91 }],
                },
            ],
            breakdowns: [],
        };
        const result = normalizeAnalyticsDurations(sampleLike);
        expect(result.timeseries[0].buckets[0].value).toBe(91);
    });

    it("returns empty timeseries unchanged", () => {
        const input = { timeseries: [], breakdowns: [] };
        expect(normalizeAnalyticsDurations(input)).toEqual(input);
    });
});
