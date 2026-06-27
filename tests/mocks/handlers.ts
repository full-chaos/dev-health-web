/**
 * MSW v2 request handlers for Playwright e2e tests.
 *
 * These handlers replace the inline DEV_HEALTH_TEST_MODE conditionals that
 * were previously scattered across production components.  The Express mock
 * server (http-server.ts) mounts them on port 8000, which is the default
 * BACKEND_URL that the Next.js proxy middleware rewrites to.
 */

import { http, HttpResponse } from "msw";

import type {
    LoginResponseBody,
    TokenValidateResponseBody,
    TokenRefreshResponseBody,
    OnboardResponseBody,
    MockBillingPlan,
    MockCredential,
    MockSyncConfig,
    MockTeam,
    MockIdentity,
} from "./types";

import {
    reviewHeatmapSample,
    hotspotHeatmapSample,
    churnHotspotContributors,
    sankeyStateTransitionSample,
    sankeyHotspotNodes,
    sankeyHotspotLinks,
    sankeyExpenseNodes,
    sankeyExpenseLinks,
    sankeyInvestmentNodes,
    sankeyInvestmentLinks,
} from "../../src/data/devHealthOpsSample";

import {
    aiAttributedPrsResponse,
    aiComparisonResponse,
    aiGovernanceSummaryResponse,
    aiImpactSummaryResponse,
    aiOpportunitiesResponse,
    aiReviewLoadResponse,
    aiRiskBreakdownResponse,
    catalogValuesResponse,
    resolveAIMode,
    type AIScopeVars,
} from "./aiSample";

const investmentMixSample = {
    theme_distribution: {
        feature_delivery: 644.6,
        maintenance: 606,
        operational: 423.6,
        quality: 550.2,
        risk: 125.6,
    },
    subcategory_distribution: {
        "feature_delivery.customer": 320.6,
        "feature_delivery.roadmap": 200.8,
        "feature_delivery.enablement": 123.2,
        "maintenance.debt": 279.2,
        "maintenance.refactor": 250.8,
        "maintenance.upgrade": 76,
        "operational.incident_response": 206,
        "operational.support": 167.2,
        "operational.on_call": 50.4,
        "quality.bugfix": 250.6,
        "quality.testing": 177.4,
        "quality.reliability": 122.2,
        "risk.security": 82.8,
        "risk.compliance": 30.4,
        "risk.vulnerability": 12.4,
    },
    unit: "loc",
};

const investmentRepoTeamMapSample = {
    "repo:web-app": "Growth",
    "repo:core-api": "Core",
    "repo:infra": "Infra",
    "repo:search": "Data",
};

const workUnitInvestmentsSample = [
    {
        work_unit_id: "wu-41c2a",
        work_unit_type: "story",
        work_unit_name: "PROJ-123: Launch customer onboarding",
        display_name: "PROJ-123: Launch customer onboarding",
        provider: "jira",
        item_type: "issue",
        key: "PROJ-123",
        time_range: { start: "2025-02-01T12:00:00Z", end: "2025-02-03T18:00:00Z" },
        effort: { metric: "churn_loc", value: 820 },
        investment: {
            themes: {
                feature_delivery: 0.52,
                maintenance: 0.18,
                operational: 0.16,
                quality: 0.1,
                risk: 0.04,
            },
            subcategories: {
                "feature_delivery.customer": 0.32,
                "feature_delivery.roadmap": 0.2,
                "maintenance.refactor": 0.12,
                "maintenance.debt": 0.06,
                "operational.incident_response": 0.1,
                "operational.support": 0.06,
                "quality.testing": 0.1,
                "risk.security": 0.04,
            },
        },
        evidence_quality: { value: 0.78, band: "moderate" },
        evidence: {
            textual: [
                {
                    type: "text_phrase",
                    phrase: "feature launch",
                    source: "issue_title",
                },
            ],
            structural: [{ type: "work_item_type", work_item_type: "story", count: 3 }],
            contextual: [
                {
                    type: "time_range",
                    start: "2025-02-01T12:00:00Z",
                    end: "2025-02-03T18:00:00Z",
                    span_days: 2.25,
                    score: 0.64,
                },
                { type: "repo_scope", repo_ids: ["repo:web-app"] },
                { type: "team_scope", team_ids: ["growth"], team_names: ["Growth"] },
            ],
        },
    },
    {
        work_unit_id: "wu-53a17",
        work_unit_type: "pr",
        work_unit_name: "Refactor debt cleanup",
        display_name: "github:pr:#482 Refactor debt cleanup",
        provider: "github",
        item_type: "pr",
        key: "#482",
        time_range: { start: "2025-02-02T09:00:00Z", end: "2025-02-04T16:30:00Z" },
        effort: { metric: "churn_loc", value: 540 },
        investment: {
            themes: {
                feature_delivery: 0.12,
                maintenance: 0.58,
                operational: 0.08,
                quality: 0.18,
                risk: 0.04,
            },
            subcategories: {
                "feature_delivery.enablement": 0.12,
                "maintenance.debt": 0.3,
                "maintenance.refactor": 0.18,
                "maintenance.upgrade": 0.1,
                "operational.support": 0.08,
                "quality.bugfix": 0.12,
                "quality.reliability": 0.06,
                "risk.compliance": 0.04,
            },
        },
        evidence_quality: { value: 0.84, band: "high" },
        evidence: {
            textual: [],
            structural: [{ type: "work_item_type", work_item_type: "chore", count: 2 }],
            contextual: [
                {
                    type: "time_range",
                    start: "2025-02-02T09:00:00Z",
                    end: "2025-02-04T16:30:00Z",
                    span_days: 2.3,
                    score: 0.72,
                },
                { type: "repo_scope", repo_ids: ["repo:core-api"] },
                { type: "team_scope", team_ids: ["core"], team_names: ["Core"] },
            ],
        },
    },
    {
        work_unit_id: "wu-7ed90",
        work_unit_type: "incident",
        work_unit_name: "Hotfix on-call regression",
        display_name: "INC-77: Hotfix on-call regression",
        provider: "pagerduty",
        item_type: "incident",
        key: "INC-77",
        time_range: { start: "2025-02-05T08:00:00Z", end: "2025-02-06T20:00:00Z" },
        effort: { metric: "churn_loc", value: 310 },
        investment: {
            themes: {
                feature_delivery: 0.06,
                maintenance: 0.12,
                operational: 0.6,
                quality: 0.18,
                risk: 0.04,
            },
            subcategories: {
                "feature_delivery.customer": 0.06,
                "maintenance.debt": 0.12,
                "operational.incident_response": 0.4,
                "operational.on_call": 0.12,
                "operational.support": 0.08,
                "quality.reliability": 0.1,
                "quality.bugfix": 0.08,
                "risk.vulnerability": 0.04,
            },
        },
        evidence_quality: { value: 0.55, band: "low" },
        evidence: {
            textual: [{ type: "text_phrase", phrase: "hotfix", source: "pr_title" }],
            structural: [{ type: "work_item_type", work_item_type: "incident", count: 1 }],
            contextual: [
                {
                    type: "time_range",
                    start: "2025-02-05T08:00:00Z",
                    end: "2025-02-06T20:00:00Z",
                    span_days: 1.5,
                    score: 0.44,
                },
                { type: "repo_scope", repo_ids: ["repo:infra"] },
                { type: "team_scope", team_ids: ["infra"], team_names: ["Infra"] },
            ],
        },
    },
];

const cycleBreakdownFlameSample = {
    mode: "cycle_breakdown",
    unit: "hours",
    root: {
        name: "Total Cycle Time",
        value: 847.2,
        children: [
            {
                name: "In Progress",
                value: 412.5,
                children: [
                    { name: "Development", value: 245.3 },
                    { name: "Code Review", value: 98.7 },
                    { name: "Testing", value: 68.5 },
                ],
            },
            {
                name: "Waiting",
                value: 312.4,
                children: [
                    { name: "Waiting for Review", value: 156.2 },
                    { name: "Blocked", value: 89.1 },
                    { name: "Waiting for Deploy", value: 67.1 },
                ],
            },
            {
                name: "Review",
                value: 122.3,
                children: [
                    { name: "Initial Review", value: 78.4 },
                    { name: "Re-review", value: 43.9 },
                ],
            },
        ],
    },
    meta: {
        window_start: "2025-01-01",
        window_end: "2025-01-30",
        filters: {},
        notes: ["Sample data for demonstration"],
    },
};

const codeHotspotsFlameSample = {
    mode: "code_hotspots",
    unit: "changes",
    root: {
        name: "All Repositories",
        value: 1247,
        children: [
            {
                name: "dev-health-ops",
                value: 523,
                children: [
                    {
                        name: "src/api",
                        value: 234,
                        children: [
                            { name: "routes.py", value: 89 },
                            { name: "services/", value: 78 },
                            { name: "middleware.py", value: 67 },
                        ],
                    },
                    {
                        name: "src/processors",
                        value: 178,
                        children: [
                            { name: "sync.py", value: 92 },
                            { name: "local.py", value: 86 },
                        ],
                    },
                    { name: "src/metrics", value: 111 },
                ],
            },
            {
                name: "dev-health-web",
                value: 412,
                children: [
                    {
                        name: "src/components",
                        value: 245,
                        children: [
                            { name: "charts/", value: 134 },
                            { name: "work/", value: 78 },
                            { name: "navigation/", value: 33 },
                        ],
                    },
                    {
                        name: "src/lib",
                        value: 167,
                        children: [
                            { name: "api.ts", value: 56 },
                            { name: "graphql/", value: 62 },
                            { name: "filters/", value: 49 },
                        ],
                    },
                ],
            },
            {
                name: "atlassian",
                value: 312,
                children: [
                    { name: "src/client", value: 156 },
                    { name: "src/schema", value: 98 },
                    { name: "tests/", value: 58 },
                ],
            },
        ],
    },
    meta: {
        window_start: "2025-01-01",
        window_end: "2025-01-30",
        filters: {},
        notes: ["Sample data for demonstration"],
    },
};

const throughputFlameSample = {
    mode: "throughput",
    unit: "items",
    root: {
        name: "Completed Work",
        value: 156,
        children: [
            {
                name: "Features",
                value: 67,
                children: [
                    { name: "Customer Requests", value: 34 },
                    { name: "Roadmap Items", value: 22 },
                    { name: "Internal Tools", value: 11 },
                ],
            },
            {
                name: "Bug Fixes",
                value: 48,
                children: [
                    { name: "Critical", value: 8 },
                    { name: "High Priority", value: 18 },
                    { name: "Normal", value: 22 },
                ],
            },
            {
                name: "Maintenance",
                value: 28,
                children: [
                    { name: "Dependency Updates", value: 12 },
                    { name: "Refactoring", value: 10 },
                    { name: "Documentation", value: 6 },
                ],
            },
            {
                name: "Tech Debt",
                value: 13,
                children: [
                    { name: "Performance", value: 7 },
                    { name: "Code Quality", value: 6 },
                ],
            },
        ],
    },
    meta: {
        window_start: "2025-01-01",
        window_end: "2025-01-30",
        filters: {},
        notes: ["Sample data for demonstration"],
    },
};

const sampleCapacityForecast = {
    forecastId: "sample-forecast-001",
    computedAt: "2026-01-29T12:00:00Z",
    teamId: "team-alpha",
    workScopeId: "project-main",
    backlogSize: 47,
    targetItems: 47,
    p50Date: "2026-02-10",
    p85Date: "2026-02-17",
    p95Date: "2026-02-25",
    p50Days: 12,
    p85Days: 19,
    p95Days: 27,
    throughputMean: 3.2,
    throughputStddev: 1.8,
    historyDays: 90,
    insufficientHistory: false,
    highVariance: false,
};

function operatingReviewMetric(
    key: string,
    label: string,
    value: number,
    unit: string,
    priorValue: number,
    status: "changed" | "improved" | "worsened" | "unchanged",
) {
    const absolute = value - priorValue;
    return {
        key,
        label,
        value,
        unit,
        delta: {
            value,
            priorValue,
            absolute,
            percent: priorValue === 0 ? null : absolute / priorValue,
            status,
        },
    };
}

function operatingReviewResponse(
    orgId: string,
    input?: { teamId?: string | null; weekStart?: string },
) {
    const weekStart = input?.weekStart ?? "2026-05-18";
    return {
        orgId,
        teamId: input?.teamId ?? null,
        weekStart,
        priorWeekStart: "2026-05-11",
        sections: [
            {
                key: "delivery_movement",
                title: "Delivery movement",
                metrics: [
                    operatingReviewMetric("throughput", "Throughput", 42, "items", 38, "improved"),
                ],
                improved: ["Throughput increased without expanding WIP."],
                worsened: [],
                changed: ["Cycle time held steady week over week."],
            },
            {
                key: "ai_workflow_intelligence",
                title: "AI Workflow Intelligence",
                metrics: [
                    operatingReviewMetric(
                        "ai_assisted_pr_ratio",
                        "AI-assisted PR ratio",
                        26,
                        "%",
                        22,
                        "changed",
                    ),
                    operatingReviewMetric(
                        "ai_review_amplification",
                        "Review amplification",
                        1.4,
                        "×",
                        1.2,
                        "worsened",
                    ),
                    operatingReviewMetric(
                        "ai_test_gap_rate",
                        "AI test gap rate",
                        18,
                        "%",
                        21,
                        "improved",
                    ),
                ],
                improved: [
                    "AI-attributed test gap rate moved down while attribution coverage stayed available.",
                ],
                worsened: ["Review amplification rose for AI-attributed pull requests."],
                changed: [
                    "Automation candidates are available with Work Graph evidence drilldowns.",
                ],
            },
        ],
        recommendations: [
            "Review AI workflow evidence for high-amplification PRs before adding more automation.",
        ],
        recommendationsEmptyState: "No rule-engine recommendations for this week.",
    };
}

// ---------------------------------------------------------------------------
// People search
// ---------------------------------------------------------------------------

const SAMPLE_PEOPLE = [
    {
        person_id: "person-123",
        display_name: "Alex Harper",
        identities: [{ provider: "github", handle: "aharper" }],
        active: true,
    },
    {
        person_id: "person-456",
        display_name: "Jordan Lee",
        identities: [{ provider: "github", handle: "jlee" }],
        active: true,
    },
    {
        person_id: "person-789",
        display_name: "Sam Rivera",
        identities: [{ provider: "gitlab", handle: "srivera" }],
        active: true,
    },
];

// ---------------------------------------------------------------------------
// Sankey mode → response mapping
// ---------------------------------------------------------------------------

const SANKEY_RESPONSES: Record<
    string,
    { nodes: unknown[]; links: unknown[]; label: string; unit: string }
> = {
    state: {
        nodes: sankeyStateTransitionSample
            .flatMap((t) => [
                { name: t.fromStatus, group: "status" },
                { name: t.toStatus, group: "status" },
            ])
            .filter((n, i, arr) => arr.findIndex((x) => x.name === n.name) === i),
        links: sankeyStateTransitionSample.map((t) => ({
            source: t.fromStatus,
            target: t.toStatus,
            value: t.count,
        })),
        label: "State transitions",
        unit: "items",
    },
    hotspot: {
        nodes: sankeyHotspotNodes,
        links: sankeyHotspotLinks,
        label: "Code hotspots",
        unit: "changes",
    },
    expense: {
        nodes: sankeyExpenseNodes,
        links: sankeyExpenseLinks,
        label: "Investment expense",
        unit: "items",
    },
    investment: {
        nodes: sankeyInvestmentNodes,
        links: sankeyInvestmentLinks,
        label: "Investment flow",
        unit: "units",
    },
};

// ---------------------------------------------------------------------------
// Aggregated flame mode → response mapping
// ---------------------------------------------------------------------------

const FLAME_RESPONSES: Record<string, Parameters<typeof HttpResponse.json>[0]> = {
    cycle_breakdown: cycleBreakdownFlameSample,
    code_hotspots: codeHotspotsFlameSample,
    throughput: throughputFlameSample,
};

const SAMPLE_INVOICE = {
    id: "inv-e2e-1",
    org_id: "org-e2e",
    subscription_id: "sub-e2e-1",
    stripe_invoice_id: "in_e2e_001",
    stripe_customer_id: "cus_e2e_001",
    status: "open",
    amount_due: 12000,
    amount_paid: 0,
    amount_remaining: 12000,
    currency: "usd",
    period_start: "2026-02-01T00:00:00.000Z",
    period_end: "2026-02-29T23:59:59.000Z",
    hosted_invoice_url: "https://billing.stripe.test/in_e2e_001",
    pdf_url: "https://billing.stripe.test/in_e2e_001.pdf",
    payment_intent_id: null,
    finalized_at: "2026-02-01T00:00:00.000Z",
    paid_at: null,
    voided_at: null,
    attempt_count: 0,
    metadata: {},
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
    line_items: [
        {
            id: "line-e2e-1",
            stripe_line_item_id: "il_e2e_1",
            description: "Team plan",
            amount: 12000,
            quantity: 1,
            period_start: "2026-02-01T00:00:00.000Z",
            period_end: "2026-02-29T23:59:59.000Z",
            stripe_price_id: "price_e2e_team",
        },
    ],
};

const SAMPLE_SUBSCRIPTION = {
    id: "sub-e2e-1",
    org_id: "org-e2e",
    status: "active",
    stripe_subscription_id: "sub_e2e_001",
    stripe_customer_id: "cus_e2e_001",
    current_period_start: "2026-02-01T00:00:00.000Z",
    current_period_end: "2026-02-28T23:59:59.000Z",
    cancel_at_period_end: false,
    canceled_at: null,
    trial_start: null,
    trial_end: null,
    plan: { name: "Team", key: "team" },
    price: { interval: "monthly", display_amount: "$49", amount: "4900" },
};

const SAMPLE_REFUND = {
    id: "refund-e2e-1",
    org_id: "org-e2e",
    invoice_id: "inv-e2e-1",
    subscription_id: "sub-e2e-1",
    stripe_refund_id: "re_e2e_001",
    stripe_charge_id: "ch_e2e_001",
    stripe_payment_intent_id: "pi_e2e_001",
    amount: 12000,
    currency: "usd",
    status: "succeeded",
    reason: "requested_by_customer",
    description: "Customer requested refund",
    failure_reason: null,
    initiated_by: "e2e-user-1",
    metadata: {},
    created_at: "2026-02-02T10:00:00.000Z",
    updated_at: "2026-02-02T10:05:00.000Z",
};

const SAMPLE_BILLING_AUDIT = {
    id: "11111111-1111-1111-1111-111111111111",
    org_id: "org-e2e",
    actor_id: "e2e-user-1",
    action: "invoice.void",
    resource_type: "invoice",
    resource_id: "inv-e2e-1",
    description: "Invoice voided",
    stripe_event_id: "evt_e2e_001",
    local_state: {},
    stripe_state: {},
    reconciliation_status: "matched",
    created_at: "2026-02-02T09:00:00.000Z",
};

const MOCK_BILLING_PLANS: MockBillingPlan[] = [
    {
        id: "plan-team",
        key: "team",
        name: "Team",
        description: "Team plan",
        tier: "team",
        is_active: true,
        display_order: 1,
        stripe_product_id: null,
        metadata: {},
        prices: [
            {
                id: "price-team-monthly",
                plan_id: "plan-team",
                interval: "monthly",
                amount: 4900,
                currency: "usd",
                is_active: true,
                stripe_price_id: "price_team_monthly_e2e",
            },
        ],
        bundles: [],
    },
    {
        id: "plan-enterprise",
        key: "enterprise",
        name: "Enterprise",
        description: "Enterprise plan",
        tier: "enterprise",
        is_active: true,
        display_order: 2,
        stripe_product_id: null,
        metadata: {},
        prices: [
            {
                id: "price-enterprise-monthly",
                plan_id: "plan-enterprise",
                interval: "monthly",
                amount: 12900,
                currency: "usd",
                is_active: true,
                stripe_price_id: "price_enterprise_monthly_e2e",
            },
        ],
        bundles: [],
    },
];

const MOCK_CREDENTIALS: MockCredential[] = [
    {
        id: "cred-github-1",
        provider: "github",
        name: "GitHub Token",
        created_at: "2026-01-15T00:00:00.000Z",
    },
];

const MOCK_SYNC_CONFIGS: MockSyncConfig[] = [
    {
        id: "sync-config-edit-repos",
        provider: "github",
        name: "Editable Repos",
        enabled: true,
        credential_id: "cred-github-1",
        sync_targets: ["git"],
        sync_options: { owner: "myorg" },
        is_active: true,
        schedule_cron: null,
        timezone: null,
        initial_sync_depth: 30,
        last_sync_at: null,
        last_sync_success: null,
        last_sync_error: null,
        parent_id: null,
        created_at: "2026-01-15T00:00:00.000Z",
        updated_at: "2026-01-15T00:00:00.000Z",
    },
];
const MOCK_SYNC_JOBS = [
    {
        id: "sync-job-failed-units",
        job_id: "scheduled-job-github",
        status: "failed",
        started_at: "2026-06-25T08:48:36.000Z",
        completed_at: "2026-06-25T12:12:40.000Z",
        duration_seconds: null,
        items_synced: 32,
        error: "Sync run completed with failed units",
        result: {
            dataset_key: "work-items",
            error_category: "rate_limit",
            failed_unit_count: 2,
            total_units: 6,
            failed_unit_ids: ["unit-work-items", "unit-prs"],
        },
        triggered_by: "manual",
        created_at: "2026-06-25T08:48:35.000Z",
    },
    {
        id: "sync-job-running",
        job_id: "scheduled-job-github",
        status: "running",
        started_at: "2026-06-25T12:15:00.000Z",
        completed_at: null,
        duration_seconds: null,
        items_synced: 4,
        error: null,
        result: null,
        triggered_by: "manual",
        created_at: "2026-06-25T12:15:00.000Z",
    },
];
const MOCK_REPOSITORY_SELECTIONS = new Map<string, { owner: string; repos: string[] }>([
    ["sync-config-edit-repos", { owner: "myorg", repos: ["myorg/repo-alpha"] }],
]);
const MOCK_TEAMS: MockTeam[] = [];
const MOCK_IDENTITIES: MockIdentity[] = [];

const buildDeploymentFlameResponse = (deploymentId: string) => ({
    entity: {
        deployment_id: deploymentId,
        environment: "staging",
    },
    timeline: {
        start: "2025-02-01T10:00:00.000Z",
        end: "2025-02-01T10:45:00.000Z",
    },
    frames: [
        {
            id: "deploy-root",
            parent_id: null,
            label: "Deployment pipeline",
            start: "2025-02-01T10:00:00.000Z",
            end: "2025-02-01T10:45:00.000Z",
            state: "active",
            category: "planned",
        },
        {
            id: "build",
            parent_id: "deploy-root",
            label: "Build image",
            start: "2025-02-01T10:00:00.000Z",
            end: "2025-02-01T10:15:00.000Z",
            state: "ci",
            category: "planned",
        },
        {
            id: "rollout",
            parent_id: "deploy-root",
            label: "Rolling update",
            start: "2025-02-01T10:15:00.000Z",
            end: "2025-02-01T10:45:00.000Z",
            state: "active",
            category: "planned",
        },
    ],
});

// ---------------------------------------------------------------------------
// GraphQL dispatcher
//
// urql sends GraphQL queries as POST with a JSON body in most setups, but
// some @urql/next code paths (and any future preferGetMethod usage) emit
// GET with `query`, `variables`, and `operationName` URL params. Both
// methods route through the same dispatcher so MSW can serve them without
// duplicating the if/else chain.
// ---------------------------------------------------------------------------

function dispatchGraphQL(query: string, variables: Record<string, unknown>): Response {
    const vars = variables as {
        orgId?: string;
        dateRange?: { startDate?: string; endDate?: string };
        scope?: AIScopeVars | null;
        dimension?: { dimension?: string } | string;
    };

    // Work-UNIT team attribution (CHAOS-2608 / CS7). Render-only: one row per
    // unit (the backend already collapsed member items to the owning team).
    // Keyed by workUnitId — the SAME ids as workUnitInvestmentsSample — so the
    // badge actually renders (the original bug keyed by work_item_id, a disjoint
    // id space, so the lookup always missed). Includes a manual_fallback row so
    // the distinct low-confidence badge is exercised.
    if (query.includes("WorkUnitTeamAttributions")) {
        const attrVars = variables as {
            workUnitIds?: string[] | null;
            teamId?: string | null;
        };
        const rows = [
            {
                workUnitId: "wu-41c2a",
                teamId: "team-platform",
                teamName: "Platform",
                source: "NATIVE_TEAM",
                confidence: "HIGH",
                isPrimary: true,
                memberCount: 4,
                evidence: "4 member work item(s) attributed to Platform via native_team",
            },
            {
                workUnitId: "wu-53a17",
                teamId: "team-payments",
                teamName: "Payments",
                source: "REPO_OWNERSHIP",
                confidence: "MEDIUM",
                isPrimary: true,
                memberCount: 2,
                evidence: "2 member work item(s) attributed to Payments via repo_ownership",
            },
            {
                workUnitId: "wu-7ed90",
                teamId: "team-platform",
                teamName: "Platform",
                source: "MANUAL_FALLBACK",
                confidence: "MANUAL",
                isPrimary: true,
                memberCount: 1,
                evidence: "1 member work item(s) attributed to Platform via manual_fallback",
            },
        ];
        // Mirror the backend's filtering so a test can assert the client queries
        // by work_unit_id: only return rows whose workUnitId was requested (the
        // old bug passed work_item_ids, which match nothing here). teamId narrows
        // to one team's units when supplied.
        const requested = attrVars.workUnitIds ?? null;
        const filtered = rows
            .filter((r) => requested === null || requested.includes(r.workUnitId))
            .filter((r) => !attrVars.teamId || r.teamId === attrVars.teamId);
        return HttpResponse.json({
            data: { workUnitTeamAttributions: filtered },
        });
    }

    // Investment breakdown query (analytics).
    if (query.includes("InvestmentBreakdown") || query.includes("analytics")) {
        return HttpResponse.json({
            data: {
                analytics: {
                    breakdowns: [
                        {
                            dimension: "THEME",
                            measure: "COUNT",
                            items: Object.entries(investmentMixSample.theme_distribution).map(
                                ([key, value]) => ({
                                    key,
                                    value,
                                }),
                            ),
                        },
                        {
                            dimension: "SUBCATEGORY",
                            measure: "COUNT",
                            items: Object.entries(investmentMixSample.subcategory_distribution).map(
                                ([key, value]) => ({ key, value }),
                            ),
                        },
                    ],
                },
            },
        });
    }

    // Work graph edges.
    if (query.includes("workGraphEdges") || query.includes("WorkGraphEdges")) {
        return HttpResponse.json({
            data: {
                workGraphEdges: {
                    edges: [
                        {
                            edgeId: "e1",
                            sourceType: "ISSUE",
                            sourceId: "PROJ-101",
                            targetType: "PR",
                            targetId: "PR-201",
                            edgeType: "FIXES",
                            provenance: "NATIVE",
                            confidence: 1.0,
                            evidence: "Fixes #101",
                        },
                        {
                            edgeId: "e2",
                            sourceType: "ISSUE",
                            sourceId: "PROJ-102",
                            targetType: "ISSUE",
                            targetId: "PROJ-101",
                            edgeType: "BLOCKS",
                            provenance: "EXPLICIT_TEXT",
                            confidence: 0.9,
                            evidence: "is blocked by PROJ-102",
                        },
                        {
                            edgeId: "e3",
                            sourceType: "PR",
                            sourceId: "PR-201",
                            targetType: "COMMIT",
                            targetId: "abc123",
                            edgeType: "CONTAINS",
                            provenance: "NATIVE",
                            confidence: 1.0,
                            evidence: "",
                        },
                        {
                            edgeId: "e4",
                            sourceType: "COMMIT",
                            sourceId: "abc123",
                            targetType: "FILE",
                            targetId: "src/api/handler.ts",
                            edgeType: "TOUCHES",
                            provenance: "NATIVE",
                            confidence: 1.0,
                            evidence: "",
                        },
                        {
                            edgeId: "e5",
                            sourceType: "ISSUE",
                            sourceId: "PROJ-103",
                            targetType: "ISSUE",
                            targetId: "PROJ-101",
                            edgeType: "RELATES",
                            provenance: "HEURISTIC",
                            confidence: 0.7,
                            evidence: "similar labels",
                        },
                        {
                            edgeId: "e6",
                            sourceType: "ISSUE",
                            sourceId: "PROJ-104",
                            targetType: "PR",
                            targetId: "PR-202",
                            edgeType: "IMPLEMENTS",
                            provenance: "EXPLICIT_TEXT",
                            confidence: 0.95,
                            evidence: "Implements PROJ-104",
                        },
                    ],
                    totalCount: 6,
                    pageInfo: {
                        hasNextPage: false,
                        hasPreviousPage: false,
                        startCursor: null,
                        endCursor: null,
                    },
                },
            },
        });
    }

    // Work graph inflow/outflow aggregate (CHAOS-2442). The Inflow/Outflow tab
    // now calls workGraphFlow instead of deriving from the capped edge page, so
    // the mock must serve it directly. nodeType values are UPPERCASE enum names.
    if (query.includes("workGraphFlow") || query.includes("WorkGraphFlow")) {
        return HttpResponse.json({
            data: {
                workGraphFlow: {
                    rows: [
                        { nodeType: "ISSUE", inflow: 18, outflow: 42 },
                        { nodeType: "PR", inflow: 37, outflow: 21 },
                        { nodeType: "COMMIT", inflow: 24, outflow: 15 },
                        { nodeType: "FILE", inflow: 31, outflow: 4 },
                    ],
                    degradedReason: null,
                },
            },
        });
    }

    // Work graph artifact ranking aggregate (CHAOS-2442). The Artifacts tab now
    // calls workGraphArtifacts (server-side node-degree ranking) instead of
    // deriving degree from the capped edge page.
    if (query.includes("workGraphArtifacts") || query.includes("WorkGraphArtifacts")) {
        return HttpResponse.json({
            data: {
                workGraphArtifacts: {
                    rows: [
                        {
                            nodeType: "ISSUE",
                            nodeId: "PROJ-101",
                            displayName: "PROJ-101: Launch onboarding",
                            degree: 7,
                            evidence: "Fixes #101",
                        },
                        {
                            nodeType: "PR",
                            nodeId: "PR-201",
                            displayName: "github:pr:#201",
                            degree: 5,
                            evidence: "Merged after review",
                        },
                        {
                            nodeType: "COMMIT",
                            nodeId: "abc123",
                            displayName: null,
                            degree: 3,
                            evidence: null,
                        },
                    ],
                    degradedReason: null,
                },
            },
        });
    }

    // Capacity forecast.
    if (query.includes("capacityForecast") || query.includes("CapacityForecast")) {
        return HttpResponse.json({
            data: { capacityForecast: sampleCapacityForecast },
        });
    }

    if (query.includes("OperatingReview") || query.includes("operatingReview")) {
        return HttpResponse.json({
            data: {
                operatingReview: operatingReviewResponse(
                    vars.orgId ?? "org-e2e",
                    (
                        variables as {
                            input?: { teamId?: string | null; weekStart?: string };
                        }
                    ).input,
                ),
            },
        });
    }

    // Investment flow.
    if (query.includes("investmentFlow")) {
        return HttpResponse.json({
            data: {
                investmentFlow: {
                    nodes: sankeyInvestmentNodes.map((n, i) => ({
                        id: `n${i}`,
                        label: n.name,
                        dimension: n.group,
                        value: 10,
                    })),
                    edges: sankeyInvestmentLinks.map((l, i) => ({
                        id: `e${i}`,
                        source: `n${sankeyInvestmentNodes.findIndex((n) => n.name === l.source)}`,
                        target: `n${sankeyInvestmentNodes.findIndex((n) => n.name === l.target)}`,
                        value: l.value,
                    })),
                },
            },
        });
    }

    // Compounding Risk (CHAOS-1642).
    if (query.includes("compoundingRisk") || query.includes("CompoundingRisk")) {
        const orgId = vars.orgId ?? "org-e2e";
        const breakout =
            (variables as { filter?: { breakout?: string } }).filter?.breakout ?? "REPO";
        const weights = {
            churn: 0.3,
            complexity: 0.3,
            ownership: 0.2,
            review: 0.2,
        };
        const thresholds = { elevated: 0.4, high: 0.65 };

        // CHAOS-1750 test hook
        if (orgId === "null-scores-org") {
            return HttpResponse.json({
                data: {
                    compoundingRisk: {
                        orgId,
                        breakout,
                        rows: [
                            {
                                day: "2026-05-20",
                                scope: breakout,
                                scopeId: "scope-1",
                                scopeLabel: "meridian/data-pipeline",
                                score: null,
                                severity: "UNKNOWN",
                                components: {
                                    churnNorm: null,
                                    complexityNorm: null,
                                    ownershipNorm: null,
                                    reviewNorm: null,
                                    reworkChurn: null,
                                    complexityDelta: null,
                                    busFactor: null,
                                    ownershipGini: null,
                                    singleOwnerRatio: null,
                                    reviewLatencyP90h: null,
                                },
                                weights,
                                thresholds,
                                computedAt: "2026-05-21T12:00:00Z",
                            },
                        ],
                        trend: [],
                        generatedAt: "2026-05-21T12:00:00Z",
                    },
                },
            });
        }

        const baseComponents = {
            churnNorm: 0.78,
            complexityNorm: 0.62,
            ownershipNorm: 0.55,
            reviewNorm: 0.48,
            reworkChurn: 0.21,
            complexityDelta: 0.13,
            busFactor: 3,
            ownershipGini: 0.58,
            singleOwnerRatio: 0.55,
            reviewLatencyP90h: 38,
        };
        const repoRows = [
            {
                day: "2026-05-20",
                scope: "REPO",
                scopeId: "repo-a",
                scopeLabel: "meridian/core-api",
                score: 0.71,
                severity: "HIGH",
                components: baseComponents,
                weights,
                thresholds,
                computedAt: "2026-05-21T12:00:00Z",
            },
            {
                day: "2026-05-20",
                scope: "REPO",
                scopeId: "repo-b",
                scopeLabel: "meridian/web-app",
                score: 0.42,
                severity: "ELEVATED",
                components: {
                    ...baseComponents,
                    churnNorm: 0.4,
                    complexityNorm: 0.4,
                    ownershipNorm: 0.4,
                    reviewNorm: 0.45,
                },
                weights,
                thresholds,
                computedAt: "2026-05-21T12:00:00Z",
            },
            {
                day: "2026-05-20",
                scope: "REPO",
                scopeId: "repo-c",
                scopeLabel: "meridian/infra",
                score: 0.25,
                severity: "LOW",
                components: {
                    ...baseComponents,
                    churnNorm: 0.2,
                    complexityNorm: 0.2,
                    ownershipNorm: 0.3,
                    reviewNorm: 0.25,
                },
                weights,
                thresholds,
                computedAt: "2026-05-21T12:00:00Z",
            },
        ];
        const teamRows = [
            {
                day: "2026-05-20",
                scope: "TEAM",
                scopeId: "team-platform",
                scopeLabel: "Platform",
                score: 0.56,
                severity: "ELEVATED",
                components: baseComponents,
                weights,
                thresholds,
                computedAt: "2026-05-21T12:00:00Z",
            },
        ];
        return HttpResponse.json({
            data: {
                compoundingRisk: {
                    orgId,
                    breakout,
                    rows: breakout === "TEAM" ? teamRows : repoRows,
                    trend: [
                        { day: "2026-05-15", score: 0.62, severity: "ELEVATED" },
                        { day: "2026-05-16", score: 0.66, severity: "HIGH" },
                        { day: "2026-05-17", score: 0.68, severity: "HIGH" },
                        { day: "2026-05-18", score: 0.7, severity: "HIGH" },
                        { day: "2026-05-19", score: 0.7, severity: "HIGH" },
                        { day: "2026-05-20", score: 0.71, severity: "HIGH" },
                    ],
                    generatedAt: "2026-05-21T12:00:00Z",
                },
            },
        });
    }

    // ---- AI Workflow Intelligence (CHAOS-1588) ----
    const orgId = vars.orgId ?? "org-e2e";
    const startDate = vars.dateRange?.startDate ?? "2026-04-20";
    const endDate = vars.dateRange?.endDate ?? "2026-05-19";
    const aiMode = resolveAIMode(vars.scope ?? null);

    if (query.includes("AIImpactSummary")) {
        return HttpResponse.json({
            data: {
                aiImpactSummary: aiImpactSummaryResponse(orgId, startDate, endDate, aiMode),
            },
        });
    }
    if (query.includes("AIReviewLoad")) {
        return HttpResponse.json({
            data: {
                aiReviewLoad: aiReviewLoadResponse(orgId, startDate, endDate, aiMode),
                aiComparison: aiComparisonResponse(orgId, startDate, endDate, aiMode),
            },
        });
    }
    if (query.includes("AIRiskBreakdown")) {
        return HttpResponse.json({
            data: {
                aiRiskBreakdown: aiRiskBreakdownResponse(orgId, startDate, endDate, aiMode),
                aiComparison: aiComparisonResponse(orgId, startDate, endDate, aiMode),
            },
        });
    }
    if (query.includes("AIComparison")) {
        return HttpResponse.json({
            data: {
                aiComparison: aiComparisonResponse(orgId, startDate, endDate, aiMode),
            },
        });
    }
    if (query.includes("AIOpportunities")) {
        return HttpResponse.json({
            data: { aiOpportunities: aiOpportunitiesResponse(orgId, aiMode) },
        });
    }
    if (query.includes("AIGovernanceSummary")) {
        return HttpResponse.json({
            data: {
                aiGovernanceSummary: aiGovernanceSummaryResponse(orgId, startDate, endDate, aiMode),
            },
        });
    }
    if (query.includes("AIAttributedPrs")) {
        const limit = typeof variables.limit === "number" ? variables.limit : 50;
        const offset = typeof variables.offset === "number" ? variables.offset : 0;
        return HttpResponse.json({
            data: {
                aiAttributedPrs: aiAttributedPrsResponse(
                    orgId,
                    startDate,
                    endDate,
                    aiMode,
                    limit,
                    offset,
                    vars.scope ?? null,
                ),
            },
        });
    }
    if (query.includes("AIWorkflowDrilldown")) {
        const rootType = (variables.rootType as string | undefined) ?? "PR";
        const rootId = (variables.rootId as string | undefined) ?? "PR-201";
        const issueId = rootType === "ISSUE" ? rootId : "PROJ-101";
        const prId = rootType === "PR" ? rootId : "PR-201";
        return HttpResponse.json({
            data: {
                aiWorkflowDrilldown: {
                    orgId,
                    rootType,
                    rootId,
                    partial: false,
                    dataAvailable: true,
                    nodes: [
                        { nodeType: "ISSUE", nodeId: issueId },
                        { nodeType: "PR", nodeId: prId },
                        { nodeType: "REVIEW_OUTCOME", nodeId: "review-approved" },
                        { nodeType: "COMMIT", nodeId: "abc123" },
                        { nodeType: "DEPLOYMENT", nodeId: "deploy-123" },
                        { nodeType: "INCIDENT", nodeId: "inc-42" },
                    ],
                    edges: [
                        {
                            edgeId: "demo-issue-pr",
                            sourceType: "ISSUE",
                            sourceId: issueId,
                            targetType: "PR",
                            targetId: prId,
                            edgeType: "FIXES",
                            confidence: 1,
                            source: "msw",
                            evidence: `Fixes ${issueId}`,
                            provider: "github",
                            repoId: "repo:web-app",
                        },
                        {
                            edgeId: "demo-pr-review",
                            sourceType: "PR",
                            sourceId: prId,
                            targetType: "REVIEW_OUTCOME",
                            targetId: "review-approved",
                            edgeType: "HAS_REVIEW_OUTCOME",
                            confidence: 0.96,
                            source: "msw",
                            evidence: "Approved after accessibility copy updates.",
                            provider: "github",
                            repoId: "repo:web-app",
                        },
                        {
                            edgeId: "demo-pr-commit",
                            sourceType: "PR",
                            sourceId: prId,
                            targetType: "COMMIT",
                            targetId: "abc123",
                            edgeType: "CONTAINS",
                            confidence: 1,
                            source: "msw",
                            evidence: "Merge commit abc123",
                            provider: "github",
                            repoId: "repo:web-app",
                        },
                        {
                            edgeId: "demo-pr-deploy",
                            sourceType: "PR",
                            sourceId: prId,
                            targetType: "DEPLOYMENT",
                            targetId: "deploy-123",
                            edgeType: "DEPLOYS",
                            confidence: 0.91,
                            source: "msw",
                            evidence: "Staging deployment completed 45 minutes after merge.",
                            provider: "github",
                            repoId: "repo:web-app",
                        },
                        {
                            edgeId: "demo-deploy-incident",
                            sourceType: "DEPLOYMENT",
                            sourceId: "deploy-123",
                            targetType: "INCIDENT",
                            targetId: "inc-42",
                            edgeType: "LINKED_INCIDENT",
                            confidence: 0.74,
                            source: "msw",
                            evidence: "Incident opened inside the post-deploy observation window.",
                            provider: "github",
                            repoId: "repo:web-app",
                        },
                    ],
                },
            },
        });
    }

    // Catalog dimension values for AI filter bar dropdowns.
    if (query.includes("CatalogValues") || query.includes("catalog(")) {
        const dim =
            typeof vars.dimension === "string"
                ? vars.dimension
                : (vars.dimension?.dimension ?? "TEAM");
        return HttpResponse.json({ data: { catalog: catalogValuesResponse(dim) } });
    }

    if (query.includes("CognitiveLoad") || query.includes("cognitiveLoad")) {
        const input = (variables.input ?? {}) as { orgId?: string; teamId?: string | null };
        const days = Array.from({ length: 14 }, (_, i) => {
            const d = new Date(Date.UTC(2026, 4, 26 + i));

            return {
                day: d.toISOString().slice(0, 10),
                prInterruptionLoad: 12 + (i % 3),
                contextSpreadCount: 7 + (i % 4),
                reviewRequestLoad: 9 + (i % 2),
                afterHoursCommitRatio: 0.18,
                weekendCommitRatio: 0.12,
            };
        });

        return HttpResponse.json({
            data: {
                cognitiveLoad: {
                    orgId: input.orgId ?? "e2e-org",
                    teamId: input.teamId ?? null,
                    totalDays: days.length,
                    signals: days,
                },
            },
        });
    }

    // Default: empty data.
    return HttpResponse.json({ data: {} });
}

// ---------------------------------------------------------------------------
// Stateful first-run onboarding fixture (CHAOS-2670 / CHAOS-2684)
//
// The guided journey reads its routing target server-side from C1
// (`/auth/onboarding/state`) and its dashboard surface from C2
// (`/admin/setup/status`). To let one orgless user walk workspace ->
// integration -> complete -> dashboard deterministically, these endpoints
// share a small progress object that advances as the user creates a
// workspace, skips, or connects an integration. A test-only reset endpoint
// restores the initial orgless state between specs. This module-level state
// is per mock-server process; the guided Playwright suite runs against a
// dedicated mock backend so it never contaminates the flag-off suite.
// ---------------------------------------------------------------------------

type OnboardingProgress = {
    orgCreated: boolean;
    orgId: string | null;
    orgName: string | null;
    integrationConnected: boolean;
    integrationSkipped: boolean;
};

const INITIAL_ONBOARDING_PROGRESS: OnboardingProgress = {
    orgCreated: false,
    orgId: null,
    orgName: null,
    integrationConnected: false,
    integrationSkipped: false,
};

const onboardingProgress: OnboardingProgress = { ...INITIAL_ONBOARDING_PROGRESS };

function resetOnboardingProgress(overrides?: Partial<OnboardingProgress>) {
    Object.assign(onboardingProgress, INITIAL_ONBOARDING_PROGRESS, overrides ?? {});
}

/** C1 next_step derived from progress (deterministic, mirrors the backend). */
function onboardingNextStep(): "workspace" | "integration" | "complete" {
    if (!onboardingProgress.orgCreated) return "workspace";
    if (!onboardingProgress.integrationConnected && !onboardingProgress.integrationSkipped) {
        return "integration";
    }
    return "complete";
}

/** Build the C1 `/auth/onboarding/state` body from the shared progress. */
function buildOnboardingState() {
    const integrationResolved =
        onboardingProgress.integrationConnected || onboardingProgress.integrationSkipped;
    return {
        needs_onboarding: !(onboardingProgress.orgCreated && integrationResolved),
        org_created: onboardingProgress.orgCreated,
        org_id: onboardingProgress.orgId,
        org_name: onboardingProgress.orgName,
        first_integration_connected: onboardingProgress.integrationConnected,
        integration_skipped: onboardingProgress.integrationSkipped,
        recommended_provider: "github",
        next_step: onboardingNextStep(),
        blocker: null,
    };
}

/** Build the C2 `/admin/setup/status` body from the shared progress. */
function buildSetupStatus() {
    const nextAction = onboardingProgress.integrationConnected
        ? "select_repositories"
        : onboardingProgress.integrationSkipped
          ? "complete"
          : "connect_integration";
    return {
        has_integration: onboardingProgress.integrationConnected,
        providers: onboardingProgress.integrationConnected ? ["github"] : [],
        has_sync_config: false,
        sync_config_id: null,
        first_sync_started: false,
        sync_status: "none",
        selected_repositories_count: 0,
        last_sync_error: null,
        can_start_sync: false,
        next_action: nextAction,
        blocker: null,
    };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
    // ---- Auth (for e2e test authentication) ----
    http.post("*/api/v1/auth/login", async ({ request }) => {
        const body = (await request.json()) as {
            email?: string;
            password?: string;
        } | null;
        if (!body?.email || !body?.password) {
            return HttpResponse.json({ detail: "Missing credentials" }, { status: 400 });
        }
        // Two canonical e2e users with DELIBERATELY distinct purposes:
        //   newuser@example.com — ORGLESS new signup (org_id null,
        //     needs_onboarding true). Drives the first-run onboarding journey.
        //   test@example.com    — already ONBOARDED owner (org_id org-e2e,
        //     needs_onboarding false). Drives the authenticated product suite.
        if (body.email === "newuser@example.com" && body.password === "password123") {
            return HttpResponse.json<LoginResponseBody>({
                user: {
                    id: "e2e-user-new",
                    email: "newuser@example.com",
                    org_id: null,
                    role: "member",
                    is_superuser: false,
                    permissions: ["read", "write"],
                },
                access_token: "mock-access-token-e2e",
                refresh_token: "mock-refresh-token-e2e",
                token_type: "bearer",
                expires_in: 86400,
                needs_onboarding: true,
            });
        }
        if (body.email !== "test@example.com" || body.password !== "password123") {
            return HttpResponse.json({ detail: "Invalid email or password" }, { status: 401 });
        }
        return HttpResponse.json<LoginResponseBody>({
            user: {
                id: "e2e-user-1",
                email: body.email,
                org_id: "org-e2e",
                role: "owner",
                is_superuser: true,
                permissions: ["read", "write"],
            },
            access_token: "mock-access-token-e2e",
            refresh_token: "mock-refresh-token-e2e",
            token_type: "bearer",
            expires_in: 86400,
            needs_onboarding: false,
        });
    }),

    http.post("*/api/v1/auth/validate", () =>
        HttpResponse.json<TokenValidateResponseBody>({ valid: true }),
    ),

    http.post("*/api/v1/auth/refresh", () =>
        HttpResponse.json<TokenRefreshResponseBody>({
            access_token: "mock-refreshed-token-e2e",
            refresh_token: "mock-refreshed-refresh-token-e2e",
            token_type: "bearer",
            expires_in: 86400,
            user: {
                id: "e2e-user-1",
                email: "test@example.com",
                org_id: "org-e2e",
                role: "owner",
                is_superuser: false,
            },
        }),
    ),

    http.get("*/api/v1/auth/me/organizations", () =>
        HttpResponse.json({
            active_org_id: "org-e2e",
            organizations: [
                {
                    id: "org-e2e",
                    slug: "e2e-org",
                    name: "E2E Organization",
                    tier: "community",
                    role: "owner",
                    joined_at: "2026-01-01T00:00:00Z",
                    has_data: true,
                    last_metrics_at: "2026-05-19T00:00:00Z",
                },
            ],
        }),
    ),

    http.post("*/api/v1/auth/switch-org", () =>
        HttpResponse.json<LoginResponseBody>({
            user: {
                id: "e2e-user-1",
                email: "test@example.com",
                org_id: "org-e2e",
                role: "owner",
                is_superuser: true,
                permissions: ["read", "write"],
            },
            access_token: "mock-access-token-e2e",
            refresh_token: "mock-refresh-token-e2e",
            token_type: "bearer",
            expires_in: 86400,
            needs_onboarding: false,
        }),
    ),

    // CHAOS-2670 C1: onboarding state, derived from the shared progress object
    // so the guided journey advances deterministically as the user creates a
    // workspace / skips / connects. Fresh state = orgless user at the workspace
    // step (next_step "workspace").
    http.get("*/api/v1/auth/onboarding/state", () => HttpResponse.json(buildOnboardingState())),

    // Test-only: reset the guided onboarding progress between specs. Lives under
    // the public, proxied /api/v1/auth prefix so it can be called before
    // sign-in. Optional body { step: "workspace" | "integration" | "complete",
    // connected?: boolean } seeds a specific starting point.
    http.post("*/api/v1/auth/onboarding/reset", async ({ request }) => {
        let body: { step?: string; connected?: boolean } | null = null;
        try {
            body = (await request.json()) as { step?: string; connected?: boolean };
        } catch {
            body = null;
        }
        const overrides: Partial<OnboardingProgress> = {};
        if (body?.step === "integration" || body?.step === "complete" || body?.connected) {
            overrides.orgCreated = true;
            overrides.orgId = "org-new";
            overrides.orgName = "Acme Inc";
        }
        if (body?.step === "complete") {
            overrides.integrationSkipped = true;
        }
        if (body?.connected) {
            overrides.integrationConnected = true;
        }
        resetOnboardingProgress(overrides);
        return HttpResponse.json(buildOnboardingState());
    }),

    // CHAOS-2670 C6: persist integration skip, advancing the shared progress to
    // the completion step; returns the updated C1 state.
    http.post("*/api/v1/auth/onboarding/skip-integration", () => {
        onboardingProgress.integrationSkipped = true;
        return HttpResponse.json(buildOnboardingState());
    }),

    // CHAOS-2670 C2: admin setup status, derived from the shared progress so the
    // dashboard setup banner reflects the path taken (skipped vs sync-pending vs
    // no-integration). Fresh state = no integration yet.
    http.get("*/api/v1/admin/setup/status", () => HttpResponse.json(buildSetupStatus())),

    http.get("*/api/v1/billing/invoices", ({ request }) => {
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const item = SAMPLE_INVOICE;
        const items = status && status.length > 0 ? (item.status === status ? [item] : []) : [item];
        return HttpResponse.json({
            items,
            total: items.length,
            limit: Number(url.searchParams.get("limit") ?? "20"),
            offset: Number(url.searchParams.get("offset") ?? "0"),
        });
    }),

    http.get("*/api/v1/billing/invoices/:invoiceId", ({ params }) => {
        if (params.invoiceId !== SAMPLE_INVOICE.id) {
            return HttpResponse.json({ detail: "Invoice not found" }, { status: 404 });
        }
        return HttpResponse.json(SAMPLE_INVOICE);
    }),

    http.post("*/api/v1/billing/invoices/:invoiceId/void", ({ params }) => {
        if (params.invoiceId !== SAMPLE_INVOICE.id) {
            return HttpResponse.json({ detail: "Invoice not found" }, { status: 404 });
        }

        return HttpResponse.json({
            ...SAMPLE_INVOICE,
            status: "void",
            amount_remaining: 0,
            voided_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
    }),

    // ---- Org self-service profile update ----
    http.patch("*/api/v1/orgs/me", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown> | null;
        return HttpResponse.json({
            id: "org-e2e",
            slug: "my-organization-e2e",
            name: typeof body?.name === "string" ? body.name : "My Organization",
            description: typeof body?.description === "string" ? body.description : null,
            tier: "community",
            settings: {},
            is_active: true,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: new Date().toISOString(),
        });
    }),

    // ---- Subscriptions ----
    http.get("*/api/v1/billing/subscriptions/list", ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json({
            items: [SAMPLE_SUBSCRIPTION],
            total: 1,
            limit: Number(url.searchParams.get("limit") ?? "20"),
            offset: Number(url.searchParams.get("offset") ?? "0"),
        });
    }),

    http.get("*/api/v1/billing/subscriptions", () => {
        return HttpResponse.json(SAMPLE_SUBSCRIPTION);
    }),

    http.get("*/api/v1/billing/subscriptions/history", () =>
        HttpResponse.json({
            items: [],
            total: 0,
            limit: 25,
            offset: 0,
        }),
    ),

    http.post("*/api/v1/billing/subscriptions/change-plan", () =>
        HttpResponse.json({ status: "plan_change_scheduled" }),
    ),

    http.post("*/api/v1/billing/subscriptions/cancel", () =>
        HttpResponse.json({ status: "cancellation_scheduled" }),
    ),

    http.post("*/api/v1/billing/subscriptions/reactivate", () =>
        HttpResponse.json({ status: "reactivated" }),
    ),

    http.get("*/api/v1/billing/refunds", ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json({
            items: [SAMPLE_REFUND],
            total: 1,
            limit: Number(url.searchParams.get("limit") ?? "20"),
            offset: Number(url.searchParams.get("offset") ?? "0"),
        });
    }),

    http.post("*/api/v1/billing/refunds", () => HttpResponse.json(SAMPLE_REFUND)),

    http.get("*/api/v1/billing/audit", ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json({
            items: [SAMPLE_BILLING_AUDIT],
            total: 1,
            limit: Number(url.searchParams.get("limit") ?? "50"),
            offset: Number(url.searchParams.get("offset") ?? "0"),
        });
    }),

    http.get("*/api/v1/billing/audit/:id", ({ params }) => {
        if (params.id !== SAMPLE_BILLING_AUDIT.id) {
            return HttpResponse.json({ detail: "Audit entry not found" }, { status: 404 });
        }
        return HttpResponse.json(SAMPLE_BILLING_AUDIT);
    }),

    http.post("*/api/v1/billing/audit/:id/resolve", ({ params }) => {
        if (params.id !== SAMPLE_BILLING_AUDIT.id) {
            return HttpResponse.json({ detail: "Audit entry not found" }, { status: 404 });
        }
        return HttpResponse.json({
            ...SAMPLE_BILLING_AUDIT,
            reconciliation_status: "matched",
        });
    }),

    http.post("*/api/v1/billing/reconcile", () =>
        HttpResponse.json({
            started_at: "2026-02-02T10:00:00.000Z",
            completed_at: "2026-02-02T10:00:05.000Z",
            subscriptions_checked: 1,
            invoices_checked: 1,
            refunds_checked: 1,
            mismatches: [],
            missing_local: [],
            missing_stripe: [],
        }),
    ),

    // ---- Health & Meta ----
    http.get("*/health", () => HttpResponse.json({ status: "ok", services: { api: "mock" } })),

    http.get("*/api/v1/meta", () =>
        HttpResponse.json({
            backend: "sqlite",
            version: "test",
            last_ingest_at: new Date().toISOString(),
            coverage: { repos: 10 },
            limits: { drilldown_max: 200 },
            supported_endpoints: ["/api/v1/home", "/api/v1/meta"],
        }),
    ),

    http.get("*/api/v1/filters/options", () =>
        HttpResponse.json({
            teams: ["core", "growth", "infra", "platform"],
            repos: ["dev-health-web", "dev-health-ops", "frontend-web"],
            services: ["web", "api", "analytics"],
            developers: ["Alex Harper", "Jordan Lee", "metrics-owner", "dev-health-web"],
            work_category: ["feature", "maintenance", "support"],
            issue_type: ["bug", "story", "task"],
            flow_stage: ["review", "build", "deploy"],
        }),
    ),

    http.get("*/api/v1/billing/plans", ({ request }) => {
        const url = new URL(request.url);
        const includeInactive = url.searchParams.get("include_inactive") === "true";
        return HttpResponse.json<MockBillingPlan[]>(
            includeInactive
                ? MOCK_BILLING_PLANS
                : MOCK_BILLING_PLANS.filter((plan) => plan.is_active),
        );
    }),

    http.post("*/api/v1/billing/plans", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        const id = `plan-${String(body.key ?? "new")}-${Date.now()}`;
        const prices = Array.isArray(body.prices) ? body.prices : [];
        const created = {
            id,
            key: String(body.key ?? "new"),
            name: String(body.name ?? "New Plan"),
            description: (body.description as string | null) ?? null,
            tier: String(body.tier ?? "team"),
            is_active: body.is_active !== false,
            display_order: Number(body.display_order ?? 0),
            stripe_product_id: null,
            metadata: {},
            prices: prices.map((price, index) => {
                const p = price as Record<string, unknown>;
                return {
                    id: `${id}-price-${index}`,
                    plan_id: id,
                    interval: String(p.interval ?? "monthly"),
                    amount: Number(p.amount ?? 0),
                    currency: String(p.currency ?? "usd"),
                    is_active: p.is_active !== false,
                    stripe_price_id: null,
                };
            }),
            bundles: [],
        };
        MOCK_BILLING_PLANS.push(created);
        return HttpResponse.json(created);
    }),

    http.put("*/api/v1/billing/plans/:id", async ({ params, request }) => {
        const planId = params.id as string;
        const body = (await request.json()) as Record<string, unknown>;
        const plan = MOCK_BILLING_PLANS.find((item) => item.id === planId);
        if (!plan) {
            return HttpResponse.json({ detail: "Plan not found" }, { status: 404 });
        }
        plan.name = String(body.name ?? plan.name);
        plan.key = String(body.key ?? plan.key);
        plan.tier = String(body.tier ?? plan.tier);
        plan.description = (body.description as string | null) ?? plan.description;
        plan.display_order = Number(body.display_order ?? plan.display_order);
        if (typeof body.is_active === "boolean") {
            plan.is_active = body.is_active;
        }
        if (Array.isArray(body.prices)) {
            plan.prices = body.prices.map((price, index) => {
                const p = price as Record<string, unknown>;
                return {
                    id: `${plan.id}-price-${index}`,
                    plan_id: plan.id,
                    interval: String(p.interval ?? "monthly"),
                    amount: Number(p.amount ?? 0),
                    currency: String(p.currency ?? "usd"),
                    is_active: p.is_active !== false,
                    stripe_price_id: null,
                };
            });
        }
        return HttpResponse.json(plan);
    }),

    http.delete("*/api/v1/billing/plans/:id", ({ params }) => {
        const planId = params.id as string;
        const plan = MOCK_BILLING_PLANS.find((item) => item.id === planId);
        if (!plan) {
            return HttpResponse.json({ detail: "Plan not found" }, { status: 404 });
        }
        plan.is_active = false;
        return HttpResponse.json({ deleted: true });
    }),

    http.post("*/api/v1/billing/plans/:id/sync-stripe", ({ params }) => {
        const planId = params.id as string;
        const plan = MOCK_BILLING_PLANS.find((item) => item.id === planId);
        if (!plan) {
            return HttpResponse.json({ detail: "Plan not found" }, { status: 404 });
        }
        plan.stripe_product_id = plan.stripe_product_id ?? `prod_${plan.id}`;
        plan.prices = plan.prices.map((price) => ({
            ...price,
            stripe_price_id: price.stripe_price_id ?? `price_${price.id}`,
        }));
        return HttpResponse.json(plan);
    }),

    // ---- Home ----
    http.post("*/api/v1/home", () =>
        HttpResponse.json({
            freshness: {
                last_ingested_at: new Date().toISOString(),
                sources: { github: "ok" },
                coverage: { repos: 10, people: 5 },
            },
            deltas: [
                {
                    metric: "cycle_time",
                    label: "Cycle Time",
                    unit: "hours",
                    value: 48,
                    delta_pct: -12,
                },
                {
                    metric: "throughput",
                    label: "Throughput",
                    unit: "PRs/week",
                    value: 15,
                    delta_pct: 8,
                },
                {
                    metric: "review_latency",
                    label: "Review Latency",
                    unit: "hours",
                    value: 6,
                    delta_pct: -5,
                },
                { metric: "churn", label: "Churn", unit: "%", value: 18, delta_pct: 3 },
                // CHAOS-2163: pr_rework_ratio replaces legacy rework_ratio on the Investment/Quality rework card.
                // value is already a 0-100 percentage (ops emits value * 100).
                {
                    metric: "pr_rework_ratio",
                    label: "PR Rework Ratio",
                    unit: "%",
                    value: 18,
                    delta_pct: -3,
                },
            ],
            summary: [{ text: "Team velocity appears stable over the past 14 days." }],
            tiles: {},
            constraint: {
                label: "WIP Saturation",
                metric: "wip_saturation",
                value: 0.6,
                threshold: 0.8,
                status: "ok",
            },
            events: [],
            health_state: {
                status: "at_risk",
                headline: "Review latency is the limiting factor this week",
                summary:
                    "Reviews are taking longer and slowing delivery across the payments repos.",
            },
            signals: [
                {
                    id: "sig-review-latency",
                    title: "Review latency is climbing",
                    metric: "review_latency",
                    current_value: "2.4d",
                    prior_value: "1.6d",
                    delta: "+50%",
                    direction: "up",
                    severity: "high",
                    confidence: "medium",
                    affected_scope: "3 repos · payments",
                    evidence_count: 7,
                    why_it_matters: "Longer reviews delay delivery and frustrate contributors.",
                    recommended_action: "Rebalance reviewers on the payments repos.",
                    evidence_ref: "/api/v1/explain?metric=review_latency",
                    category: "delivery",
                },
                {
                    id: "sig-throughput",
                    title: "Throughput is recovering",
                    metric: "throughput",
                    current_value: "15 PRs/wk",
                    prior_value: "13 PRs/wk",
                    delta: "+8%",
                    direction: "up",
                    severity: "low",
                    confidence: "medium",
                    affected_scope: "org-wide",
                    evidence_count: 4,
                    why_it_matters: "Delivery pace is trending back toward baseline.",
                    recommended_action: "Maintain current WIP limits.",
                    evidence_ref: "/api/v1/explain?metric=throughput",
                    category: "delivery",
                },
            ],
            limiting_factor: {
                claim: "Review latency appears to be the limiting factor.",
                why_it_matters: "It is the largest current drag on delivery flow this window.",
                recommended_action:
                    "Rebalance reviewers and set a review SLA on the payments repos.",
                confidence: "medium",
                evidence_ref: "/api/v1/explain?metric=review_latency",
            },
            data_confidence: {
                level: "medium",
                coverage_pct: 72,
                connected_sources: ["GitHub"],
                missing_sources: ["CI", "Incidents"],
                caveats: ["Some repos lack linked issues."],
            },
            // CHAOS-2163: allocation_pct is already 0-100 (ops computes allocation/total*100.0).
            // Themes are canonical keys from investment_taxonomy.py.
            rework_theme_allocation: [
                {
                    theme: "feature_delivery",
                    label: "Feature Delivery",
                    allocation: 120,
                    allocation_pct: 40,
                    prs_merged: 120,
                    churn_loc: 45000,
                },
                {
                    theme: "maintenance",
                    label: "Maintenance / Tech Debt",
                    allocation: 75,
                    allocation_pct: 25,
                    prs_merged: 75,
                    churn_loc: 28000,
                },
                {
                    theme: "quality",
                    label: "Quality / Reliability",
                    allocation: 60,
                    allocation_pct: 20,
                    prs_merged: 60,
                    churn_loc: 22000,
                },
                {
                    theme: "operational",
                    label: "Operational / Support",
                    allocation: 30,
                    allocation_pct: 10,
                    prs_merged: 30,
                    churn_loc: 11000,
                },
                {
                    theme: "risk",
                    label: "Risk / Security",
                    allocation: 15,
                    allocation_pct: 5,
                    prs_merged: 15,
                    churn_loc: 5500,
                },
            ],
        }),
    ),

    // ---- Investment ----
    http.post("*/api/v1/investment", () => HttpResponse.json(investmentMixSample)),

    http.post("*/api/v1/investment/explain", () =>
        HttpResponse.json({
            summary:
                "This view suggests effort leans toward a small number of dominant themes, with subcategories providing the specific intent behind that allocation.",
            top_findings: [
                {
                    finding:
                        "Subcategory distribution appears concentrated in the leading theme families.",
                    evidence: {
                        theme: Object.keys(investmentMixSample.theme_distribution)[0] || "Unknown",
                        share_pct: 40,
                        evidence_quality_band: "moderate",
                    },
                },
                {
                    finding:
                        "Repo scope destinations are derived from connected work-unit evidence only.",
                    evidence: { theme: "Cross-cutting", share_pct: 15 },
                },
            ],
            confidence: {
                level: "moderate",
                drivers: ["high_uncertainty_spread"],
                band_mix: { moderate: 0.6, low: 0.4 },
            },
        }),
    ),

    http.post("*/api/v1/investment/flow", () =>
        HttpResponse.json({
            nodes: sankeyInvestmentNodes,
            links: sankeyInvestmentLinks,
            label: "Investment flow",
            unit: "units",
        }),
    ),

    http.post("*/api/v1/investment/flow/repo-team", () =>
        HttpResponse.json({
            nodes: [
                ...Object.keys(investmentRepoTeamMapSample).map((r) => ({
                    name: r.replace("repo:", ""),
                    group: "repo",
                })),
                ...Array.from(new Set(Object.values(investmentRepoTeamMapSample))).map((t) => ({
                    name: t,
                    group: "team",
                })),
            ],
            links: Object.entries(investmentRepoTeamMapSample).map(([repo, team]) => ({
                source: repo.replace("repo:", ""),
                target: team,
                value: 10,
            })),
            label: "Repo → Team",
            unit: "units",
        }),
    ),

    // ---- Work Units ----
    http.post("*/api/v1/work-units", () => HttpResponse.json(workUnitInvestmentsSample)),

    http.post("*/api/v1/work-units/:id/explain", () =>
        HttpResponse.json({
            summary: "Sample explanation for this work unit.",
            themes: {},
            evidence: [],
        }),
    ),

    // ---- Sankey ----
    http.post("*/api/v1/sankey", async ({ request }) => {
        const body = (await request.json()) as { mode?: string } | null;
        const mode = body?.mode ?? "state";
        const data = SANKEY_RESPONSES[mode] ?? SANKEY_RESPONSES.state;
        return HttpResponse.json(data);
    }),

    // ---- Heatmap ----
    http.get("*/api/v1/heatmap", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("type") === "risk") {
            return HttpResponse.json(hotspotHeatmapSample);
        }
        return HttpResponse.json(reviewHeatmapSample);
    }),

    // ---- Flame ----
    http.get("*/api/v1/flame/aggregated", ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("mode") ?? "cycle_breakdown";
        const data = FLAME_RESPONSES[mode] ?? FLAME_RESPONSES.cycle_breakdown;
        return HttpResponse.json(data);
    }),

    http.get("*/api/v1/flame", ({ request }) => {
        const url = new URL(request.url);
        const entityType = url.searchParams.get("entity_type") ?? "issue";
        const entityId = url.searchParams.get("entity_id") ?? "sample-entity";

        if (entityType === "deployment" && entityId === "missing-flame") {
            return HttpResponse.json({ detail: "Not found" }, { status: 404 });
        }

        if (entityType !== "deployment") {
            return HttpResponse.json(cycleBreakdownFlameSample);
        }

        return HttpResponse.json(buildDeploymentFlameResponse(entityId));
    }),

    // ---- Quadrant ----
    http.get("*/api/v1/quadrant", ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get("type") ?? "cycle_throughput";

        const QUADRANT_AXES: Record<
            string,
            {
                x: { metric: string; label: string; unit: string };
                y: { metric: string; label: string; unit: string };
            }
        > = {
            cycle_throughput: {
                x: { metric: "cycle_time", label: "Cycle Time", unit: "hours" },
                y: { metric: "throughput", label: "Throughput", unit: "PRs/week" },
            },
            wip_throughput: {
                x: { metric: "wip", label: "WIP", unit: "items" },
                y: { metric: "throughput", label: "Throughput", unit: "PRs/week" },
            },
            churn_throughput: {
                x: { metric: "churn", label: "Churn", unit: "%" },
                y: { metric: "throughput", label: "Throughput", unit: "PRs/week" },
            },
            review_load_latency: {
                x: { metric: "review_load", label: "Review Load", unit: "reviews/dev" },
                y: { metric: "review_latency", label: "Review Latency", unit: "hours" },
            },
        };

        const axes = QUADRANT_AXES[type] ?? QUADRANT_AXES.cycle_throughput;

        return HttpResponse.json({
            axes,
            points: [
                { label: "repo-alpha", x: 24, y: 12, size: 30 },
                { label: "repo-beta", x: 48, y: 8, size: 20 },
                { label: "repo-gamma", x: 72, y: 5, size: 15 },
            ],
            annotations: [],
        });
    }),

    // ---- People ----
    http.get("*/api/v1/people", ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        const results = q
            ? SAMPLE_PEOPLE.filter(
                  (p) =>
                      p.display_name.toLowerCase().includes(q) ||
                      p.identities.some((i) => i.handle.toLowerCase().includes(q)),
              )
            : SAMPLE_PEOPLE;
        return HttpResponse.json(results);
    }),

    http.get("*/api/v1/people/:id/summary", ({ params }) => {
        const personId = params.id as string;
        const person = SAMPLE_PEOPLE.find((p) => p.person_id === personId) ?? {
            person_id: personId,
            display_name: personId,
            identities: [],
            active: true,
        };
        return HttpResponse.json({
            person,
            freshness: {
                last_ingested_at: new Date().toISOString(),
                sources: { github: "ok" },
                coverage: { repos: 5, people: 1 },
            },
            identity_coverage_pct: 100,
            deltas: [
                {
                    metric: "cycle_time",
                    label: "Cycle Time",
                    unit: "hours",
                    value: 36,
                    delta_pct: -10,
                },
                {
                    metric: "review_latency",
                    label: "Review Latency",
                    unit: "hours",
                    value: 4,
                    delta_pct: -15,
                },
                {
                    metric: "throughput",
                    label: "Throughput",
                    unit: "PRs/week",
                    value: 8,
                    delta_pct: 5,
                },
                {
                    metric: "churn",
                    label: "Churn",
                    unit: "%",
                    value: 12,
                    delta_pct: -3,
                },
                {
                    metric: "wip_overlap",
                    label: "WIP Overlap",
                    unit: "items",
                    value: 2,
                    delta_pct: 0,
                },
                {
                    metric: "blocked_work",
                    label: "Blocked Work",
                    unit: "%",
                    value: 8,
                    delta_pct: -2,
                },
            ],
            narrative: [{ text: "This person appears to maintain a steady delivery pace." }],
            sections: {
                work_mix: {
                    themes: {
                        feature_delivery: 0.6,
                        maintenance: 0.25,
                        operational: 0.15,
                    },
                    evidence_count: 24,
                },
                flow_breakdown: {
                    coding_pct: 0.4,
                    review_pct: 0.25,
                    waiting_pct: 0.2,
                    meeting_pct: 0.15,
                },
                collaboration: {
                    reviewers: [
                        {
                            person_id: "person-456",
                            display_name: "Jordan Lee",
                            review_count: 12,
                        },
                    ],
                    authors_reviewed: [
                        {
                            person_id: "person-789",
                            display_name: "Sam Rivera",
                            review_count: 8,
                        },
                    ],
                },
            },
        });
    }),

    http.get("*/api/v1/people/:id/metric", () =>
        HttpResponse.json({
            metric: "cycle_time",
            label: "Cycle Time",
            unit: "hours",
            value: 36,
            delta_pct: -10,
            timeseries: [
                { day: "2025-01-01", value: 40 },
                { day: "2025-01-08", value: 38 },
                { day: "2025-01-15", value: 36 },
            ],
            breakdown: {
                by_repo: [
                    { repo: "dev-health-ops", value: 30 },
                    { repo: "dev-health-web", value: 42 },
                ],
            },
        }),
    ),

    http.get("*/api/v1/people/:id/drilldown/:type", () =>
        HttpResponse.json({ items: [], cursor: null }),
    ),

    // ---- Explain ----
    http.post("*/api/v1/explain", async ({ request }) => {
        const body = (await request.json()) as { metric?: string } | null;
        const metric = body?.metric ?? "cycle_time";
        return HttpResponse.json({
            metric,
            label: metric.replace(/_/g, " "),
            unit: "hours",
            value: 42,
            delta_pct: -5,
            drivers: [],
            contributors: metric === "churn" ? churnHotspotContributors : [],
            drilldown_links: {},
        });
    }),

    http.get("*/api/v1/explain", ({ request }) => {
        const metric = new URL(request.url).searchParams.get("metric") ?? "cycle_time";
        return HttpResponse.json({
            metric,
            label: metric.replace(/_/g, " "),
            unit: "hours",
            value: 42,
            delta_pct: -5,
            drivers: [],
            contributors: metric === "churn" ? churnHotspotContributors : [],
            drilldown_links: {},
        });
    }),

    // ---- Drilldown ----
    http.post("*/api/v1/drilldown/prs", () => HttpResponse.json({ items: [], total: 0 })),

    http.post("*/api/v1/drilldown/issues", () => HttpResponse.json({ items: [], total: 0 })),

    // ---- Opportunities ----
    http.post("*/api/v1/opportunities", () =>
        HttpResponse.json({
            items: [
                {
                    id: "reduce-review-latency",
                    title: "Reduce Review Latency",
                    rationale: "Review wait time appears to lengthen cycle time in this window.",
                    evidence_links: ["/api/v1/explain?metric=review_latency"],
                    suggested_experiments: [
                        "Trial a 24h review SLA for the auth squad",
                        "Add a second reviewer to the on-call rota",
                    ],
                },
                {
                    id: "stabilise-flaky-suite",
                    title: "Stabilise the Flaky Suite",
                    rationale:
                        "Retry rates appear elevated; no linked artifacts in this window yet.",
                    evidence_links: [],
                    suggested_experiments: ["Quarantine the top 3 flaky specs and track re-runs"],
                },
            ],
        }),
    ),

    // ---- GraphQL ----
    http.post("*/graphql", async ({ request }) => {
        let body: { query?: string; variables?: Record<string, unknown> } | null = null;
        try {
            body = (await request.json()) as {
                query?: string;
                variables?: Record<string, unknown>;
            };
        } catch (error) {
            console.warn("[msw] Failed to parse GraphQL request body", error);
        }
        return dispatchGraphQL(body?.query ?? "", body?.variables ?? {});
    }),

    http.get("*/graphql", ({ request }) => {
        const url = new URL(request.url);
        const query = url.searchParams.get("query") ?? "";
        const rawVariables = url.searchParams.get("variables");
        let variables: Record<string, unknown> = {};
        if (rawVariables) {
            try {
                variables = JSON.parse(rawVariables) as Record<string, unknown>;
            } catch {
                variables = {};
            }
        }
        return dispatchGraphQL(query, variables);
    }),

    http.post("*/api/v1/auth/register", async ({ request }) => {
        const body = (await request.json()) as { email?: string } | null;
        if (body?.email === "existing@example.com") {
            return HttpResponse.json({ detail: "Email already registered" }, { status: 409 });
        }
        return HttpResponse.json({ registered: true }, { status: 201 });
    }),

    http.post("*/api/v1/auth/forgot-password", () =>
        HttpResponse.json({
            message: "If an account exists, a reset email was sent.",
        }),
    ),

    http.get("*/api/v1/auth/verify", ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (token === "valid-token") {
            return HttpResponse.json({
                message: "Email verified successfully",
                verified: true,
            });
        }
        return HttpResponse.json(
            { detail: { message: "Invalid or expired verification token" } },
            { status: 400 },
        );
    }),

    // CHAOS-2670: workspace creation. Rejects a blank/whitespace org name (the
    // guided workspace step must not silently create an unnamed workspace) and,
    // on success, advances the shared progress to the integration step.
    http.post("*/api/v1/auth/onboard", async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
            action?: string;
            org_name?: string;
        } | null;
        const orgName = typeof body?.org_name === "string" ? body.org_name.trim() : "";
        if (!orgName) {
            return HttpResponse.json({ detail: "Organization name is required" }, { status: 400 });
        }
        onboardingProgress.orgCreated = true;
        onboardingProgress.orgId = "org-new";
        onboardingProgress.orgName = orgName;
        return HttpResponse.json<OnboardResponseBody>({
            access_token: "mock-onboard-token",
            refresh_token: "mock-onboard-refresh",
            token_type: "bearer",
            org_id: "org-new",
            org_name: orgName,
            role: "owner",
            expires_in: 86400,
        });
    }),

    http.get("*/api/v1/orgs/me", () =>
        HttpResponse.json({
            id: "org-e2e",
            slug: "my-organization-e2e",
            name: "My Organization",
            tier: "community",
            is_active: true,
        }),
    ),

    http.get("*/api/v1/admin/credentials", () =>
        HttpResponse.json<MockCredential[]>(MOCK_CREDENTIALS),
    ),

    http.get("*/api/v1/admin/credentials/:id/repos", ({ request }) => {
        const owner = new URL(request.url).searchParams.get("owner") ?? "myorg";
        const repos = [
            {
                name: "repo-alpha",
                full_name: `${owner}/repo-alpha`,
                description: "Alpha service",
                is_private: false,
                is_archived: false,
                default_branch: "main",
                language: "TypeScript",
                stargazers_count: 0,
                forks_count: 0,
                updated_at: "2026-01-15T00:00:00.000Z",
            },
            {
                name: "repo-beta",
                full_name: `${owner}/repo-beta`,
                description: "Beta service",
                is_private: true,
                is_archived: false,
                default_branch: "main",
                language: "Python",
                stargazers_count: 0,
                forks_count: 0,
                updated_at: "2026-01-15T00:00:00.000Z",
            },
        ];
        return HttpResponse.json({ provider: "github", owner, repos, total: repos.length });
    }),

    http.post("*/api/v1/admin/credentials", async ({ request }) => {
        const body = (await request.json()) as Partial<MockCredential> | null;
        const created: MockCredential = {
            id: body?.id ?? `cred-${Date.now()}`,
            provider: body?.provider ?? "github",
            name: body?.name ?? "Credential",
            created_at: body?.created_at ?? new Date().toISOString(),
        };
        MOCK_CREDENTIALS.push(created);
        return HttpResponse.json<MockCredential>(created);
    }),

    http.delete("*/api/v1/admin/credentials/:id", ({ params }) => {
        const credentialId = params.id as string;
        const next = MOCK_CREDENTIALS.filter((item) => item.id !== credentialId);
        MOCK_CREDENTIALS.splice(0, MOCK_CREDENTIALS.length, ...next);
        return HttpResponse.json({ deleted: true });
    }),

    http.post("*/api/v1/admin/credentials/test", () =>
        HttpResponse.json({ success: true, error: null, details: null }),
    ),

    http.get("*/api/v1/admin/sync-configs", () =>
        HttpResponse.json<MockSyncConfig[]>(MOCK_SYNC_CONFIGS),
    ),

    http.get("*/api/v1/admin/sync-configs/:id", ({ params }) => {
        const syncConfigId = params.id as string;
        const syncConfig = MOCK_SYNC_CONFIGS.find((item) => item.id === syncConfigId);
        if (!syncConfig) {
            return HttpResponse.json({ detail: "Sync config not found" }, { status: 404 });
        }
        return HttpResponse.json<MockSyncConfig>(syncConfig);
    }),

    http.get("*/api/v1/admin/sync-configs/:id/repositories", ({ params }) => {
        const syncConfigId = params.id as string;
        const syncConfig = MOCK_SYNC_CONFIGS.find((item) => item.id === syncConfigId);
        if (!syncConfig) {
            return HttpResponse.json({ detail: "Sync config not found" }, { status: 404 });
        }
        const selection = MOCK_REPOSITORY_SELECTIONS.get(syncConfigId) ?? {
            owner: String(syncConfig.sync_options?.owner ?? ""),
            repos: [],
        };
        return HttpResponse.json({ ...selection, sync_all_repos: false });
    }),

    http.post("*/api/v1/admin/sync-configs", async ({ request }) => {
        const body = (await request.json()) as Partial<MockSyncConfig> | null;
        const created: MockSyncConfig = {
            id: body?.id ?? `sync-config-${Date.now()}`,
            provider: body?.provider ?? "github",
            name: body?.name ?? "Sync Config",
            enabled: body?.enabled ?? true,
            credential_id:
                (body as { credential_id?: string | null } | null)?.credential_id ?? null,
            sync_targets: (body as { sync_targets?: string[] } | null)?.sync_targets ?? [],
            sync_options:
                (body as { sync_options?: Record<string, unknown> } | null)?.sync_options ?? {},
            is_active: true,
            schedule_cron: null,
            timezone: null,
            initial_sync_depth: 30,
            last_sync_at: null,
            last_sync_success: null,
            last_sync_error: null,
            parent_id: null,
            created_at: body?.created_at ?? new Date().toISOString(),
            updated_at: body?.updated_at ?? new Date().toISOString(),
        };
        MOCK_SYNC_CONFIGS.push(created);
        return HttpResponse.json<MockSyncConfig>(created);
    }),

    http.post("*/api/v1/admin/sync-configs/batch", async ({ request }) => {
        const body = (await request.json()) as { repos?: string[]; provider?: string } | null;
        const repos = body?.repos ?? [];
        if (repos.length === 0 || repos.some((repo) => !repo.includes("/"))) {
            return HttpResponse.json(
                { detail: "Batch sync repo selections must use full names." },
                { status: 400 },
            );
        }
        const parentId = `sync-config-batch-${Date.now()}`;
        const owner = repos[0]?.split("/")[0] ?? "myorg";
        const parent: MockSyncConfig = {
            id: parentId,
            provider: body?.provider ?? "github",
            name: "Selected Repos",
            enabled: true,
            credential_id:
                (body as { credential_id?: string | null } | null)?.credential_id ?? null,
            sync_targets: (body as { sync_targets?: string[] } | null)?.sync_targets ?? [],
            sync_options: { owner },
            is_active: true,
            schedule_cron: null,
            timezone: null,
            initial_sync_depth: 30,
            last_sync_at: null,
            last_sync_success: null,
            last_sync_error: null,
            parent_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        MOCK_SYNC_CONFIGS.push(parent);
        MOCK_REPOSITORY_SELECTIONS.set(parentId, { owner, repos });
        return HttpResponse.json({
            created: [],
            parent,
            count: repos.length,
        });
    }),

    http.put("*/api/v1/admin/sync-configs/:id/repositories", async ({ params, request }) => {
        const syncConfigId = params.id as string;
        const body = (await request.json()) as { owner?: string; repos?: string[] } | null;
        const syncConfig = MOCK_SYNC_CONFIGS.find((item) => item.id === syncConfigId);
        if (!syncConfig) {
            return HttpResponse.json({ detail: "Sync config not found" }, { status: 404 });
        }
        const owner = body?.owner ?? "myorg";
        const repos = body?.repos ?? [];
        MOCK_REPOSITORY_SELECTIONS.set(syncConfigId, { owner, repos });
        syncConfig.sync_options = { ...(syncConfig.sync_options ?? {}), owner };
        syncConfig.updated_at = new Date().toISOString();
        return HttpResponse.json({ owner, repos, sync_all_repos: false });
    }),

    http.patch("*/api/v1/admin/sync-configs/:id", async ({ params, request }) => {
        const syncConfigId = params.id as string;
        const body = (await request.json()) as Partial<MockSyncConfig> | null;
        const syncConfig = MOCK_SYNC_CONFIGS.find((item) => item.id === syncConfigId);
        if (!syncConfig) {
            return HttpResponse.json({ detail: "Sync config not found" }, { status: 404 });
        }
        if (body?.provider) {
            syncConfig.provider = body.provider;
        }
        if (body?.name) {
            syncConfig.name = body.name;
        }
        if (typeof body?.enabled === "boolean") {
            syncConfig.enabled = body.enabled;
        }
        syncConfig.updated_at = new Date().toISOString();
        return HttpResponse.json<MockSyncConfig>(syncConfig);
    }),

    http.delete("*/api/v1/admin/sync-configs/:id", ({ params }) => {
        const syncConfigId = params.id as string;
        const next = MOCK_SYNC_CONFIGS.filter((item) => item.id !== syncConfigId);
        MOCK_SYNC_CONFIGS.splice(0, MOCK_SYNC_CONFIGS.length, ...next);
        return HttpResponse.json({ deleted: true });
    }),

    http.post("*/api/v1/admin/sync-configs/:id/trigger", () =>
        HttpResponse.json({ status: "triggered" }),
    ),

    http.get("*/api/v1/admin/sync-configs/:id/jobs", ({ params }) => {
        if (params.id === "sync-config-edit-repos") {
            return HttpResponse.json(MOCK_SYNC_JOBS);
        }
        return HttpResponse.json([]);
    }),

    http.get("*/api/v1/admin/teams", () => HttpResponse.json(MOCK_TEAMS)),

    http.post("*/api/v1/admin/teams", async ({ request }) => {
        const body = (await request.json()) as Partial<MockTeam> | null;
        const teamId = body?.team_id ?? `team-${Date.now()}`;
        const created: MockTeam = {
            id: teamId,
            team_id: teamId,
            name: body?.name ?? "Team",
            source: body?.source ?? "github",
        };
        MOCK_TEAMS.push(created);
        return HttpResponse.json(created);
    }),

    http.get("*/api/v1/admin/teams/pending-changes", () =>
        HttpResponse.json({ changes: [], total: 0 }),
    ),

    http.get("*/api/v1/admin/teams/discover", () =>
        HttpResponse.json({
            items: [
                {
                    team_id: "discovered-team",
                    name: "Auto-discovered",
                    source: "github",
                },
            ],
        }),
    ),

    http.get("*/api/v1/admin/identities", () => HttpResponse.json(MOCK_IDENTITIES)),

    http.post("*/api/v1/admin/identities", async ({ request }) => {
        const body = (await request.json()) as Partial<MockIdentity> | null;
        const created: MockIdentity = {
            id: body?.id ?? `identity-${Date.now()}`,
            provider: body?.provider ?? "github",
            external_id: body?.external_id ?? `external-${Date.now()}`,
            user_id: body?.user_id ?? "e2e-user-1",
        };
        MOCK_IDENTITIES.push(created);
        return HttpResponse.json(created);
    }),

    http.get("*/api/v1/admin/users", () =>
        HttpResponse.json({
            items: [
                {
                    id: "e2e-user-1",
                    email: "test@example.com",
                    role: "owner",
                    is_active: true,
                },
            ],
            total: 1,
        }),
    ),

    http.get("*/api/v1/admin/settings/categories", () =>
        HttpResponse.json(["general", "security"]),
    ),

    http.get("*/api/v1/admin/impersonate/status", () =>
        HttpResponse.json({ is_impersonating: false, target_user_id: null }),
    ),
];
