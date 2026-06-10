/**
 * Synthetic AI Workflow Intelligence fixtures for MSW e2e mocks (CHAOS-1588).
 *
 * These fixtures cover the empty / partial / populated UX states the GraphQL
 * resolvers (CHAOS-1582) advertise via `dataAvailable`. Tests drive the mode
 * with the AI scope filter:
 *
 *   scope.teamId === "team-empty"     → empty contract (no buckets, no daily)
 *   scope.teamId === "team-missing"   → dataAvailable=false (missing-data UX)
 *   scope.teamId === "team-paginated" → attributed PRs only: 30-row multi-page
 *                                       set unfiltered, standard 3-row set
 *                                       once a workType filter is applied
 *   anything else                     → populated state with deltas
 *
 * Shapes mirror `src/lib/graphql/schema.graphql` AI types. Bucket coverage is
 * org-level only: no repo or team rollups, no per-author breakouts. Reviewer
 * concentration intentionally absent — it is deferred until aggregate-only
 * reviewer mix ships (CHAOS-1585 anti-surveillance posture).
 */

export type AIScopeVars = {
    repoId?: string | null;
    teamId?: string | null;
    workType?: string | null;
    buckets?: string[] | null;
};

export type AIMode = "empty" | "missing" | "populated";

export function resolveAIMode(scope: AIScopeVars | undefined | null): AIMode {
    const teamId = scope?.teamId ?? null;
    if (teamId === "team-empty") return "empty";
    if (teamId === "team-missing") return "missing";
    return "populated";
}

const COMPUTED_AT = "2026-05-19T00:00:00Z";

function side(bucket: string, overrides: Record<string, number> = {}) {
    return {
        bucket,
        prsTotal: 0,
        prsMerged: 0,
        cycleTimeAvgHours: 0,
        reviewsPerPr: 0,
        reworkRate: 0,
        revertRate: 0,
        testGapRate: 0,
        incidentRate: 0,
        ...overrides,
    };
}

function emptyComparison(orgId: string, startDate: string, endDate: string) {
    return {
        orgId,
        startDate,
        endDate,
        dataAvailable: false,
        aiSide: side("ai_assisted"),
        baselineSide: side("human"),
        delta: {
            cycleTimeDeltaHours: null,
            reviewsPerPrDelta: null,
            reworkRateDelta: null,
            revertRateDelta: null,
            testGapRateDelta: null,
            incidentRateDelta: null,
        },
    };
}

function populatedComparison(orgId: string, startDate: string, endDate: string) {
    return {
        orgId,
        startDate,
        endDate,
        dataAvailable: true,
        aiSide: side("ai_assisted", {
            prsTotal: 42,
            prsMerged: 38,
            cycleTimeAvgHours: 18.4,
            reviewsPerPr: 2.6,
            reworkRate: 0.22,
            revertRate: 0.04,
            testGapRate: 0.18,
            incidentRate: 0.03,
        }),
        baselineSide: side("human", {
            prsTotal: 120,
            prsMerged: 110,
            cycleTimeAvgHours: 22.1,
            reviewsPerPr: 1.9,
            reworkRate: 0.14,
            revertRate: 0.02,
            testGapRate: 0.11,
            incidentRate: 0.02,
        }),
        delta: {
            cycleTimeDeltaHours: -3.7,
            reviewsPerPrDelta: 0.7,
            reworkRateDelta: 0.08,
            revertRateDelta: 0.02,
            testGapRateDelta: 0.07,
            incidentRateDelta: 0.01,
        },
    };
}

export function aiComparisonResponse(
    orgId: string,
    startDate: string,
    endDate: string,
    mode: AIMode,
) {
    return mode === "populated"
        ? populatedComparison(orgId, startDate, endDate)
        : emptyComparison(orgId, startDate, endDate);
}

function leverage(overrides: Record<string, number> = {}) {
    return {
        prsComponent: 0,
        cycleTimeComponent: 0,
        reviewComponent: 0,
        reworkComponent: 0,
        testComponent: 0,
        incidentComponent: 0,
        ...overrides,
    };
}

function impactBucket(bucket: string, overrides: Record<string, number | object> = {}) {
    return {
        bucket,
        prsTotal: 0,
        prsMerged: 0,
        aiAssistedPrRatio: 0,
        agentCreatedPrCount: 0,
        cycleTimeAvgHours: 0,
        aiCycleTimeDeltaHours: 0,
        aiReviewAmplification: 0,
        reworkDragRate: 0,
        revertRate: 0,
        incidentDragRate: 0,
        testGapRate: 0,
        leverage: leverage(),
        ...overrides,
    };
}

function dailyRow(bucket: string, overrides: Record<string, number> = {}) {
    return {
        bucket,
        prsTotal: 0,
        prsMerged: 0,
        cycleTimeAvgHours: 0,
        reviewsPerPr: 0,
        changesRequestedPerPr: 0,
        reworkPrs: 0,
        reworkRate: 0,
        revertPrs: 0,
        revertRate: 0,
        incidentsCount: 0,
        incidentRate: 0,
        testGapPrs: 0,
        testGapRate: 0,
        ...overrides,
    };
}

export function aiImpactSummaryResponse(
    orgId: string,
    startDate: string,
    endDate: string,
    mode: AIMode,
) {
    if (mode === "missing") {
        return {
            orgId,
            startDate,
            endDate,
            totalPrs: 0,
            aiAssistedPrs: 0,
            agentCreatedPrs: 0,
            humanPrs: 0,
            unknownPrs: 0,
            aiAssistedPrRatio: 0,
            dataAvailable: false,
            computedAt: COMPUTED_AT,
            byBucket: [],
            daily: [],
            repoBreakdown: [],
            teamBreakdown: [],
            missingStates: [
                {
                    key: "unknown_attribution",
                    title: "Attribution unavailable",
                    guidance: "AI attribution coverage is not available for this scope yet.",
                },
            ],
        };
    }

    if (mode === "empty") {
        return {
            orgId,
            startDate,
            endDate,
            totalPrs: 0,
            aiAssistedPrs: 0,
            agentCreatedPrs: 0,
            humanPrs: 0,
            unknownPrs: 0,
            aiAssistedPrRatio: 0,
            dataAvailable: true,
            computedAt: COMPUTED_AT,
            byBucket: [],
            daily: [],
            repoBreakdown: [],
            teamBreakdown: [],
            missingStates: [],
        };
    }

    return {
        orgId,
        startDate,
        endDate,
        totalPrs: 162,
        aiAssistedPrs: 42,
        agentCreatedPrs: 12,
        humanPrs: 96,
        unknownPrs: 12,
        aiAssistedPrRatio: 0.26,
        dataAvailable: true,
        computedAt: COMPUTED_AT,
        missingStates: [],
        repoBreakdown: [
            {
                scopeId: "repo-web-app",
                scopeLabel: "web-app",
                aiPrsTotal: 18,
                aiAssistedPrRatio: 0.31,
                reworkRateDelta: 0.06,
            },
            {
                scopeId: "repo-api",
                scopeLabel: "api",
                aiPrsTotal: 14,
                aiAssistedPrRatio: 0.24,
                reworkRateDelta: 0.02,
            },
        ],
        teamBreakdown: [
            {
                scopeId: "team-platform",
                scopeLabel: "Platform",
                aiPrsTotal: 26,
                aiAssistedPrRatio: 0.29,
                reworkRateDelta: 0.05,
            },
            {
                scopeId: "team-product",
                scopeLabel: "Product",
                aiPrsTotal: 16,
                aiAssistedPrRatio: 0.21,
                reworkRateDelta: null,
            },
        ],
        byBucket: [
            impactBucket("ai_assisted", {
                prsTotal: 42,
                prsMerged: 38,
                aiAssistedPrRatio: 0.26,
                cycleTimeAvgHours: 18.4,
                aiCycleTimeDeltaHours: -3.7,
                aiReviewAmplification: 1.4,
                reworkDragRate: 0.22,
                revertRate: 0.04,
                testGapRate: 0.18,
                incidentDragRate: 0.03,
                leverage: leverage({
                    prsComponent: 0.12,
                    cycleTimeComponent: 0.06,
                    reviewComponent: -0.04,
                    reworkComponent: -0.05,
                    testComponent: -0.03,
                    incidentComponent: -0.01,
                }),
            }),
            impactBucket("agent_created", {
                prsTotal: 12,
                prsMerged: 11,
                agentCreatedPrCount: 12,
                cycleTimeAvgHours: 14.0,
            }),
            impactBucket("human", {
                prsTotal: 96,
                prsMerged: 88,
                cycleTimeAvgHours: 22.1,
            }),
            impactBucket("unknown", { prsTotal: 12, prsMerged: 10 }),
        ],
        daily: Array.from({ length: 7 }, (_, i) => dailyRow("agent_created", { prsTotal: i + 1 })),
    };
}

export function aiReviewLoadResponse(
    orgId: string,
    startDate: string,
    endDate: string,
    mode: AIMode,
) {
    if (mode === "missing") {
        return {
            orgId,
            startDate,
            endDate,
            dataAvailable: false,
            byBucket: [],
            daily: [],
            reviewerConcentration: { dataAvailable: false, reviewerCount: 0, reviewerGini: null },
            missingStates: [
                {
                    key: "reviewer_concentration",
                    title: "Reviewer concentration",
                    guidance: "Reviewer distribution is unavailable for this scope.",
                },
            ],
        };
    }

    if (mode === "empty") {
        return {
            orgId,
            startDate,
            endDate,
            dataAvailable: true,
            byBucket: [],
            daily: [],
            reviewerConcentration: { dataAvailable: false, reviewerCount: 0, reviewerGini: null },
            missingStates: [
                {
                    key: "reviewer_concentration",
                    title: "Reviewer concentration",
                    guidance: "Reviewer distribution is unavailable for this scope.",
                },
            ],
        };
    }

    return {
        orgId,
        startDate,
        endDate,
        dataAvailable: true,
        byBucket: [
            {
                bucket: "ai_assisted",
                prsTotal: 42,
                reviewsTotal: 110,
                reviewsPerPr: 2.6,
                changesRequestedPerPr: 0.9,
                reviewAmplification: 1.4,
                postFirstReviewPushesCount: 12,
                postFirstReviewPushesPerPr: 0.29,
                pickupLatencyHours: 6.2,
                reviewCommentsPerLoc: 0.032,
            },
            {
                bucket: "human",
                prsTotal: 96,
                reviewsTotal: 183,
                reviewsPerPr: 1.9,
                changesRequestedPerPr: 0.5,
                reviewAmplification: 1.0,
                postFirstReviewPushesCount: 14,
                postFirstReviewPushesPerPr: 0.15,
                pickupLatencyHours: 9.8,
                reviewCommentsPerLoc: 0.021,
            },
        ],
        daily: Array.from({ length: 7 }, (_, i) => ({
            bucket: "ai_assisted",
            prsTotal: 6 - i,
            reviewsTotal: 18 - i,
            reviewsPerPr: 2.4 + i * 0.05,
            changesRequestedPerPr: 0.9,
            reviewAmplification: 1.3 + i * 0.02,
            postFirstReviewPushesCount: 2,
            postFirstReviewPushesPerPr: 0.25,
            pickupLatencyHours: 6.0 + i * 0.1,
            reviewCommentsPerLoc: 0.03,
        })),
        reviewerConcentration: { dataAvailable: true, reviewerCount: 5, reviewerGini: 0.42 },
        missingStates: [],
    };
}

export function aiRiskBreakdownResponse(
    orgId: string,
    startDate: string,
    endDate: string,
    mode: AIMode,
) {
    if (mode === "missing") {
        return {
            orgId,
            startDate,
            endDate,
            dataAvailable: false,
            byBucket: [],
            hotspotOverlap: [],
            complexityOverlap: [],
            missingStates: [
                {
                    key: "hotspot_overlap",
                    title: "Hotspot file overlap",
                    guidance: "Hotspot overlap needs changed-file coverage for this scope.",
                },
                {
                    key: "complexity_overlap",
                    title: "High-complexity file overlap",
                    guidance: "Complexity overlap needs file complexity coverage for this scope.",
                },
            ],
        };
    }

    if (mode === "empty") {
        return {
            orgId,
            startDate,
            endDate,
            dataAvailable: true,
            byBucket: [],
            hotspotOverlap: [],
            complexityOverlap: [],
            missingStates: [
                {
                    key: "hotspot_overlap",
                    title: "Hotspot file overlap",
                    guidance: "Hotspot overlap needs changed-file coverage for this scope.",
                },
                {
                    key: "complexity_overlap",
                    title: "High-complexity file overlap",
                    guidance: "Complexity overlap needs file complexity coverage for this scope.",
                },
            ],
        };
    }

    // Populated mode mirrors the post-ops-#823 contract: real overlap rows and
    // NO hotspot/complexity missing-states. The complexity rate is a computed
    // REAL ZERO (0 of 44), distinct from unavailable.
    return {
        orgId,
        startDate,
        endDate,
        dataAvailable: true,
        missingStates: [],
        hotspotOverlap: [
            {
                bucket: "ai_assisted",
                prsTotal: 44,
                prsTouchingHotspots: 26,
                hotspotOverlapRate: 0.59,
                avgHotspotRiskScore: 1.48,
            },
        ],
        complexityOverlap: [
            {
                bucket: "ai_assisted",
                prsTotal: 44,
                prsTouchingHighComplexity: 0,
                complexityOverlapRate: 0,
            },
        ],
        byBucket: [
            {
                bucket: "ai_assisted",
                prsTotal: 42,
                reworkPrs: 9,
                reworkRate: 0.22,
                revertPrs: 2,
                revertRate: 0.04,
                testGapPrs: 8,
                testGapRate: 0.18,
                incidentsCount: 1,
                incidentRate: 0.03,
            },
            {
                bucket: "human",
                prsTotal: 96,
                reworkPrs: 13,
                reworkRate: 0.14,
                revertPrs: 2,
                revertRate: 0.02,
                testGapPrs: 11,
                testGapRate: 0.11,
                incidentsCount: 2,
                incidentRate: 0.02,
            },
        ],
    };
}

export function aiOpportunitiesResponse(orgId: string, mode: AIMode) {
    if (mode !== "populated") {
        return { orgId, detectorReady: false, recommendations: [] };
    }
    return {
        orgId,
        detectorReady: true,
        recommendations: [
            {
                opportunityId: "opp-1",
                kind: "DEPENDENCY_UPDATES",
                repoId: "repo-1",
                teamId: "team-platform",
                title: "Automate dependency updates in platform repo",
                rationale: "Recurring weekly dependency PRs match the AI-assisted heuristic.",
                score: 0.78,
                evidenceRefs: [
                    "git_pull_requests:repo-1:1001",
                    "git_pull_requests:repo-1:1009",
                    "git_pull_requests:repo-1:1014",
                ],
                workGraphDrilldowns: [
                    { rootType: "pr", rootId: "repo-1:1001", label: "PR 1001" },
                    { rootType: "pr", rootId: "repo-1:1009", label: "PR 1009" },
                ],
            },
            {
                opportunityId: "opp-2",
                kind: "TEST_GENERATION",
                repoId: "repo-2",
                teamId: "team-platform",
                title: "Generate tests for legacy module",
                rationale: "Low test-delta on AI-attributed PRs flagged this module for follow-up.",
                score: 0.62,
                evidenceRefs: ["git_pull_requests:repo-2:1020", "git_pull_requests:repo-2:1024"],
                workGraphDrilldowns: [{ rootType: "pr", rootId: "repo-2:1020", label: "PR 1020" }],
            },
        ],
    };
}

export function aiAttributedPrsResponse(
    orgId: string,
    startDate: string,
    endDate: string,
    mode: AIMode,
    limit = 50,
    offset = 0,
    scope: AIScopeVars | null = null,
) {
    if (mode === "missing") {
        return {
            orgId,
            startDate,
            endDate,
            total: 0,
            hasMore: false,
            dataAvailable: false,
            rows: [],
        };
    }
    if (mode === "empty") {
        return {
            orgId,
            startDate,
            endDate,
            total: 0,
            hasMore: false,
            dataAvailable: true,
            rows: [],
        };
    }
    // Pagination harness scope: `team-paginated` returns a multi-page result
    // set when UNFILTERED and the standard 3-row set once a workType filter is
    // applied, so a spec can paginate to page 2 and then narrow the filter — a
    // stale offset against the shrunken set is exactly the sparse-page bug
    // (the list must reset to page 1 on any filter change instead).
    if (scope?.teamId === "team-paginated" && !scope?.workType) {
        const kinds = ["ai_assisted", "agent_created", "ai_review"];
        const generated = Array.from({ length: 30 }, (_, i) => ({
            repoId: "repo-paginated",
            number: 300 + i,
            title: `Paginated sample PR ${300 + i}`,
            kind: kinds[i % kinds.length],
            workType: "feature",
            teamId: "team-paginated",
            mergedAt: `${endDate}T12:00:00Z`,
        }));
        return {
            orgId,
            startDate,
            endDate,
            total: generated.length,
            hasMore: offset + limit < generated.length,
            dataAvailable: true,
            rows: generated.slice(offset, offset + limit),
        };
    }
    const rows = [
        {
            repoId: "repo-web-app",
            number: 201,
            title: "Add feature flag for new pricing page",
            kind: "ai_assisted",
            workType: "feature",
            teamId: "team-platform",
            mergedAt: `${endDate}T15:00:00Z`,
        },
        {
            repoId: "repo-web-app",
            number: 198,
            title: "Refactor auth middleware",
            kind: "agent_created",
            workType: "tech-debt",
            teamId: "team-platform",
            mergedAt: `${endDate}T09:30:00Z`,
        },
        {
            repoId: "repo-api",
            number: 154,
            title: "Generate snapshot tests for legacy module",
            kind: "ai_review",
            workType: "feature",
            teamId: "team-platform",
            mergedAt: null,
        },
    ];
    const page = rows.slice(offset, offset + limit);
    return {
        orgId,
        startDate,
        endDate,
        total: rows.length,
        hasMore: offset + limit < rows.length,
        dataAvailable: true,
        rows: page,
    };
}

export function aiGovernanceSummaryResponse(
    orgId: string,
    startDate: string,
    endDate: string,
    mode: AIMode,
) {
    if (mode === "missing") {
        return { orgId, startDate, endDate, dataAvailable: false, recentViolations: [] };
    }
    if (mode === "empty") {
        return { orgId, startDate, endDate, dataAvailable: true, recentViolations: [] };
    }
    return {
        orgId,
        startDate,
        endDate,
        dataAvailable: true,
        recentViolations: [
            {
                ruleId: "ai-declaration-required",
                severity: "MEDIUM",
                subjectType: "PR",
                subjectId: "pr-7001",
                teamId: "team-platform",
                repoId: "repo-1",
                observedAt: "2026-05-18T15:21:00Z",
                evidence: "PR merged without explicit AI assistance declaration.",
            },
            {
                ruleId: "human-review-required",
                severity: "HIGH",
                subjectType: "PR",
                subjectId: "pr-7002",
                teamId: "team-platform",
                repoId: "repo-2",
                observedAt: "2026-05-17T10:02:00Z",
                evidence: "Agent-created PR merged without human review approval.",
            },
        ],
    };
}

export function catalogValuesResponse(dimension: string) {
    const values: Record<string, Array<{ value: string; count: number }>> = {
        TEAM: [
            { value: "team-platform", count: 30 },
            { value: "team-product", count: 21 },
        ],
        REPO: [
            { value: "repo-1", count: 42 },
            { value: "repo-2", count: 18 },
        ],
        WORK_TYPE: [
            { value: "feature", count: 22 },
            { value: "bug", count: 14 },
            { value: "chore", count: 9 },
        ],
    };
    return {
        dimension,
        values: values[dimension] ?? [],
        measures: [],
        limits: { rowLimit: 100, dimensions: [] },
    };
}
