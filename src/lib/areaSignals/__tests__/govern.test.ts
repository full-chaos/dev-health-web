import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock every Govern source at the module boundary ───────────────────────────
// The resolver fans out to these; we drive each independently to assert the
// source → AreaSignal mapping (DERIVE vs RETURNED) without any network.

vi.mock("@/lib/api/home", () => ({ getHomeData: vi.fn() }));
vi.mock("@/lib/feature-flags/fetchers", () => ({
    fetchFeatureFlagsData: vi.fn(),
}));
vi.mock("@/lib/testops/fetchers", () => ({
    fetchTestOpsData: vi.fn(),
    fetchCoverageMetrics: vi.fn(),
    fetchRiskMetrics: vi.fn(),
}));
vi.mock("@/lib/graphql/server", () => ({ graphqlFetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-test" } }),
}));
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getHomeData } from "@/lib/api/home";
import { fetchFeatureFlagsData } from "@/lib/feature-flags/fetchers";
import { graphqlFetch } from "@/lib/graphql/server";
import { fetchCoverageMetrics, fetchRiskMetrics, fetchTestOpsData } from "@/lib/testops/fetchers";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getGovernSignals } from "../govern";
import type { AreaSignal } from "../types";

const mockGetHomeData = vi.mocked(getHomeData);
const mockFetchFlags = vi.mocked(fetchFeatureFlagsData);
const mockGraphql = vi.mocked(graphqlFetch);
const mockTestOps = vi.mocked(fetchTestOpsData);
const mockCoverage = vi.mocked(fetchCoverageMetrics);
const mockRisk = vi.mocked(fetchRiskMetrics);

const ts = (measure: string, value: number) => ({
    dimension: "TEAM",
    dimensionValue: "all",
    measure,
    buckets: [{ date: "2026-06-01", value }],
});

const emptyAnalytics = { timeseries: [], breakdowns: [] };

function byId(signals: AreaSignal[]): Record<string, AreaSignal> {
    return Object.fromEntries(signals.map((s) => [s.id, s]));
}

beforeEach(() => {
    vi.clearAllMocks();
    // Sensible "all available" defaults; individual tests override.
    mockTestOps.mockResolvedValue({
        pipelines: {
            timeseries: [ts("PIPELINE_SUCCESS_RATE", 92)],
            breakdowns: [],
        },
        tests: { timeseries: [ts("TEST_FLAKE_RATE", 4)], breakdowns: [] },
        coverage: { timeseries: [ts("COVERAGE_LINE_PCT", 83)], breakdowns: [] },
    });
    mockCoverage.mockResolvedValue({
        timeseries: [ts("COVERAGE_LINE_PCT", 83)],
        breakdowns: [],
    });
    mockRisk.mockResolvedValue({ release_confidence: 0.62 } as never);
    mockGetHomeData.mockResolvedValue({
        deltas: [
            {
                metric: "change_failure_rate",
                label: "CFR",
                value: 12,
                unit: "%",
                delta_pct: 0,
                spark: [],
            },
        ],
        signals: [
            {
                id: "cfr",
                title: "Change failure rate",
                metric: "change_failure_rate",
                current_value: "12%",
                direction: "up",
                severity: "high",
                confidence: "medium",
                affected_scope: "org",
                evidence_count: 3,
                why_it_matters: "",
                recommended_action: "",
                category: "delivery",
            },
        ],
    } as never);
    mockFetchFlags.mockResolvedValue({
        summary: {
            activeFlags: 7,
            activeFlagsDelta: 0,
            activeFlagsSpark: [],
            releaseFrictionDelta: 0,
            releaseFrictionSeverity: "moderate",
            releaseFrictionSpark: [],
            releaseErrorRateDelta: 0,
            releaseErrorRateSpark: [],
            coverageRatio: 0,
            coverageRatioDelta: 0,
            coverageRatioSpark: [],
        },
    } as never);
    // graphqlFetch is used for securityOverview AND compoundingRisk — branch on query text.
    mockGraphql.mockImplementation((query: unknown) => {
        const q = String(query);
        if (q.includes("securityOverview")) {
            return Promise.resolve({
                securityOverview: { kpis: { critical: 2, high: 5, openTotal: 11 } },
            } as never);
        }
        if (q.includes("compoundingRisk")) {
            return Promise.resolve({
                compoundingRisk: {
                    rows: [
                        { severity: "ELEVATED", score: 0.4 },
                        { severity: "HIGH", score: 0.8 },
                    ],
                },
            } as never);
        }
        return Promise.resolve({} as never);
    });
});

describe("getGovernSignals — source → AreaSignal mapping", () => {
    it("derives Quality cluster states from analytics values", async () => {
        const signals = byId(await getGovernSignals(defaultMetricFilter));

        expect(signals.testops).toMatchObject({
            state: "medium",
            value: "4% flake",
            cluster: "Quality",
        });
    });

    it("reuses the server-returned severity for home-REST signals (Quality + Incident)", async () => {
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.quality).toMatchObject({ state: "high", value: "12%" });
        // Incident Correlation reuses the same change_failure_rate signal.
        expect(signals["incident-correlation"]).toMatchObject({
            state: "high",
            value: "12%",
        });
    });

    it("derives Security severity by count ladder (critical>=1 → critical)", async () => {
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.security).toMatchObject({
            state: "critical",
            value: "2",
            cluster: "Risk",
        });
    });

    it("falls back to openTotal for Security when there are no criticals", async () => {
        mockGraphql.mockImplementation((query: unknown) =>
            String(query).includes("securityOverview")
                ? (Promise.resolve({
                      securityOverview: { kpis: { critical: 0, high: 0, openTotal: 4 } },
                  }) as never)
                : (Promise.resolve({ compoundingRisk: { rows: [] } }) as never),
        );
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.security).toMatchObject({ state: "medium", value: "4" });
    });

    it("derives Delivery Risk from release_confidence (×100, higher-is-better)", async () => {
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        // 0.62 → 62% → <70 medium.
        expect(signals.risk).toMatchObject({ state: "medium", value: "62%" });
    });

    it("maps the WORST compounding-risk row severity (HIGH → critical)", async () => {
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals["risk-compounding"]).toMatchObject({ state: "critical" });
    });

    it("maps feature-flag friction severity and flags it demoted (R4)", async () => {
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        // "moderate" → "medium"; activeFlags count as value; demoted secondary.
        expect(signals["feature-flags"]).toMatchObject({
            state: "medium",
            value: "7",
            demoted: true,
        });
    });

    it("emits an honest 'unavailable' signal (no fabricated value) when a source is empty", async () => {
        mockTestOps.mockResolvedValue({
            pipelines: emptyAnalytics,
            tests: emptyAnalytics,
            coverage: emptyAnalytics,
        });
        mockCoverage.mockResolvedValue(emptyAnalytics);
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.testops).toMatchObject({ state: "unavailable", value: "" });
    });

    it("degrades a failed source to unavailable instead of throwing", async () => {
        mockGetHomeData.mockRejectedValue(new Error("home down"));
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.quality).toMatchObject({ state: "unavailable" });
        expect(signals["incident-correlation"]).toMatchObject({
            state: "unavailable",
        });
        // other sources still resolve
        expect(signals.security.state).toBe("critical");
    });

    it("returns every Govern sub-area exactly once with its cluster", async () => {
        const signals = await getGovernSignals(defaultMetricFilter);
        const ids = signals.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(
            expect.arrayContaining([
                "testops",
                "quality",
                "security",
                "risk",
                "incident-correlation",
                "risk-compounding",
                "feature-flags",
            ]),
        );
        for (const s of signals) expect(["Quality", "Risk"]).toContain(s.cluster);
    });

    it("skips fetchTestOpsData when prefetched.testOpsData is provided", async () => {
        // Simulate the page passing its already-fetched testOpsData — the resolver
        // must reuse it without issuing a second analytics POST.
        const prefetchedData = {
            pipelines: {
                timeseries: [ts("PIPELINE_SUCCESS_RATE", 95)],
                breakdowns: [],
            },
            tests: { timeseries: [ts("TEST_FLAKE_RATE", 1)], breakdowns: [] },
            coverage: { timeseries: [ts("COVERAGE_LINE_PCT", 90)], breakdowns: [] },
        };
        const signals = byId(
            await getGovernSignals(defaultMetricFilter, false, {
                testOpsData: prefetchedData,
            }),
        );
        // fetchTestOpsData must NOT have been called — the prefetched data was reused.
        expect(mockTestOps).not.toHaveBeenCalled();
        // Signals derived from the prefetched data reflect the prefetched values.
        expect(signals.testops).toMatchObject({
            state: "low",
            value: "95% success",
        });
    });

    it("renders deterministic sample data for Security + Compounding Risk in isTestMode (no GraphQL calls, CHAOS-2223)", async () => {
        // Security and Compounding Risk previously short-circuited to `undefined`
        // in test mode (the graphql-direct sources), so the Govern hub could only
        // ever render their honest-empty "Not yet connected" tier under Playwright.
        // SAMPLE_GOVERN_SECURITY_OVERVIEW / SAMPLE_GOVERN_COMPOUNDING_RISK now flow
        // through the SAME derivation logic above (never bypassing it).
        const signals = byId(await getGovernSignals(defaultMetricFilter, true));

        expect(signals.security).toMatchObject({
            state: "high",
            value: "9",
            cluster: "Risk",
        });
        expect(signals["risk-compounding"]).toMatchObject({
            state: "medium",
            cluster: "Risk",
        });
        // Neither sample constant calls graphqlFetch — the network is bypassed.
        expect(mockGraphql).not.toHaveBeenCalled();
    });
});
