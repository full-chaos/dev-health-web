// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock every Diagnose source at the module boundary ─────────────────────────
// The resolver fans out to these; we drive each independently to assert the
// source → AreaSignal mapping (DERIVE vs RETURNED) without any network.

vi.mock("@/lib/api/home", () => ({ getHomeData: vi.fn() }));
vi.mock("@/lib/graphql/server", () => ({ graphqlFetch: vi.fn() }));
vi.mock("@/lib/api/code", () => ({ getBusFactorData: vi.fn() }));
vi.mock("@/lib/graphql/cognitiveLoadFetchers", () => ({
    getCognitiveLoadViaGraphQL: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-test" } }),
}));
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getHomeData } from "@/lib/api/home";
import { graphqlFetch } from "@/lib/graphql/server";
import { getBusFactorData } from "@/lib/api/code";
import { getCognitiveLoadViaGraphQL } from "@/lib/graphql/cognitiveLoadFetchers";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getDiagnoseSignals } from "../diagnose";
import type { AreaSignal } from "../types";

const mockGetHomeData = vi.mocked(getHomeData);
const mockGraphql = vi.mocked(graphqlFetch);
const mockGetBusFactorData = vi.mocked(getBusFactorData);
const mockGetCognitiveLoad = vi.mocked(getCognitiveLoadViaGraphQL);

function byId(signals: AreaSignal[]): Record<string, AreaSignal> {
    return Object.fromEntries(signals.map((s) => [s.id, s]));
}

// Helper: build a complexity timeseries response with a given cyclomaticPerKloc.
function complexityResponse(cyclomaticPerKloc: number) {
    return {
        complexityTimeseries: {
            points: [
                {
                    date: "2026-06-01",
                    scopeId: "repo-1",
                    scopeName: "my-repo",
                    cyclomaticPerKloc,
                    cyclomaticAvg: cyclomaticPerKloc * 0.5,
                    cyclomaticTotal: 100,
                    locTotal: 10000,
                    highComplexityFunctions: 5,
                    veryHighComplexityFunctions: 1,
                },
            ],
            totalScope: 1,
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();

    // Default home response: all three RETURNED metrics present.
    mockGetHomeData.mockResolvedValue({
        deltas: [
            {
                metric: "deploy_freq",
                label: "Deploy Frequency",
                value: 8,
                unit: "deploys",
                delta_pct: 0,
                spark: [],
            },
            {
                metric: "churn",
                label: "Code Churn",
                value: 3200,
                unit: "loc",
                delta_pct: 0,
                spark: [],
            },
            {
                metric: "wip_saturation",
                label: "WIP Saturation",
                value: 72,
                unit: "%",
                delta_pct: 0,
                spark: [],
            },
        ],
        signals: [
            {
                id: "df",
                title: "Deploy frequency",
                metric: "deploy_freq",
                current_value: "8",
                direction: "up",
                severity: "low",
                confidence: "medium",
                affected_scope: "org",
                evidence_count: 1,
                why_it_matters: "",
                recommended_action: "",
                category: "delivery",
            },
            {
                id: "churn",
                title: "Code churn",
                metric: "churn",
                current_value: "3200",
                direction: "up",
                severity: "high",
                confidence: "medium",
                affected_scope: "org",
                evidence_count: 2,
                why_it_matters: "",
                recommended_action: "",
                category: "dynamics",
            },
            {
                id: "wip",
                title: "WIP saturation",
                metric: "wip_saturation",
                current_value: "72%",
                direction: "up",
                severity: "critical",
                confidence: "high",
                affected_scope: "org",
                evidence_count: 3,
                why_it_matters: "",
                recommended_action: "",
                category: "delivery",
            },
        ],
    } as never);

    // Default complexity: avg cyclomaticPerKloc = 18 → medium (>=15).
    mockGraphql.mockResolvedValue(complexityResponse(18) as never);

    // Default bus factor: value=2.4 → medium (>=2, <3 with higherIsBetter thresholds).
    mockGetBusFactorData.mockResolvedValue({
        orgId: "org-test",
        scope: {},
        value: 2.4,
        topMaintainers: [],
        repos: [
            {
                repoId: "r1",
                repoName: "repo-1",
                value: 2.4,
                topMaintainers: [],
                evidenceSampleCount: 1,
            },
        ],
        evidenceSampleCount: 1,
    });

    // Default cognitive load: avg prInterruptionLoad = 16 → high (lowerIsBetter).
    mockGetCognitiveLoad.mockResolvedValue({
        orgId: "org-test",
        teamId: null,
        totalDays: 2,
        signals: [
            {
                day: "2026-06-06",
                prInterruptionLoad: 16,
                contextSpreadCount: 60,
                reviewRequestLoad: 2,
                afterHoursCommitRatio: 0.38,
                weekendCommitRatio: 0.25,
            },
            {
                day: "2026-06-07",
                prInterruptionLoad: 16,
                contextSpreadCount: 60,
                reviewRequestLoad: 2,
                afterHoursCommitRatio: 0.38,
                weekendCommitRatio: 0.25,
            },
        ],
    });
});

describe("getDiagnoseSignals — source → AreaSignal mapping", () => {
    it("returns all seven Diagnose sub-areas exactly once, flat (no cluster)", async () => {
        const signals = await getDiagnoseSignals(defaultMetricFilter);
        const ids = signals.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(
            expect.arrayContaining([
                "flow",
                "code",
                "code",
                "landscape",
                "complexity",
                "cognitive-load",
                "bottleneck",
            ]),
        );
        // Diagnose is FLAT — no clusters.
        for (const s of signals) expect(s.cluster).toBeUndefined();
    });

    describe("RETURNED signals (home REST severity reused)", () => {
        it("Metrics: reuses deploy_freq signal severity and formats delta value", async () => {
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.flow).toMatchObject({ state: "low", value: "8" });
        });

        it("Code: reuses churn signal severity and formats delta value", async () => {
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.code).toMatchObject({ state: "high", value: "3,200" });
        });

        it("Bottlenecks: reuses wip_saturation signal severity and formats delta value", async () => {
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.bottleneck).toMatchObject({
                state: "critical",
                value: "72%",
            });
        });
    });

    describe("DERIVE signals (Complexity)", () => {
        it("derives Complexity from mean cyclomaticPerKloc (>=15 medium)", async () => {
            // cyclomaticPerKloc = 18 → medium (>=15, <25).
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.complexity).toMatchObject({ state: "medium" });
            expect(signals.complexity.value).not.toBe("");
        });

        it("derives Complexity critical when cyclomaticPerKloc >= 40", async () => {
            mockGraphql.mockResolvedValue(complexityResponse(45) as never);
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.complexity).toMatchObject({ state: "critical" });
        });

        it("derives Complexity high when cyclomaticPerKloc >= 25 and < 40", async () => {
            mockGraphql.mockResolvedValue(complexityResponse(30) as never);
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.complexity).toMatchObject({ state: "high" });
        });

        it("derives Complexity low when cyclomaticPerKloc < 15", async () => {
            mockGraphql.mockResolvedValue(complexityResponse(10) as never);
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.complexity).toMatchObject({ state: "low" });
        });

        it("emits unavailable for Complexity when no timeseries points are returned", async () => {
            mockGraphql.mockResolvedValue({
                complexityTimeseries: { points: [], totalScope: 0 },
            } as never);
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.complexity).toMatchObject({
                state: "unavailable",
                value: "",
            });
        });

        it("computes mean from the latest complexity point per repo", async () => {
            mockGraphql.mockResolvedValue({
                complexityTimeseries: {
                    points: [
                        {
                            date: "2026-05-25",
                            scopeId: "repo-1",
                            scopeName: "repo-one",
                            cyclomaticPerKloc: 20,
                            cyclomaticAvg: 10,
                            cyclomaticTotal: 50,
                            locTotal: 5000,
                            highComplexityFunctions: 2,
                            veryHighComplexityFunctions: 0,
                        },
                        {
                            date: "2026-06-01",
                            scopeId: "repo-1",
                            scopeName: "repo-one",
                            cyclomaticPerKloc: 40,
                            cyclomaticAvg: 20,
                            cyclomaticTotal: 100,
                            locTotal: 5000,
                            highComplexityFunctions: 4,
                            veryHighComplexityFunctions: 1,
                        },
                    ],
                    totalScope: 1,
                },
            } as never);
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.complexity).toMatchObject({
                state: "critical",
                value: "40",
            });
        });

        it("passes active date and scope filters to the complexity query", async () => {
            const filtered = {
                ...defaultMetricFilter,
                time: {
                    ...defaultMetricFilter.time,
                    start_date: "2026-03-05",
                    end_date: "2026-06-07",
                },
                scope: { level: "repo" as const, ids: ["repo-active"] },
            };
            await getDiagnoseSignals(filtered);
            expect(mockGraphql).toHaveBeenCalledWith(
                expect.any(String),
                {
                    input: expect.objectContaining({
                        orgId: "org-test",
                        sinceUtc: "2026-03-05T00:00:00Z",
                        untilUtc: "2026-06-07T23:59:59Z",
                        granularity: "DAY",
                        scope: "REPO",
                        repoIds: ["repo-active"],
                        teamIds: null,
                    }),
                },
                { orgId: "org-test" },
            );
        });

        it("preset-only range_days=14 uses range_days-1 span (14 inclusive dates, matching /complexity)", async () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2026-06-08T12:00:00Z"));
            const presetFilter = {
                ...defaultMetricFilter,
                time: { range_days: 14, compare_days: 14 },
            };
            await getDiagnoseSignals(presetFilter);
            // range_days - 1 = 13 days back → 14 inclusive calendar dates.
            expect(mockGraphql).toHaveBeenCalledWith(
                expect.any(String),
                {
                    input: expect.objectContaining({
                        sinceUtc: "2026-05-26T00:00:00Z",
                        untilUtc: "2026-06-08T23:59:59Z",
                    }),
                },
                expect.any(Object),
            );
            vi.useRealTimers();
        });
    });

    describe("unavailable signals (backend gaps)", () => {
        it("Landscape derives medium from bus factor 2.4 (higherIsBetter, thresholds {critical:1.5, high:2, medium:3})", async () => {
            // value=2.4: >= high(2) but < medium(3) → medium in higherIsBetter polarity.
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.landscape).toMatchObject({
                state: "medium",
                value: "2.4",
            });
        });

        it("Landscape is unavailable when getBusFactorData returns null", async () => {
            mockGetBusFactorData.mockResolvedValue(null);
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.landscape).toMatchObject({
                state: "unavailable",
                value: "",
            });
        });

        it("Landscape is unavailable when bus factor has no repos", async () => {
            mockGetBusFactorData.mockResolvedValue({
                orgId: "org-test",
                scope: {},
                value: 2.4,
                topMaintainers: [],
                repos: [],
                evidenceSampleCount: 0,
            });
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.landscape).toMatchObject({
                state: "unavailable",
                value: "",
            });
        });

        it("Cognitive Load derives high from avg interruption load 16 (lowerIsBetter, thresholds {medium:8, high:15, critical:25})", async () => {
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals["cognitive-load"]).toMatchObject({
                state: "high",
                value: "16",
            });
        });

        it("Cognitive Load is unavailable when no cognitiveLoad signals are returned", async () => {
            mockGetCognitiveLoad.mockResolvedValue({
                orgId: "org-test",
                teamId: null,
                totalDays: 0,
                signals: [],
            });
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals["cognitive-load"]).toMatchObject({
                state: "unavailable",
                value: "",
            });
        });

        it("Cognitive Load degrades to unavailable when the fetch fails", async () => {
            mockGetCognitiveLoad.mockRejectedValue(new Error("cognitive-load down"));
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals["cognitive-load"]).toMatchObject({
                state: "unavailable",
                value: "",
            });
            // Other signals still resolve independently.
            expect(signals.flow.state).toBe("low");
            expect(signals.landscape.state).toBe("medium");
        });

        it("Cognitive Load is unavailable for unsupported scopes (developer) and skips the fetch", async () => {
            const developerFilter = {
                ...defaultMetricFilter,
                scope: {
                    ...defaultMetricFilter.scope,
                    level: "developer" as const,
                    ids: ["u1"],
                },
            };
            const signals = byId(await getDiagnoseSignals(developerFilter));
            expect(signals["cognitive-load"]).toMatchObject({
                state: "unavailable",
                value: "",
            });
            // The resolver only supports org/team scope; an unsupported scope must not even
            // fetch — otherwise it would surface org-wide data presented as the filtered
            // (here developer) scope, breaking the surface's self-only privacy framing.
            expect(mockGetCognitiveLoad).not.toHaveBeenCalled();
        });
    });

    describe("honest empty when source data is absent", () => {
        it("Metrics/Code/Bottlenecks emit unavailable when signals array is missing", async () => {
            mockGetHomeData.mockResolvedValue({
                deltas: [],
                signals: [],
            } as never);
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.flow).toMatchObject({ state: "unavailable", value: "" });
            expect(signals.code).toMatchObject({ state: "unavailable", value: "" });
            expect(signals.bottleneck).toMatchObject({
                state: "unavailable",
                value: "",
            });
        });
    });

    describe("source-failure degradation", () => {
        it("degrades home-backed signals to unavailable when home fetch fails", async () => {
            mockGetHomeData.mockRejectedValue(new Error("home down"));
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.flow).toMatchObject({ state: "unavailable", value: "" });
            expect(signals.code).toMatchObject({ state: "unavailable", value: "" });
            expect(signals.bottleneck).toMatchObject({
                state: "unavailable",
                value: "",
            });
            // Complexity is independent — still resolves if graphql is up.
            expect(signals.complexity.state).toBe("medium");
        });

        it("degrades Complexity to unavailable when graphql fetch fails", async () => {
            mockGraphql.mockRejectedValue(new Error("graphql down"));
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.complexity).toMatchObject({
                state: "unavailable",
                value: "",
            });
            // Home-backed signals still resolve.
            expect(signals.flow.state).toBe("low");
            expect(signals.code.state).toBe("high");
            expect(signals.bottleneck.state).toBe("critical");
        });

        it("degrades Landscape to unavailable when bus factor fetch fails", async () => {
            mockGetBusFactorData.mockRejectedValue(new Error("bus-factor down"));
            const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
            expect(signals.landscape).toMatchObject({
                state: "unavailable",
                value: "",
            });
            // Other signals still resolve.
            expect(signals.flow.state).toBe("low");
            expect(signals.complexity.state).toBe("medium");
        });

        it("does not throw when both sources fail simultaneously", async () => {
            mockGetHomeData.mockRejectedValue(new Error("home down"));
            mockGraphql.mockRejectedValue(new Error("graphql down"));
            const signals = await getDiagnoseSignals(defaultMetricFilter);
            expect(signals).toHaveLength(6);
            for (const s of signals) {
                if (!["landscape", "cognitive-load"].includes(s.id)) {
                    expect(s.state).toBe("unavailable");
                }
            }
        });
    });

    it("test-mode skips graphql and resolves complexity as unavailable", async () => {
        // In test mode, graphqlFetch is never called for complexity.
        const signals = byId(await getDiagnoseSignals(defaultMetricFilter, true));
        expect(mockGraphql).not.toHaveBeenCalled();
        expect(signals.complexity).toMatchObject({
            state: "unavailable",
            value: "",
        });
    });

    it("test-mode skips bus factor and resolves landscape as unavailable", async () => {
        // In test mode, getBusFactorData is never called for Landscape — it stays
        // unavailable like the other GraphQL-backed Diagnose signals (complexity,
        // cognitive-load). This stops a test-only BusFactor mock (added for the /code
        // ownership card) from leaking an available Landscape hero into the Diagnose
        // overview (CHAOS-2035 regression).
        const signals = byId(await getDiagnoseSignals(defaultMetricFilter, true));
        expect(mockGetBusFactorData).not.toHaveBeenCalled();
        expect(signals.landscape).toMatchObject({
            state: "unavailable",
            value: "",
        });
    });

    it("each signal has a non-empty label, href, and metricLabel", async () => {
        const signals = await getDiagnoseSignals(defaultMetricFilter);
        for (const s of signals) {
            expect(s.label).toBeTruthy();
            expect(s.href).toBeTruthy();
            expect(s.metricLabel).toBeTruthy();
        }
    });
});
