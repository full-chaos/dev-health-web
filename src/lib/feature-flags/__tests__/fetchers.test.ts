import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkGraphEdge } from "@/lib/graphql/types";
import { getDistinctSourceIds } from "../graph";
import {
    latestFromSpark,
    deltaFromSpark,
    classifySeverity,
    fetchFeatureFlagsData,
    fetchFeatureFlagEvents,
    fetchFeatureFlagList,
} from "../fetchers";

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-test" } }),
}));

vi.mock("@/lib/graphql/urqlClient", () => ({
    graphqlFetch: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { graphqlFetch } = await import("@/lib/graphql/urqlClient");
const { auth } = await import("@/lib/auth");
const mockGraphql = vi.mocked(graphqlFetch);
const mockAuth = vi.mocked(auth);

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEdge(overrides: Partial<WorkGraphEdge>): WorkGraphEdge {
    return {
        edgeId: overrides.edgeId ?? "edge-1",
        sourceType: overrides.sourceType ?? "FEATURE_FLAG",
        sourceId: overrides.sourceId ?? "flag-1",
        targetType: overrides.targetType ?? "FEATURE_FLAG",
        targetId: overrides.targetId ?? "flag-1",
        edgeType: overrides.edgeType ?? "RELATES",
        provenance: overrides.provenance ?? "NATIVE",
        confidence: overrides.confidence ?? 1,
        evidence: overrides.evidence ?? "flag:launchdarkly/default/checkout-redesign",
        repoId: overrides.repoId ?? undefined,
        provider: overrides.provider ?? "launchdarkly",
    };
}

/** Build a minimal successful graphqlFetch response for fetchFeatureFlagsData.
 *
 * Uses query-string discrimination rather than call-order sequencing because
 * fetchFeatureFlagTimeseries calls graphqlFetch before registry/impact (those
 * helpers await resolveOrgId first, deferring their graphqlFetch calls).
 */
function mockSuccessfulFetch(timeseriesBuckets: {
    friction?: number[];
    error?: number[];
    activation?: number[];
    coverage?: number[];
}) {
    const makeTimeseries = (measure: string, values: number[]) => ({
        dimension: "REPO",
        dimensionValue: "repo-a",
        measure,
        buckets: values.map((value, i) => ({
            date: `2026-05-${String(i + 1).padStart(2, "0")}`,
            value,
        })),
    });

    const emptyRegistryResponse = {
        featureFlags: {
            flags: [],
            totalCount: 0,
            degradedReason: null,
        },
    };
    const emptyEventsResponse = {
        featureFlagEvents: {
            events: [],
            totalCount: 0,
            degradedReason: null,
        },
    };
    const emptyEdgesResponse = {
        workGraphEdges: {
            edges: [],
            totalCount: 0,
            pageInfo: { hasNextPage: false, hasPreviousPage: false },
        },
    };

    mockGraphql.mockImplementation((query) => {
        // In this codebase all queries are plain strings (not TypedDocumentNode).
        const qs = typeof query === "string" ? query : "";
        if (qs.includes("FeatureFlagTimeseries")) {
            return Promise.resolve({
                analytics: {
                    timeseries: [
                        makeTimeseries(
                            "FLAG_ACTIVATION_RATE",
                            timeseriesBuckets.activation ?? [10, 12],
                        ),
                        makeTimeseries(
                            "FLAG_FRICTION_DELTA",
                            timeseriesBuckets.friction ?? [8, 14],
                        ),
                        makeTimeseries(
                            "FLAG_ERROR_RATE_DELTA",
                            timeseriesBuckets.error ?? [-3, -5],
                        ),
                        makeTimeseries(
                            "FLAG_COVERAGE_RATIO",
                            timeseriesBuckets.coverage ?? [60, 70],
                        ),
                    ],
                },
            });
        }
        if (qs.includes("FeatureFlagRegistry")) {
            return Promise.resolve(emptyRegistryResponse);
        }
        if (qs.includes("FeatureFlagEvents")) {
            return Promise.resolve(emptyEventsResponse);
        }
        return Promise.resolve(emptyEdgesResponse);
    });
}

// ── Graph helper tests (unchanged from prior suite) ─────────────────────────

describe("feature flag fetcher helpers", () => {
    it("counts distinct release sources for impact coverage", () => {
        const edges = [
            makeEdge({
                sourceType: "RELEASE",
                sourceId: "release-a",
                targetType: "RELEASE",
                targetId: "release-a",
                edgeType: "RELATES",
            }),
            makeEdge({
                edgeId: "impact-a-1",
                sourceType: "RELEASE",
                sourceId: "release-a",
                targetType: "FEATURE_FLAG",
                targetId: "flag-a",
                edgeType: "IMPACTS",
            }),
            makeEdge({
                edgeId: "impact-a-2",
                sourceType: "RELEASE",
                sourceId: "release-a",
                targetType: "FEATURE_FLAG",
                targetId: "flag-b",
                edgeType: "IMPACTS",
            }),
            makeEdge({
                edgeId: "release-b",
                sourceType: "RELEASE",
                sourceId: "release-b",
                targetType: "RELEASE",
                targetId: "release-b",
                edgeType: "RELATES",
            }),
        ];

        expect(getDistinctSourceIds(edges).size).toBe(2);
        expect(getDistinctSourceIds(edges, "IMPACTS").size).toBe(1);
    });
});

describe("feature flag direct-read fetchers", () => {
    beforeEach(() => {
        mockGraphql.mockReset();
        mockAuth.mockResolvedValue({ user: { org_id: "org-test" } } as never);
    });

    it("maps the full ordered event timeline and passes the plain flag key", async () => {
        mockGraphql.mockResolvedValueOnce({
            featureFlagEvents: {
                events: [
                    {
                        flagKey: "checkout-redesign",
                        eventType: "created",
                        prevState: "",
                        nextState: "off",
                        actorType: "system",
                        environment: "prod",
                        eventTs: "2026-04-15T09:00:00Z",
                    },
                    {
                        flagKey: "checkout-redesign",
                        eventType: "toggled",
                        prevState: "off",
                        nextState: "on",
                        actorType: "user",
                        environment: "prod",
                        eventTs: "2026-04-15T10:15:00Z",
                    },
                    {
                        flagKey: "checkout-redesign",
                        eventType: "toggled",
                        prevState: "on",
                        nextState: "disabled",
                        actorType: "user",
                        environment: "prod",
                        eventTs: "2026-04-16T08:00:00Z",
                    },
                ],
                totalCount: 3,
                degradedReason: null,
            },
        });

        const result = await fetchFeatureFlagEvents("checkout-redesign", "org-test", 50);

        expect(mockGraphql).toHaveBeenCalledWith(expect.any(String), {
            orgId: "org-test",
            flagKey: "checkout-redesign",
            environment: null,
            limit: 50,
        });
        expect(result.events.map((event) => event.eventTs)).toEqual([
            "2026-04-15T09:00:00Z",
            "2026-04-15T10:15:00Z",
            "2026-04-16T08:00:00Z",
        ]);
        expect(result.totalCount).toBe(3);
    });

    it("renders registry list rows from featureFlags joined to latest featureFlagEvents by flagKey", async () => {
        mockGraphql.mockImplementation((query, variables) => {
            const qs = typeof query === "string" ? query : "";
            if (qs.includes("FeatureFlagRegistry")) {
                return Promise.resolve({
                    featureFlags: {
                        flags: [
                            {
                                flagId: "hashed-flag-a",
                                flagKey: "checkout-redesign",
                                provider: "launchdarkly",
                                projectKey: "web",
                                environment: "prod",
                                flagType: "boolean",
                                createdAt: "2026-04-01T00:00:00Z",
                                archivedAt: null,
                            },
                            {
                                flagId: "hashed-flag-b",
                                flagKey: "search-v2",
                                provider: "launchdarkly",
                                projectKey: "web",
                                environment: "prod",
                                flagType: "boolean",
                                createdAt: "2026-04-02T00:00:00Z",
                                archivedAt: null,
                            },
                        ],
                        totalCount: 2,
                        degradedReason: null,
                    },
                });
            }
            // featureFlagEvents is now fetched per-flag (scoped by flagKey);
            // return only the events matching the requested flag.
            const allEvents = [
                {
                    flagKey: "checkout-redesign",
                    eventType: "toggled",
                    prevState: "off",
                    nextState: "on",
                    actorType: "user",
                    environment: "prod",
                    eventTs: "2026-04-15T10:15:00Z",
                },
                {
                    flagKey: "checkout-redesign",
                    eventType: "toggled",
                    prevState: "on",
                    nextState: "disabled",
                    actorType: "user",
                    environment: "prod",
                    eventTs: "2026-04-16T08:00:00Z",
                },
                {
                    flagKey: "search-v2",
                    eventType: "toggled",
                    prevState: "off",
                    nextState: "enabled",
                    actorType: "system",
                    environment: "prod",
                    eventTs: "2026-04-17T11:00:00Z",
                },
            ];
            const flagKey = (variables as { flagKey?: string | null } | undefined)?.flagKey ?? null;
            const events = flagKey
                ? allEvents.filter((event) => event.flagKey === flagKey)
                : allEvents;
            return Promise.resolve({
                featureFlagEvents: {
                    events,
                    totalCount: events.length,
                    degradedReason: null,
                },
            });
        });

        const result = await fetchFeatureFlagList(0, 20, "org-test");

        expect(result.items).toEqual([
            {
                flagId: "hashed-flag-a",
                flagKey: "checkout-redesign",
                provider: "launchdarkly",
                projectKey: "web",
                createdAt: "2026-04-01T00:00:00Z",
                lastToggledAt: "2026-04-16T08:00:00Z",
                isActive: false,
            },
            {
                flagId: "hashed-flag-b",
                flagKey: "search-v2",
                provider: "launchdarkly",
                projectKey: "web",
                createdAt: "2026-04-02T00:00:00Z",
                lastToggledAt: "2026-04-17T11:00:00Z",
                isActive: true,
            },
        ]);
        expect(result.totalCount).toBe(2);
        expect(result.hasNextPage).toBe(false);
    });

    it("reports isActive null when the latest event state is empty/unknown", async () => {
        mockGraphql.mockImplementation((query, variables) => {
            const qs = typeof query === "string" ? query : "";
            if (qs.includes("FeatureFlagRegistry")) {
                return Promise.resolve({
                    featureFlags: {
                        flags: [
                            {
                                flagId: "hashed-flag-c",
                                flagKey: "unknown-state",
                                provider: "gitlab",
                                projectKey: "infra",
                                environment: "prod",
                                flagType: "boolean",
                                createdAt: "2026-04-03T00:00:00Z",
                                archivedAt: null,
                            },
                        ],
                        totalCount: 1,
                        degradedReason: null,
                    },
                });
            }
            void variables;
            return Promise.resolve({
                featureFlagEvents: {
                    events: [
                        {
                            flagKey: "unknown-state",
                            eventType: "created",
                            prevState: "",
                            nextState: "",
                            actorType: "system",
                            environment: "prod",
                            eventTs: "2026-04-10T00:00:00Z",
                        },
                    ],
                    totalCount: 1,
                    degradedReason: null,
                },
            });
        });

        const result = await fetchFeatureFlagList(0, 20, "org-test");
        expect(result.items[0].isActive).toBeNull();
        expect(result.items[0].lastToggledAt).toBe("2026-04-10T00:00:00Z");
    });
});

// ── latestFromSpark ──────────────────────────────────────────────────────────

describe("latestFromSpark", () => {
    it("returns null for an empty sparkline", () => {
        expect(latestFromSpark([])).toBeNull();
    });

    it("returns the single value when there is exactly one point", () => {
        expect(latestFromSpark([{ ts: "2026-05-01", value: 42 }])).toBe(42);
    });

    it("returns the last value for a multi-point sparkline", () => {
        const spark = [
            { ts: "2026-05-01", value: 10 },
            { ts: "2026-05-02", value: 20 },
            { ts: "2026-05-03", value: 7 },
        ];
        expect(latestFromSpark(spark)).toBe(7);
    });
});

// ── deltaFromSpark ──────────────────────────────────────────────────────────

describe("deltaFromSpark", () => {
    it("returns null for an empty sparkline", () => {
        expect(deltaFromSpark([])).toBeNull();
    });

    it("returns null for a single-point sparkline (no prior period)", () => {
        expect(deltaFromSpark([{ ts: "2026-05-01", value: 42 }])).toBeNull();
    });

    it("returns last minus first, rounded to one decimal place", () => {
        const spark = [
            { ts: "2026-05-01", value: 10 },
            { ts: "2026-05-07", value: 18.35 },
        ];
        expect(deltaFromSpark(spark)).toBe(8.4);
    });

    it("returns a negative delta when the sparkline trends downward", () => {
        const spark = [
            { ts: "2026-05-01", value: 25 },
            { ts: "2026-05-02", value: 20 },
            { ts: "2026-05-03", value: 18 },
        ];
        expect(deltaFromSpark(spark)).toBe(-7);
    });

    it("returns 0.0 when first and last values are equal", () => {
        const spark = [
            { ts: "2026-05-01", value: 50 },
            { ts: "2026-05-02", value: 50 },
        ];
        expect(deltaFromSpark(spark)).toBe(0);
    });
});

// ── classifySeverity ────────────────────────────────────────────────────────

describe("classifySeverity", () => {
    it.each([
        [0, "low"],
        [4.9, "low"],
        [5, "moderate"],
        [14.9, "moderate"],
        [15, "high"],
        [24.9, "high"],
        [25, "critical"],
        [100, "critical"],
    ] as const)("classifySeverity(%s) → %s", (delta, expected) => {
        expect(classifySeverity(delta)).toBe(expected);
    });

    it("uses absolute value so negative deltas classify the same as positive", () => {
        expect(classifySeverity(-20)).toBe("high");
        expect(classifySeverity(-5)).toBe("moderate");
    });
});

// ── fetchFeatureFlagsData — real-delta wiring ───────────────────────────────

describe("fetchFeatureFlagsData — real-delta wiring", () => {
    const DATE_RANGE = { startDate: "2026-05-01", endDate: "2026-05-14" };

    beforeEach(() => {
        mockGraphql.mockReset();
        mockAuth.mockResolvedValue({ user: { org_id: "org-test" } } as never);
    });

    it("sources releaseFrictionDelta from the last FLAG_FRICTION_DELTA bucket", async () => {
        mockSuccessfulFetch({ friction: [5, 18] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        // Last bucket of FLAG_FRICTION_DELTA is 18 → card value should be 18
        expect(result.summary.releaseFrictionDelta).toBe(18);
    });

    it("derives releaseFrictionSeverity from the wired friction delta", async () => {
        mockSuccessfulFetch({ friction: [2, 16] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        // 16 >= 15 → "high"
        expect(result.summary.releaseFrictionSeverity).toBe("high");
    });

    it("sources releaseErrorRateDelta from the last FLAG_ERROR_RATE_DELTA bucket", async () => {
        mockSuccessfulFetch({ error: [-1, -6.5] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        expect(result.summary.releaseErrorRateDelta).toBe(-6.5);
    });

    it("leaves activeFlagsDelta undefined — no FLAG_ACTIVE_COUNT_DELTA measure exposed", async () => {
        mockSuccessfulFetch({ activation: [10, 12, 14] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        // Activation-rate Δ must NOT be surfaced as a count Δ (unit mismatch).
        expect(result.summary.activeFlagsDelta).toBeUndefined();
    });

    it("sources coverageRatio from last FLAG_COVERAGE_RATIO bucket (rounds to int)", async () => {
        mockSuccessfulFetch({ coverage: [60, 73.7] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        expect(result.summary.coverageRatio).toBe(74);
    });

    it("leaves coverageRatioDelta undefined — no FLAG_COVERAGE_RATIO_DELTA measure exposed", async () => {
        mockSuccessfulFetch({ coverage: [60, 70] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        // Ratio first→last Δ must NOT be surfaced as a coverage Δ (unit mismatch).
        expect(result.summary.coverageRatioDelta).toBeUndefined();
    });

    it("card and sparkline values agree for friction (both from FLAG_FRICTION_DELTA)", async () => {
        mockSuccessfulFetch({ friction: [3, 11] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        const spark = result.summary.releaseFrictionSpark;
        expect(spark.at(-1)?.value).toBe(result.summary.releaseFrictionDelta);
    });

    it("card and sparkline values agree for error rate (both from FLAG_ERROR_RATE_DELTA)", async () => {
        mockSuccessfulFetch({ error: [-2, -9] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        const spark = result.summary.releaseErrorRateSpark;
        expect(spark.at(-1)?.value).toBe(result.summary.releaseErrorRateDelta);
    });

    it("activeFlagsDelta is always undefined regardless of sparkline length", async () => {
        mockSuccessfulFetch({ activation: [10] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        expect(result.summary.activeFlagsDelta).toBeUndefined();
    });

    it("coverageRatioDelta is always undefined regardless of sparkline length", async () => {
        mockSuccessfulFetch({ coverage: [65] });
        const result = await fetchFeatureFlagsData(DATE_RANGE);
        expect(result.summary.coverageRatioDelta).toBeUndefined();
    });
});

// ── fetchFeatureFlagsData — error fallback ───────────────────────────────────
//
// Sub-fetchers (registry, releaseImpact, timeseries) each have their own
// try/catch, so a graphqlFetch failure is swallowed before reaching the outer
// catch. The outer catch fires when resolveOrgId() — called unconditionally at
// the top of fetchFeatureFlagsData — throws. We trigger that by rejecting auth().

describe("fetchFeatureFlagsData — error fallback", () => {
    const DATE_RANGE = { startDate: "2026-05-01", endDate: "2026-05-14" };

    beforeEach(() => {
        mockGraphql.mockReset();
        // Restore the default auth mock after each test.
        mockAuth.mockResolvedValue({ user: { org_id: "org-test" } } as never);
    });

    it("re-throws on total fetch failure instead of returning an all-zero summary", async () => {
        // Reject auth() so resolveOrgId() throws inside fetchFeatureFlagsData.
        mockAuth.mockRejectedValueOnce(new Error("auth network error"));
        await expect(fetchFeatureFlagsData(DATE_RANGE)).rejects.toThrow("auth network error");
    });

    it("does not silently return a zero-valued 'healthy' summary on failure", async () => {
        mockAuth.mockRejectedValueOnce(new Error("session expired"));
        // Must reject — never resolve to a zero-valued summary masquerading as healthy.
        await expect(fetchFeatureFlagsData(DATE_RANGE)).rejects.toThrow("session expired");
    });
});
