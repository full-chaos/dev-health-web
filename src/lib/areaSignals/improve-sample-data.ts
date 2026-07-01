// ── Deterministic Improve Automations sample data for DEV_HEALTH_TEST_MODE ────
// (CHAOS-2223)
//
// Opportunities + home (Improve's other two sources) are already MSW-mockable
// REST, fetched unconditionally regardless of isTestMode (see improve.ts) —
// they render real mock-backend data in test mode already. Automations was the
// one GraphQL-direct source that still short-circuited to an honest-empty card
// because the shared mock GraphQL server has no `improveOpportunities` handler.
// This constant follows the Govern/Diagnose/AI convention instead: a typed
// sample flowing through the REAL derivation in areaSignals/improve.ts (never
// bypassing it) — detectorReady + totalCount 3 → "neutral", "3 detected".

import type { ImproveOpportunitiesResult } from "@/lib/graphql/__generated__/types";

const SAMPLE_ORG_ID = "default-org";

export const SAMPLE_IMPROVE_AUTOMATIONS: ImproveOpportunitiesResult = {
    orgId: SAMPLE_ORG_ID,
    detectorReady: true,
    totalCount: 3,
    opportunities: [
        {
            opportunityId: "sample-improve-opp-1",
            entityId: "sample-repo-web",
            entityType: "repo",
            kind: "HIGH_CHURN",
            title: "Automate churn reduction in sample/web-app",
            rationale: "Recurring high-churn files match the automation heuristic.",
            recommendedAction: "Auto-flag files with 3+ reworks/week for a dedicated cleanup pass.",
            score: 0.72,
            severity: "medium",
            evidenceRefs: ["git_pull_requests:sample-repo-web:512"],
        },
        {
            opportunityId: "sample-improve-opp-2",
            entityId: "sample-repo-api",
            entityType: "repo",
            kind: "SLOW_CYCLE_TIME",
            title: "Automate cycle-time triage in sample/api",
            rationale: "Cycle time regressions cluster around review latency.",
            recommendedAction: "Route slow PRs to a fast-track reviewer queue.",
            score: 0.58,
            severity: "low",
            evidenceRefs: ["git_pull_requests:sample-repo-api:88"],
        },
    ],
};
