import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock every AI source at the module boundary ───────────────────────────────
// Each source is driven independently to assert the source → AreaSignal mapping
// without any network.

vi.mock("@/lib/graphql/server", () => ({ graphqlFetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-test" } }),
}));
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { graphqlFetch } from "@/lib/graphql/server";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getAISignals } from "../ai";
import type { AreaSignal } from "../types";

const mockGraphql = vi.mocked(graphqlFetch);

// ── Fixture factories ─────────────────────────────────────────────────────────

function makeImpact(overrides?: {
    dataAvailable?: boolean;
    aiAssistedPrRatio?: number | null;
    reworkDragRate?: number | null;
}) {
    return {
        aiImpactSummary: {
            orgId: "org-test",
            startDate: "2026-05-10",
            endDate: "2026-06-09",
            totalPrs: 100,
            aiAssistedPrs: 40,
            agentCreatedPrs: 5,
            humanPrs: 55,
            unknownPrs: 0,
            aiAssistedPrRatio: overrides?.aiAssistedPrRatio ?? 0.4,
            dataAvailable: overrides?.dataAvailable ?? true,
            computedAt: null,
            missingStates: [],
            byBucket: [
                {
                    bucket: "ai_assisted",
                    prsTotal: 40,
                    prsMerged: 38,
                    aiAssistedPrRatio: 0.4,
                    agentCreatedPrCount: 5,
                    cycleTimeAvgHours: 12,
                    aiCycleTimeDeltaHours: -2,
                    aiReviewAmplification: null,
                    reworkDragRate:
                        overrides !== undefined && "reworkDragRate" in overrides
                            ? overrides.reworkDragRate
                            : 0.12,
                    revertRate: 0.02,
                    incidentDragRate: null,
                    testGapRate: 0.08,
                    leverage: {
                        prsComponent: 0.4,
                        cycleTimeComponent: null,
                        reviewComponent: null,
                        reworkComponent: null,
                        testComponent: null,
                        incidentComponent: null,
                    },
                },
                {
                    bucket: "human",
                    prsTotal: 55,
                    prsMerged: 53,
                    aiAssistedPrRatio: 0,
                    agentCreatedPrCount: 0,
                    cycleTimeAvgHours: 14,
                    aiCycleTimeDeltaHours: null,
                    aiReviewAmplification: null,
                    reworkDragRate: 0.09,
                    revertRate: 0.01,
                    incidentDragRate: null,
                    testGapRate: 0.05,
                    leverage: {
                        prsComponent: 0,
                        cycleTimeComponent: null,
                        reviewComponent: null,
                        reworkComponent: null,
                        testComponent: null,
                        incidentComponent: null,
                    },
                },
            ],
            daily: [],
        },
    };
}

function makeReviewLoad(overrides?: {
    dataAvailable?: boolean;
    reviewAmplification?: number | null;
    reviewCommentsPerLoc?: number | null;
}) {
    return {
        aiReviewLoad: {
            orgId: "org-test",
            startDate: "2026-05-10",
            endDate: "2026-06-09",
            dataAvailable: overrides?.dataAvailable ?? true,
            byBucket: [
                {
                    bucket: "ai_assisted",
                    prsTotal: 40,
                    reviewsTotal: 72,
                    reviewsPerPr: 1.8,
                    changesRequestedPerPr: 0.5,
                    reviewAmplification:
                        overrides?.reviewAmplification === undefined
                            ? 1.8
                            : overrides.reviewAmplification,
                    reviewCommentsPerLoc:
                        overrides?.reviewCommentsPerLoc === undefined
                            ? null
                            : overrides.reviewCommentsPerLoc,
                    postFirstReviewPushesCount: 12,
                    postFirstReviewPushesPerPr: 0.3,
                },
                {
                    bucket: "human",
                    prsTotal: 55,
                    reviewsTotal: 88,
                    reviewsPerPr: 1.6,
                    changesRequestedPerPr: 0.4,
                    reviewAmplification: 1.0,
                    postFirstReviewPushesCount: 8,
                    postFirstReviewPushesPerPr: 0.15,
                },
            ],
            daily: [],
            reviewerConcentration: { dataAvailable: true, reviewerCount: 5, reviewerGini: 0.42 },
            missingStates: [],
        },
    };
}

function makeGovernance(overrides?: {
    dataAvailable?: boolean;
    violations?: Array<{ severity: string; ruleId: string }>;
}) {
    const violations = overrides?.violations ?? [
        {
            ruleId: "require-human-review",
            severity: "high",
            subjectType: "PR",
            subjectId: "PR#42",
            teamId: null,
            repoId: null,
            observedAt: "2026-06-01T10:00:00Z",
            evidence: "No human reviewer",
        },
    ];
    return {
        aiGovernanceSummary: {
            orgId: "org-test",
            startDate: "2026-05-10",
            endDate: "2026-06-09",
            dataAvailable: overrides?.dataAvailable ?? true,
            recentViolations: violations,
            coverage: [],
        },
    };
}

function makeOpportunities(overrides?: { detectorReady?: boolean; recommendationCount?: number }) {
    const count = overrides?.recommendationCount ?? 3;
    return {
        aiOpportunities: {
            orgId: "org-test",
            detectorReady: overrides?.detectorReady ?? true,
            recommendations: Array.from({ length: count }, (_, i) => ({
                opportunityId: `op-${i}`,
                kind: "HIGH_REVIEW_LOAD" as const,
                repoId: null,
                teamId: null,
                title: `Opportunity ${i}`,
                rationale: "…",
                score: 0.8 - i * 0.1,
                evidenceRefs: [],
                workGraphDrilldowns: [],
            })),
        },
    };
}

// ── Mock router: branch on query text ────────────────────────────────────────

function routeQuery(query: unknown): Promise<unknown> {
    const q = String(query);
    if (q.includes("AIImpactSummary")) return Promise.resolve(makeImpact());
    if (q.includes("AIReviewLoad")) return Promise.resolve(makeReviewLoad());
    if (q.includes("AIGovernanceSummary")) return Promise.resolve(makeGovernance());
    if (q.includes("AIOpportunities")) return Promise.resolve(makeOpportunities());
    return Promise.resolve({});
}

function byId(signals: AreaSignal[]): Record<string, AreaSignal> {
    return Object.fromEntries(signals.map((s) => [s.id, s]));
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGraphql.mockImplementation((query) => routeQuery(query) as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getAISignals — source → AreaSignal mapping", () => {
    it("returns all 4 AI sub-areas exactly once with their clusters", async () => {
        const signals = await getAISignals(defaultMetricFilter);
        const ids = signals.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(
            expect.arrayContaining([
                "ai-impact",
                "ai-review-load",
                "ai-governance-risk",
                "ai-automations",
            ]),
        );
    });

    it("assigns Signal cluster to Impact, Review Load, Governance Risk", async () => {
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-impact"].cluster).toBe("Signal");
        expect(signals["ai-review-load"].cluster).toBe("Signal");
        expect(signals["ai-governance-risk"].cluster).toBe("Signal");
    });

    it("assigns Action cluster to Automations", async () => {
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-automations"].cluster).toBe("Action");
    });

    it("derives AI impact severity from AI_ASSISTED bucket reworkDragRate (lowerIsBetter)", async () => {
        // reworkDragRate 0.12 × 100 = 12 → below medium threshold (15) → low.
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-impact"]).toMatchObject({
            state: "low",
            cluster: "Signal",
        });
        expect(signals["ai-impact"].value).toContain("AI-assisted");
    });

    it("escalates AI impact severity for high rework drag (>= 35 → high)", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIImpactSummary")) {
                return Promise.resolve(makeImpact({ reworkDragRate: 0.38 })) as never; // 38% → high
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-impact"].state).toBe("high");
    });

    it("falls back to neutral state when reworkDragRate is absent but data is available", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIImpactSummary")) {
                return Promise.resolve(makeImpact({ reworkDragRate: null })) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-impact"].state).toBe("neutral");
    });

    it("derives review load severity from AI_ASSISTED reviewAmplification (lowerIsBetter)", async () => {
        // 1.8× amplification ≥ 1.5 medium threshold → medium.
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-review-load"]).toMatchObject({
            state: "medium",
            cluster: "Signal",
        });
        expect(signals["ai-review-load"].value).toContain("amplification");
    });

    it("escalates review load to critical for very high amplification (>= 3.0)", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIReviewLoad")) {
                return Promise.resolve(makeReviewLoad({ reviewAmplification: 3.2 })) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-review-load"].state).toBe("critical");
    });

    it("falls back to comments/LOC (neutral) when amplification is absent (CHAOS-2194)", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIReviewLoad")) {
                return Promise.resolve(
                    makeReviewLoad({ reviewAmplification: null, reviewCommentsPerLoc: 0.045 }),
                ) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-review-load"]).toMatchObject({ state: "neutral" });
        expect(signals["ai-review-load"].value).toContain("comments/LOC");
    });

    it("stays unavailable when neither amplification nor comments/LOC populated", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIReviewLoad")) {
                return Promise.resolve(
                    makeReviewLoad({ reviewAmplification: null, reviewCommentsPerLoc: null }),
                ) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-review-load"]).toMatchObject({ state: "unavailable", value: "" });
    });

    it("returns governance severity from violation severity ladder (high violations → high)", async () => {
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-governance-risk"]).toMatchObject({
            state: "high",
            cluster: "Signal",
        });
        expect(signals["ai-governance-risk"].value).toContain("violation");
    });

    it("maps critical violations to critical governance state", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIGovernanceSummary")) {
                return Promise.resolve(
                    makeGovernance({
                        violations: [{ ruleId: "no-scan", severity: "critical" }],
                    }),
                ) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-governance-risk"].state).toBe("critical");
    });

    it("emits low state when governance has no violations", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIGovernanceSummary")) {
                return Promise.resolve(makeGovernance({ violations: [] })) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-governance-risk"]).toMatchObject({
            state: "low",
            value: "0 violations",
        });
    });

    it("does NOT over-state info/warning violations as medium — maps them to low", async () => {
        // advisory-only violations (info / warning severity) are not actionable
        // at the medium level; collapsing them there would over-state the risk.
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIGovernanceSummary")) {
                return Promise.resolve(
                    makeGovernance({
                        violations: [
                            { ruleId: "doc-coverage", severity: "info" },
                            { ruleId: "naming-convention", severity: "warning" },
                        ],
                    }),
                ) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-governance-risk"]).toMatchObject({
            state: "low",
        });
        expect(signals["ai-governance-risk"].value).toContain("violation");
    });

    it("promotes to medium when there are medium-severity violations (not just info/warning)", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIGovernanceSummary")) {
                return Promise.resolve(
                    makeGovernance({
                        violations: [
                            { ruleId: "scan-coverage", severity: "medium" },
                            { ruleId: "doc-coverage", severity: "info" },
                        ],
                    }),
                ) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-governance-risk"].state).toBe("medium");
    });

    it("emits neutral automations state when detector is ready with recommendations", async () => {
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-automations"]).toMatchObject({
            state: "neutral",
            cluster: "Action",
        });
        expect(signals["ai-automations"].value).toContain("opportunit");
    });

    it("emits low 'all-clear' automations card when detector ran but found zero opportunities", async () => {
        // detectorReady=true means the detector ran (AI-23 semantics: true even
        // when recommendations=0). Zero recommendations is a valid production
        // all-clear, not a missing-data case — it should surface as "low" with
        // an explicit "0 opportunities" value, not as "unavailable".
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIOpportunities")) {
                return Promise.resolve(
                    makeOpportunities({ detectorReady: true, recommendationCount: 0 }),
                ) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-automations"]).toMatchObject({
            state: "low",
            value: "0 opportunities",
        });
    });

    it("emits unavailable automations when detector has not yet run (detectorReady=false)", async () => {
        // detectorReady=false means the detector hasn't run yet — no count to
        // surface, so we emit honest "unavailable" rather than "0 opportunities".
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIOpportunities")) {
                return Promise.resolve(makeOpportunities({ detectorReady: false })) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-automations"]).toMatchObject({ state: "unavailable", value: "" });
    });

    it("degrades a single failing source to unavailable without failing the whole area", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIImpactSummary")) {
                return Promise.reject(new Error("source down")) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-impact"]).toMatchObject({ state: "unavailable", value: "" });
        // Other sources still resolve.
        expect(signals["ai-review-load"].state).not.toBe("unavailable");
        expect(signals["ai-governance-risk"].state).not.toBe("unavailable");
    });

    it("emits honest unavailable (no fabricated value) when dataAvailable is false", async () => {
        mockGraphql.mockImplementation((query) => {
            if (String(query).includes("AIImpactSummary")) {
                return Promise.resolve(makeImpact({ dataAvailable: false })) as never;
            }
            if (String(query).includes("AIReviewLoad")) {
                return Promise.resolve(makeReviewLoad({ dataAvailable: false })) as never;
            }
            if (String(query).includes("AIGovernanceSummary")) {
                return Promise.resolve(makeGovernance({ dataAvailable: false })) as never;
            }
            return routeQuery(query) as never;
        });
        const signals = byId(await getAISignals(defaultMetricFilter));
        expect(signals["ai-impact"]).toMatchObject({ state: "unavailable", value: "" });
        expect(signals["ai-review-load"]).toMatchObject({ state: "unavailable", value: "" });
        expect(signals["ai-governance-risk"]).toMatchObject({ state: "unavailable", value: "" });
    });

    it("renders deterministic sample data in isTestMode (no API calls)", async () => {
        const signals = byId(await getAISignals(defaultMetricFilter, true));
        // Test mode returns the SAMPLE_AI_* constants (testops fetcher
        // convention) through the REAL derivation: a deliberate severity mix,
        // not all-green and never unavailable.
        expect(signals["ai-impact"]).toMatchObject({
            state: "low",
            value: "34% AI-assisted",
        });
        expect(signals["ai-review-load"]).toMatchObject({
            state: "medium",
            value: "1.7× amplification",
        });
        expect(signals["ai-governance-risk"]).toMatchObject({
            state: "high",
            value: "3 violations",
        });
        expect(signals["ai-automations"]).toMatchObject({
            state: "neutral",
            value: "2 opportunities",
        });
        expect(mockGraphql).not.toHaveBeenCalled();
    });
});
