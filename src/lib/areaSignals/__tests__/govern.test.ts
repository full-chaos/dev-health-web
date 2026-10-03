import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock every Govern source at the module boundary ───────────────────────────
// The resolver fans out to these; we drive each independently to assert the
// source → AreaSignal mapping (DERIVE vs RETURNED) without any network.

vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
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

import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { fetchFeatureFlagsData } from "@/lib/feature-flags/fetchers";
import { graphqlFetch } from "@/lib/graphql/server";
import { fetchCoverageMetrics, fetchRiskMetrics, fetchTestOpsData } from "@/lib/testops/fetchers";
import { auth } from "@/lib/auth";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getGovernSignals } from "../govern";
import type { AreaSignal } from "../types";

const mockGetHomeData = vi.mocked(getHomeDataViaGraphQL);
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
    it("carries no driver line on any card (only AI Impact has one)", async () => {
        const signals = await getGovernSignals(defaultMetricFilter);
        expect(signals.length).toBeGreaterThan(0);
        expect(signals.filter((s) => s.driver !== undefined)).toEqual([]);
    });

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

    // The value and the label follow the count that sets the card state.
    it.each([
        [{ critical: 0, high: 95, openTotal: 974 }, "high", "95", "High"],
        [{ critical: 0, high: 0, openTotal: 974 }, "medium", "974", "Open Alerts"],
        [{ critical: 2, high: 95, openTotal: 974 }, "critical", "2", "Critical"],
        [{ critical: 0, high: 0, openTotal: 0 }, "low", "0", "Open Alerts"],
    ])("Security card %j: state %s, value %s, label %s", async (kpis, state, value, label) => {
        mockGraphql.mockImplementation((query: unknown) =>
            String(query).includes("securityOverview")
                ? (Promise.resolve({ securityOverview: { kpis } }) as never)
                : (Promise.resolve({ compoundingRisk: { rows: [] } }) as never),
        );
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.security).toMatchObject({ state, value, metricLabel: label });
    });

    it("never shows the open total as the value of a critical or high card", async () => {
        mockGraphql.mockImplementation((query: unknown) =>
            String(query).includes("securityOverview")
                ? (Promise.resolve({
                      securityOverview: { kpis: { critical: 0, high: 95, openTotal: 974 } },
                  }) as never)
                : (Promise.resolve({ compoundingRisk: { rows: [] } }) as never),
        );
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.security.value).not.toBe("974");
    });

    it("marks Security unavailable, with no number, when the overview is missing or a count is not finite", async () => {
        for (const securityOverview of [
            null,
            { kpis: { critical: Number.NaN, high: 1, openTotal: 5 } },
            { kpis: { critical: 0, high: Number.NaN, openTotal: 5 } },
            { kpis: { critical: 0, high: 0, openTotal: Number.NaN } },
        ]) {
            mockGraphql.mockImplementation((query: unknown) =>
                String(query).includes("securityOverview")
                    ? (Promise.resolve({ securityOverview }) as never)
                    : (Promise.resolve({ compoundingRisk: { rows: [] } }) as never),
            );
            const signals = byId(await getGovernSignals(defaultMetricFilter));
            expect(signals.security).toMatchObject({ state: "unavailable", value: "" });
        }
    });

    it("keeps the registry label on the other Security states default", async () => {
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        // critical: 2 in the default mock
        expect(signals.security.metricLabel).toBe("Critical");
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

    it("maps feature-flag friction severity as a normal Risk card (not demoted)", async () => {
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        // "moderate" → "medium"; activeFlags count as value.
        expect(signals["feature-flags"]).toMatchObject({
            state: "medium",
            value: "7",
            cluster: "Risk",
        });
        // The approved Govern overview draws Feature Flags as the 4th Risk card, at equal billing.
        expect(signals["feature-flags"].demoted).not.toBe(true);
    });

    it("returns the Risk signals in the approved overview order (it decides equal severity)", async () => {
        const signals = await getGovernSignals(defaultMetricFilter);
        const risk = signals.filter((s) => s.cluster === "Risk").map((s) => s.id);
        expect(risk).toEqual([
            "security",
            "risk",
            "risk-compounding",
            "incident-correlation",
            "feature-flags",
        ]);
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

        // The sample has 0 critical, 2 high, 9 open: the card shows the high count.
        expect(signals.security).toMatchObject({
            state: "high",
            value: "2",
            metricLabel: "High",
            cluster: "Risk",
        });
        expect(signals["risk-compounding"]).toMatchObject({
            state: "medium",
            value: "0.6",
            cluster: "Risk",
        });
        // Neither sample constant calls graphqlFetch — the network is bypassed.
        expect(mockGraphql).not.toHaveBeenCalled();
    });
});

describe("getGovernSignals — null buckets are missing, not zero", () => {
    const nullTs = (measure: string) => ({
        dimension: "TEAM",
        dimensionValue: "all",
        measure,
        buckets: [
            { date: "2026-06-01", value: 50 },
            { date: "2026-06-02", value: null },
        ],
    });
    const absentTs = (measure: string) => ({
        dimension: "TEAM",
        dimensionValue: "all",
        measure,
        buckets: [] as { date: string; value: number | null }[],
    });

    // A latest bucket of null must resolve exactly like an absent measure
    // (never like a produced 0, which would derive a critical state).
    it.each([
        ["COVERAGE_LINE_PCT", "coverage"],
        ["TEST_FLAKE_RATE", "tests"],
        ["PIPELINE_SUCCESS_RATE", "pipelines"],
    ] as const)(
        "%s: a null latest bucket resolves like an absent measure",
        async (measure, key) => {
            const withSeries = (series: ReturnType<typeof nullTs>) => {
                mockTestOps.mockResolvedValue({
                    pipelines: { timeseries: [ts("PIPELINE_SUCCESS_RATE", 92)], breakdowns: [] },
                    tests: { timeseries: [ts("TEST_FLAKE_RATE", 4)], breakdowns: [] },
                    coverage: { timeseries: [ts("COVERAGE_LINE_PCT", 83)], breakdowns: [] },
                    [key]: { timeseries: [series], breakdowns: [] },
                } as never);
                mockCoverage.mockResolvedValue({
                    timeseries: key === "coverage" ? [series] : [],
                    breakdowns: [],
                });
            };
            withSeries(absentTs(measure));
            const absent = byId(await getGovernSignals(defaultMetricFilter)).testops;
            withSeries(nullTs(measure));
            const withNull = byId(await getGovernSignals(defaultMetricFilter)).testops;
            expect(withNull.state).toBe(absent.state);
            expect(withNull.value).toBe(absent.value);
        },
    );

    it("a produced 0 coverage still derives its state (0 is a value)", async () => {
        mockCoverage.mockResolvedValue({
            timeseries: [ts("COVERAGE_LINE_PCT", 0)],
            breakdowns: [],
        });
        mockTestOps.mockResolvedValue({
            pipelines: { timeseries: [ts("PIPELINE_SUCCESS_RATE", 92)], breakdowns: [] },
            tests: { timeseries: [ts("TEST_FLAKE_RATE", 4)], breakdowns: [] },
            coverage: { timeseries: [ts("COVERAGE_LINE_PCT", 0)], breakdowns: [] },
        });
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.testops.state).toBe("critical");
    });

    it("feature flags: a null friction severity is unavailable, not healthy", async () => {
        mockFetchFlags.mockResolvedValue({
            summary: {
                activeFlags: 7,
                activeFlagsSpark: [],
                releaseFrictionDelta: null,
                releaseFrictionSeverity: null,
                releaseFrictionSpark: [],
                releaseErrorRateDelta: null,
                releaseErrorRateSpark: [],
                coverageRatio: 0,
                coverageRatioSpark: [],
            },
        } as never);
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals["feature-flags"].state).toBe("unavailable");
    });
});

describe("getGovernSignals — a failed read is not an empty read (CHAOS-8269)", () => {
    it("a failed home read marks Quality and Incident Correlation as failed, and no other card", async () => {
        mockGetHomeData.mockRejectedValue(new Error("home down"));
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        for (const id of ["quality", "incident-correlation"]) {
            expect(signals[id]).toMatchObject({ state: "unavailable", failed: true });
        }
        for (const id of ["testops", "security", "risk", "risk-compounding", "feature-flags"]) {
            expect(signals[id].failed).toBeUndefined();
        }
    });

    it("each other failed read marks its own card", async () => {
        mockRisk.mockRejectedValue(new Error("risk down"));
        mockFetchFlags.mockRejectedValue(new Error("flags down"));
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        for (const id of ["risk", "feature-flags"]) {
            expect(signals[id]).toMatchObject({ state: "unavailable", failed: true });
        }
        expect(signals.quality.failed).toBeUndefined();
    });

    it("a failed security read marks Security; a failed compounding read marks Compounding Risk", async () => {
        mockGraphql.mockRejectedValue(new Error("graphql down"));
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        for (const id of ["security", "risk-compounding"]) {
            expect(signals[id]).toMatchObject({ state: "unavailable", failed: true });
        }
    });

    it("TestOps is failed only when it has no value and a read it uses failed", async () => {
        // Coverage read failed but the TestOps read answered: the card has a value, so it is not failed.
        mockCoverage.mockRejectedValue(new Error("coverage down"));
        let signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.testops.state).not.toBe("unavailable");
        expect(signals.testops.failed).toBeUndefined();
        // Both failed: no value, failed.
        mockTestOps.mockRejectedValue(new Error("testops down"));
        signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.testops).toMatchObject({ state: "unavailable", failed: true });
    });

    it("TestOps with an empty TestOps answer and a failed coverage read is failed, not empty", async () => {
        mockTestOps.mockResolvedValue({
            pipelines: emptyAnalytics,
            tests: emptyAnalytics,
            coverage: emptyAnalytics,
        });
        mockCoverage.mockRejectedValue(new Error("coverage down"));
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals.testops).toMatchObject({ state: "unavailable", failed: true });
    });

    it("an empty answer is not failed", async () => {
        mockFetchFlags.mockResolvedValue({ summary: null } as never);
        const signals = byId(await getGovernSignals(defaultMetricFilter));
        expect(signals["feature-flags"]).toMatchObject({ state: "unavailable" });
        expect(signals["feature-flags"].failed).toBeUndefined();
    });
});

describe("getGovernSignals — no org on the session is unavailable, never a failed read (CHAOS-8269)", () => {
    it("every card is unavailable and none is failed; no read is made at all", async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: {} } as never);
        const signals = await getGovernSignals(defaultMetricFilter);
        expect(signals.map((s) => s.id)).toEqual([
            "testops",
            "quality",
            "security",
            "risk",
            "risk-compounding",
            "incident-correlation",
            "feature-flags",
        ]);
        for (const signal of signals) {
            expect(signal).toMatchObject({ state: "unavailable", value: "" });
            expect(signal.failed).toBeUndefined();
        }
        // Not even the reads that resolve the org themselves.
        expect(mockGraphql).not.toHaveBeenCalled();
        expect(mockTestOps).not.toHaveBeenCalled();
        expect(mockCoverage).not.toHaveBeenCalled();
        expect(mockRisk).not.toHaveBeenCalled();
        expect(mockGetHomeData).not.toHaveBeenCalled();
        expect(mockFetchFlags).not.toHaveBeenCalled();
    });
});

describe("getGovernSignals — org scope comes from the session (CHAOS-8272)", () => {
    it("makes no request when the session has no org", async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: {} } as never);
        await getGovernSignals(defaultMetricFilter);
        expect(mockGraphql).not.toHaveBeenCalled();
        expect(mockTestOps).not.toHaveBeenCalled();
        expect(mockCoverage).not.toHaveBeenCalled();
        expect(mockRisk).not.toHaveBeenCalled();
    });

    it("sends the session org when present", async () => {
        await getGovernSignals(defaultMetricFilter);
        expect(JSON.stringify(mockGraphql.mock.calls)).toContain("org-test");
    });
});
