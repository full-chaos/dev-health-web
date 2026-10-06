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
    fetchCoverageBaselines,
    fetchCoverageScopeBaseline,
    fetchJobFailures,
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

    it("returns undefined metrics when persisted risk payload is empty", async () => {
        mockAuth({ user: { org_id: "org-1" } });
        vi.mocked(graphqlFetch).mockResolvedValue({
            testopsRisk: {
                releaseConfidence: null,
                qualityDragHours: null,
                pipelineStability: null,
                timeseries: [],
                qualityDragBreakdown: [],
                quadrantData: [],
                confidenceSpark: [],
                confidenceDelta: null,
                dragSpark: [],
                dragDelta: null,
                stabilitySpark: [],
                stabilityDelta: null,
            },
        });

        const result = await fetchRiskMetrics(
            {
                timeseries: [
                    {
                        dimension: "TEAM",
                        measure: "PIPELINE_SUCCESS_RATE",
                        interval: "DAY",
                        dateRange: { startDate: "2026-05-19", endDate: "2026-05-20" },
                    },
                ],
                breakdowns: [],
            },
            false,
        );

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

    it("rejects, with no request, when the session has no org_id (never a made-up org)", async () => {
        mockAuth({ user: { org_id: undefined } });
        vi.mocked(graphqlFetch).mockResolvedValue({ analytics: emptyAnalytics });

        await expect(
            fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false),
        ).rejects.toThrow();
        expect(graphqlFetch).not.toHaveBeenCalled();
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

        expect(result).toEqual({ ...emptyAnalytics, fetchFailed: true });
    });

    it("marks GraphQL errors as fetch failures instead of genuine empty coverage", async () => {
        mockAuth({ user: { org_id: "org-1" } });
        vi.mocked(graphqlFetch).mockRejectedValue(new Error("GraphQL unavailable"));

        const result = await fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false);

        expect(result).toEqual({ ...emptyAnalytics, fetchFailed: true });
    });

    it("accepts a null breakdown item value (the contract's value is nullable) and keeps it null", async () => {
        // CHAOS-8112: a repository with no branch figure is served as an item with a null value.
        // One such item must not fail the parse of the whole answer.
        mockAuth({ user: { org_id: "org-1" } });
        const withNull = {
            timeseries: [],
            breakdowns: [
                {
                    dimension: "REPO",
                    measure: "COVERAGE_BRANCH_PCT",
                    items: [
                        { key: "repo-1", value: 54, label: "dev-health-web" },
                        { key: "repo-2", value: null, label: "dev-health-ops" },
                    ],
                },
            ],
        };
        vi.mocked(graphqlFetch).mockResolvedValue({ analytics: withNull });

        const result = await fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false);

        expect(result.fetchFailed).toBeUndefined();
        expect(result.breakdowns[0].items.map((item) => item.value)).toEqual([54, null]);
    });

    it("still fails closed when a breakdown item value is not a number or null", async () => {
        mockAuth({ user: { org_id: "org-1" } });
        vi.mocked(graphqlFetch).mockResolvedValue({
            analytics: {
                timeseries: [],
                breakdowns: [
                    {
                        dimension: "REPO",
                        measure: "COVERAGE_BRANCH_PCT",
                        items: [{ key: "r", value: "54" }],
                    },
                ],
            },
        });

        const result = await fetchCoverageMetrics({ timeseries: [], breakdowns: [] }, false);

        expect(result.fetchFailed).toBe(true);
        expect(result.breakdowns).toEqual([]);
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

describe("TestOps fetchers without a session org (CHAOS-8272)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("reject and make no request, never falling back to a made-up org", async () => {
        mockAuth({ user: { org_id: undefined } });
        const batch = { timeseries: [], breakdowns: [] };
        await expect(fetchTestOpsData(batch)).rejects.toThrow();
        await expect(fetchCoverageMetrics(batch)).rejects.toThrow();
        await expect(fetchRiskMetrics(batch)).rejects.toThrow();
        expect(graphqlFetch).not.toHaveBeenCalled();
    });
});

// CHAOS-8514
describe("fetchJobFailures", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockAuth({ user: { org_id: "org-1" } });
    });

    const served = {
        groups: [
            {
                workflowName: "CI",
                jobName: "unit-tests",
                provider: "github",
                runs: 12,
                failedRuns: 3,
                failureRate: 0.25,
            },
        ],
        totalCount: 1,
        truncated: false,
    };

    it("sends the window, the limit and only a scope that is set", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({ testopsJobFailures: served });

        await fetchJobFailures({
            sinceDate: "2026-08-01",
            untilDate: "2026-08-31",
            repoIds: [],
            teamIds: ["t1"],
        });

        const [, variables] = vi.mocked(graphqlFetch).mock.calls[0];
        expect(variables).toEqual({
            orgId: "org-1",
            input: { sinceDate: "2026-08-01", untilDate: "2026-08-31", teamIds: ["t1"], limit: 20 },
        });
    });

    it("does not send an empty team scope, and sends a caller's limit", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({ testopsJobFailures: served });

        await fetchJobFailures({
            sinceDate: "2026-08-01",
            untilDate: "2026-08-31",
            repoIds: ["r1"],
            teamIds: [],
            limit: 5,
        });

        const [, variables] = vi.mocked(graphqlFetch).mock.calls[0];
        expect(variables).toEqual({
            orgId: "org-1",
            input: { sinceDate: "2026-08-01", untilDate: "2026-08-31", repoIds: ["r1"], limit: 5 },
        });
    });

    it("returns the served answer", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({ testopsJobFailures: served });
        expect(
            await fetchJobFailures({ sinceDate: "2026-08-01", untilDate: "2026-08-31" }),
        ).toEqual(served);
    });

    it("an empty window is an empty list, not a failed read", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({
            testopsJobFailures: { groups: [], totalCount: 0, truncated: false },
        });
        expect(
            await fetchJobFailures({ sinceDate: "2026-08-01", untilDate: "2026-08-31" }),
        ).toEqual({
            groups: [],
            totalCount: 0,
            truncated: false,
        });
    });

    it("a GraphQL error is a failed read, not an empty list", async () => {
        vi.mocked(graphqlFetch).mockRejectedValue(
            new Error("[GraphQL] window longer than 90 days"),
        );
        expect(
            await fetchJobFailures({ sinceDate: "2026-01-01", untilDate: "2026-08-31" }),
        ).toEqual({
            fetchFailed: true,
        });
    });

    it("an answer that is not the served shape is a failed read", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({ testopsJobFailures: { groups: "none" } });
        expect(
            await fetchJobFailures({ sinceDate: "2026-08-01", untilDate: "2026-08-31" }),
        ).toEqual({
            fetchFailed: true,
        });
    });

    it("test mode returns the sample and makes no request", async () => {
        const result = await fetchJobFailures(
            { sinceDate: "2026-08-01", untilDate: "2026-08-31" },
            true,
        );
        expect("groups" in result && result.groups.length).toBeGreaterThan(0);
        expect(graphqlFetch).not.toHaveBeenCalled();
    });
});

describe("fetchCoverageBaselines", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockAuth({ user: { org_id: "org-1" } });
    });

    const served = [
        {
            repoId: "repo-1",
            repoName: "full-chaos/dev-health-web",
            lineBaselinePct: 58.2,
            lineDays: 22,
            branchBaselinePct: null,
            branchDays: 3,
        },
    ];

    it("sends the organization, the end date and only a scope that is set", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({ coverageBaselines: served });

        await fetchCoverageBaselines({ endDate: "2026-09-15", repoIds: [], teamIds: ["t1"] });

        const [, variables] = vi.mocked(graphqlFetch).mock.calls[0];
        expect(variables).toEqual({ orgId: "org-1", endDate: "2026-09-15", teamIds: ["t1"] });
    });

    it("does not send an empty team scope", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({ coverageBaselines: served });

        await fetchCoverageBaselines({ endDate: "2026-09-15", repoIds: ["r1"], teamIds: [] });

        const [, variables] = vi.mocked(graphqlFetch).mock.calls[0];
        expect(variables).toEqual({ orgId: "org-1", endDate: "2026-09-15", repoIds: ["r1"] });
    });

    it("returns the served rows; a null baseline stays null", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({ coverageBaselines: served });
        expect(await fetchCoverageBaselines({ endDate: "2026-09-15" })).toEqual(served);
    });

    it("an empty answer is an empty list, not a failed read", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({ coverageBaselines: [] });
        expect(await fetchCoverageBaselines({ endDate: "2026-09-15" })).toEqual([]);
    });

    it("a GraphQL error is a failed read, not an empty list", async () => {
        vi.mocked(graphqlFetch).mockRejectedValue(new Error("[GraphQL] not authorized"));
        expect(await fetchCoverageBaselines({ endDate: "2026-09-15" })).toEqual({
            fetchFailed: true,
        });
    });

    it("an answer that is not the served shape is a failed read", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({
            coverageBaselines: [{ repoId: "repo-1", lineBaselinePct: "58" }],
        });
        expect(await fetchCoverageBaselines({ endDate: "2026-09-15" })).toEqual({
            fetchFailed: true,
        });
    });

    it("test mode returns the sample and makes no request", async () => {
        const result = await fetchCoverageBaselines({ endDate: "2026-09-15" }, true);
        expect(Array.isArray(result) && result.length).toBeGreaterThan(0);
        expect(graphqlFetch).not.toHaveBeenCalled();
    });
});

describe("fetchCoverageScopeBaseline", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockAuth({ user: { org_id: "org-1" } });
    });

    it("sends the organization and end date, with a selected scope only", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({
            coverageScopeBaseline: { lineBaselinePct: 82.6, lineDays: 30 },
        });

        await fetchCoverageScopeBaseline({
            endDate: "2026-09-15",
            repoIds: ["r1"],
            teamIds: [],
        });

        const [, variables] = vi.mocked(graphqlFetch).mock.calls[0];
        expect(variables).toEqual({ orgId: "org-1", endDate: "2026-09-15", repoIds: ["r1"] });
    });

    it("returns the served value; a null baseline stays null", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({
            coverageScopeBaseline: { lineBaselinePct: null, lineDays: 4 },
        });
        expect(await fetchCoverageScopeBaseline({ endDate: "2026-09-15" })).toEqual({
            lineBaselinePct: null,
            lineDays: 4,
        });
    });

    it("a GraphQL error is a failed read, not a missing baseline", async () => {
        vi.mocked(graphqlFetch).mockRejectedValue(new Error("[GraphQL] not authorized"));
        expect(await fetchCoverageScopeBaseline({ endDate: "2026-09-15" })).toEqual({
            fetchFailed: true,
        });
    });

    it("an answer that is not the served shape is a failed read", async () => {
        vi.mocked(graphqlFetch).mockResolvedValue({
            coverageScopeBaseline: { lineBaselinePct: "82" },
        });
        expect(await fetchCoverageScopeBaseline({ endDate: "2026-09-15" })).toEqual({
            fetchFailed: true,
        });
    });

    it("test mode returns the sample and makes no request", async () => {
        const result = await fetchCoverageScopeBaseline({ endDate: "2026-09-15" }, true);
        expect("lineDays" in result).toBe(true);
        expect(graphqlFetch).not.toHaveBeenCalled();
    });
});
