// ── Deterministic Govern sample data for DEV_HEALTH_TEST_MODE (CHAOS-2223) ────
//
// Mirrors the established TestOps/AI convention (src/lib/testops/sample-data.ts,
// src/lib/ai/sample-data.ts): typed constants returned by the resolver instead of
// hitting the network, so the Govern hub renders realistic, deterministic card
// states in test mode. The values are CLEARLY SAMPLE — fixed dates, sample-* ids
// — and flow through the REAL severity derivation in areaSignals/govern.ts
// (never bypassing it):
//
//   security         → "high"   (0 critical, 2 high, 9 open → high>=1 ladder)
//   risk-compounding → "medium" (worst row severity ELEVATED → medium)

import type { CompoundingRiskResult, SecurityOverview } from "@/lib/graphql/__generated__/types";

const SAMPLE_START_DATE = "2026-05-26";
const SAMPLE_END_DATE = "2026-06-09";
const SAMPLE_ORG_ID = "default-org";

export const SAMPLE_GOVERN_SECURITY_OVERVIEW: SecurityOverview = {
    kpis: {
        critical: 0,
        high: 2,
        meanDaysToFix30d: 4.5,
        openDelta30d: -3,
        openTotal: 9,
    },
    severityBreakdown: [
        { severity: "HIGH", count: 2 },
        { severity: "MEDIUM", count: 4 },
        { severity: "LOW", count: 3 },
    ],
    topRepos: [
        { repoId: "sample-repo-web", repoName: "sample/web-app", count: 5, repoUrl: null },
        { repoId: "sample-repo-api", repoName: "sample/api", count: 4, repoUrl: null },
    ],
    trend: [
        { day: SAMPLE_START_DATE, opened: 2, fixed: 1 },
        { day: SAMPLE_END_DATE, opened: 1, fixed: 3 },
    ],
};

export const SAMPLE_GOVERN_COMPOUNDING_RISK: CompoundingRiskResult = {
    orgId: SAMPLE_ORG_ID,
    generatedAt: `${SAMPLE_END_DATE}T06:00:00Z`,
    breakout: "REPO",
    rows: [
        {
            day: SAMPLE_END_DATE,
            scope: "REPO",
            scopeId: "sample-repo-web",
            scopeLabel: "sample/web-app",
            scopeEntity: { id: "sample-repo-web", displayName: "sample/web-app" },
            computedAt: `${SAMPLE_END_DATE}T06:00:00Z`,
            score: 0.6,
            severity: "ELEVATED",
            components: {
                busFactor: 1.8,
                churnNorm: 0.5,
                complexityDelta: 0.1,
                complexityNorm: 0.4,
                ownershipGini: 0.55,
                ownershipNorm: 0.5,
                reviewLatencyP90h: 36,
                reviewNorm: 0.3,
                reworkChurn: 0.2,
                singleOwnerRatio: 0.6,
            },
            thresholds: { elevated: 0.4, high: 0.7 },
            weights: { churn: 0.25, complexity: 0.25, ownership: 0.25, review: 0.25 },
        },
        {
            day: SAMPLE_END_DATE,
            scope: "REPO",
            scopeId: "sample-repo-api",
            scopeLabel: "sample/api",
            scopeEntity: { id: "sample-repo-api", displayName: "sample/api" },
            computedAt: `${SAMPLE_END_DATE}T06:00:00Z`,
            score: 0.18,
            severity: "LOW",
            components: {
                busFactor: 3.2,
                churnNorm: 0.1,
                complexityDelta: 0.02,
                complexityNorm: 0.15,
                ownershipGini: 0.3,
                ownershipNorm: 0.2,
                reviewLatencyP90h: 10,
                reviewNorm: 0.1,
                reworkChurn: 0.05,
                singleOwnerRatio: 0.25,
            },
            thresholds: { elevated: 0.4, high: 0.7 },
            weights: { churn: 0.25, complexity: 0.25, ownership: 0.25, review: 0.25 },
        },
    ],
    trend: [
        { day: SAMPLE_START_DATE, score: 0.3, severity: "LOW" },
        { day: SAMPLE_END_DATE, score: 0.6, severity: "ELEVATED" },
    ],
};
