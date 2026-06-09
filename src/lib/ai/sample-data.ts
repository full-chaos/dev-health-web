// ── Deterministic AI sample data for DEV_HEALTH_TEST_MODE ─────────────────────
//
// Mirrors the TestOps convention (src/lib/testops/sample-data.ts): typed
// constants returned by the signal resolver instead of hitting the API, so the
// AI hub renders realistic, deterministic card states in test mode. The values
// are CLEARLY SAMPLE — fixed dates, sample-* ids — and are deliberately chosen
// so the four signals derive a MIX of severities through the real derivation
// logic in areaSignals/ai.ts (never bypassing it):
//
//   ai-impact          → "low"     (reworkDragRate 0.08 → 8 < 15 on BACKEND_LADDER)
//   ai-review-load     → "medium"  (reviewAmplification 1.7: ≥ 1.5, < 2.0)
//   ai-governance-risk → "high"    (3 violations, worst severity "high")
//   ai-automations     → "neutral" (detector ready, 2 recommendations)

import type {
    AiGovernanceSummary,
    AiImpactSummary,
    AiOpportunitiesResult,
    AiReviewLoadResult,
} from "@/lib/graphql/__generated__/types";

const SAMPLE_START_DATE = "2026-05-26";
const SAMPLE_END_DATE = "2026-06-09";
const SAMPLE_ORG_ID = "default-org";

export const SAMPLE_AI_IMPACT_SUMMARY: AiImpactSummary = {
    orgId: SAMPLE_ORG_ID,
    startDate: SAMPLE_START_DATE,
    endDate: SAMPLE_END_DATE,
    dataAvailable: true,
    totalPrs: 120,
    aiAssistedPrs: 41,
    agentCreatedPrs: 9,
    humanPrs: 62,
    unknownPrs: 8,
    aiAssistedPrRatio: 0.34,
    computedAt: `${SAMPLE_END_DATE}T06:00:00Z`,
    byBucket: [
        {
            bucket: "ai_assisted",
            prsTotal: 41,
            prsMerged: 38,
            agentCreatedPrCount: 0,
            aiAssistedPrRatio: 0.34,
            aiCycleTimeDeltaHours: -4.2,
            aiReviewAmplification: 1.7,
            cycleTimeAvgHours: 22.5,
            incidentDragRate: 0.01,
            leverage: { prsComponent: 0.34, reworkComponent: -0.08 },
            revertRate: 0.02,
            reworkDragRate: 0.08,
            testGapRate: 0.22,
        },
    ],
    daily: [],
    missingStates: [],
    repoBreakdown: [
        {
            scopeId: "sample-repo-web",
            scopeLabel: "sample/web-app",
            aiPrsTotal: 24,
            aiAssistedPrRatio: 0.41,
            reworkRateDelta: 0.03,
        },
        {
            scopeId: "sample-repo-api",
            scopeLabel: "sample/api",
            aiPrsTotal: 17,
            aiAssistedPrRatio: 0.27,
            reworkRateDelta: -0.02,
        },
    ],
    teamBreakdown: [
        {
            scopeId: "sample-team-platform",
            scopeLabel: "Platform",
            aiPrsTotal: 29,
            aiAssistedPrRatio: 0.38,
            reworkRateDelta: 0.01,
        },
    ],
};

export const SAMPLE_AI_REVIEW_LOAD: AiReviewLoadResult = {
    orgId: SAMPLE_ORG_ID,
    startDate: SAMPLE_START_DATE,
    endDate: SAMPLE_END_DATE,
    dataAvailable: true,
    byBucket: [
        {
            bucket: "ai_assisted",
            prsTotal: 41,
            reviewsTotal: 96,
            reviewsPerPr: 2.3,
            changesRequestedPerPr: 0.6,
            reviewAmplification: 1.7,
            pickupLatencyHours: 5.4,
            reviewCommentsPerLoc: 0.045,
            postFirstReviewPushesCount: 52,
            postFirstReviewPushesPerPr: 1.3,
        },
    ],
    daily: [],
    missingStates: [],
    reviewerConcentration: {
        dataAvailable: true,
        reviewerCount: 11,
        reviewerGini: 0.42,
    },
};

export const SAMPLE_AI_GOVERNANCE_SUMMARY: AiGovernanceSummary = {
    orgId: SAMPLE_ORG_ID,
    startDate: SAMPLE_START_DATE,
    endDate: SAMPLE_END_DATE,
    dataAvailable: true,
    coverage: [],
    recentViolations: [
        {
            ruleId: "sample-rule-undeclared-tool",
            severity: "high",
            subjectType: "pull_request",
            subjectId: "sample-repo-web:482",
            evidence: "AI-attributed PR merged without a tool declaration.",
            observedAt: `${SAMPLE_END_DATE}T04:12:00Z`,
            repoId: "sample-repo-web",
            teamId: "sample-team-platform",
        },
        {
            ruleId: "sample-rule-review-bypass",
            severity: "medium",
            subjectType: "pull_request",
            subjectId: "sample-repo-api:171",
            evidence: "Agent-created PR approved without human review.",
            observedAt: `${SAMPLE_END_DATE}T01:40:00Z`,
            repoId: "sample-repo-api",
            teamId: null,
        },
        {
            ruleId: "sample-rule-policy-advisory",
            severity: "warning",
            subjectType: "artifact",
            subjectId: "sample-artifact-9",
            evidence: "Tool version drifted from the org allowlist entry.",
            observedAt: `${SAMPLE_START_DATE}T15:25:00Z`,
            repoId: null,
            teamId: null,
        },
    ],
};

export const SAMPLE_AI_OPPORTUNITIES: AiOpportunitiesResult = {
    orgId: SAMPLE_ORG_ID,
    detectorReady: true,
    recommendations: [
        {
            opportunityId: "sample-opp-1",
            kind: "DEPENDENCY_UPDATES",
            title: "Automate dependency updates in sample/web-app",
            rationale: "Recurring weekly dependency PRs match the AI-assisted heuristic.",
            score: 0.78,
            repoId: "sample-repo-web",
            teamId: "sample-team-platform",
            evidenceRefs: ["git_pull_requests:sample-repo-web:451"],
            workGraphDrilldowns: [
                { rootType: "pr", rootId: "sample-repo-web:451", label: "PR 451" },
            ],
        },
        {
            opportunityId: "sample-opp-2",
            kind: "TEST_GENERATION",
            title: "Generate tests for the legacy billing module",
            rationale: "High test-gap rate on AI-attributed PRs touching billing.",
            score: 0.61,
            repoId: "sample-repo-api",
            teamId: null,
            evidenceRefs: ["git_pull_requests:sample-repo-api:160"],
            workGraphDrilldowns: [
                { rootType: "pr", rootId: "sample-repo-api:160", label: "PR 160" },
            ],
        },
    ],
};
