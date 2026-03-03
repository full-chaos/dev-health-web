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
  investmentMixSample,
  reviewHeatmapSample,
  workUnitInvestmentsSample,
  cycleBreakdownFlameSample,
  codeHotspotsFlameSample,
  throughputFlameSample,
  sankeyStateTransitionSample,
  sankeyHotspotNodes,
  sankeyHotspotLinks,
  sankeyExpenseNodes,
  sankeyExpenseLinks,
  sankeyInvestmentNodes,
  sankeyInvestmentLinks,
  investmentRepoTeamMapSample,
  sampleCapacityForecast,
} from "../../src/data/devHealthOpsSample";

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

const SANKEY_RESPONSES: Record<string, { nodes: unknown[]; links: unknown[]; label: string; unit: string }> = {
  state: {
    nodes: sankeyStateTransitionSample.flatMap((t) => [
      { name: t.fromStatus, group: "status" },
      { name: t.toStatus, group: "status" },
    ]).filter((n, i, arr) => arr.findIndex((x) => x.name === n.name) === i),
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

const MOCK_SYNC_CONFIGS: MockSyncConfig[] = [];
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
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
  // ---- Auth (for e2e test authentication) ----
  http.post("*/api/v1/auth/login", async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string } | null;
    if (!body?.email || !body?.password) {
      return HttpResponse.json({ detail: "Missing credentials" }, { status: 400 });
    }
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

  http.post("*/api/v1/billing/refunds", () =>
    HttpResponse.json(SAMPLE_REFUND),
  ),

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
  http.get("*/health", () =>
    HttpResponse.json({ status: "ok", services: { api: "mock" } }),
  ),

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

  http.get("*/api/v1/billing/plans", ({ request }) => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    return HttpResponse.json<MockBillingPlan[]>(
      includeInactive ? MOCK_BILLING_PLANS : MOCK_BILLING_PLANS.filter((plan) => plan.is_active),
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
        { metric: "cycle_time", label: "Cycle Time", unit: "hours", value: 48, delta_pct: -12 },
        { metric: "throughput", label: "Throughput", unit: "PRs/week", value: 15, delta_pct: 8 },
        { metric: "review_latency", label: "Review Latency", unit: "hours", value: 6, delta_pct: -5 },
        { metric: "churn", label: "Churn", unit: "%", value: 18, delta_pct: 3 },
      ],
      summary: [
        { text: "Team velocity appears stable over the past 14 days." },
      ],
      tiles: {},
      constraint: { label: "WIP Saturation", metric: "wip_saturation", value: 0.6, threshold: 0.8, status: "ok" },
      events: [],
    }),
  ),

  // ---- Investment ----
  http.post("*/api/v1/investment", () =>
    HttpResponse.json(investmentMixSample),
  ),

  http.post("*/api/v1/investment/explain", () =>
    HttpResponse.json({
      summary:
        "This view suggests effort leans toward a small number of dominant themes, with subcategories providing the specific intent behind that allocation.",
      top_findings: [
        {
          finding:
            "Subcategory distribution appears concentrated in the leading theme families.",
          evidence: {
            theme:
              Object.keys(investmentMixSample.theme_distribution)[0] ||
              "Unknown",
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
        ...Array.from(new Set(Object.values(investmentRepoTeamMapSample))).map(
          (t) => ({ name: t, group: "team" }),
        ),
      ],
      links: Object.entries(investmentRepoTeamMapSample).map(
        ([repo, team]) => ({
          source: repo.replace("repo:", ""),
          target: team,
          value: 10,
        }),
      ),
      label: "Repo → Team",
      unit: "units",
    }),
  ),

  // ---- Work Units ----
  http.post("*/api/v1/work-units", () =>
    HttpResponse.json(workUnitInvestmentsSample),
  ),

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
  http.get("*/api/v1/heatmap", () =>
    HttpResponse.json(reviewHeatmapSample),
  ),

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

    const QUADRANT_AXES: Record<string, { x: { metric: string; label: string; unit: string }; y: { metric: string; label: string; unit: string } }> = {
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
        { metric: "cycle_time", label: "Cycle Time", unit: "hours", value: 36, delta_pct: -10 },
        { metric: "review_latency", label: "Review Latency", unit: "hours", value: 4, delta_pct: -15 },
        { metric: "throughput", label: "Throughput", unit: "PRs/week", value: 8, delta_pct: 5 },
        { metric: "churn", label: "Churn", unit: "%", value: 12, delta_pct: -3 },
        { metric: "wip_overlap", label: "WIP Overlap", unit: "items", value: 2, delta_pct: 0 },
        { metric: "blocked_work", label: "Blocked Work", unit: "%", value: 8, delta_pct: -2 },
      ],
      narrative: [
        { text: "This person appears to maintain a steady delivery pace." },
      ],
      sections: {
        work_mix: {
          themes: { feature_delivery: 0.6, maintenance: 0.25, operational: 0.15 },
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
            { person_id: "person-456", display_name: "Jordan Lee", review_count: 12 },
          ],
          authors_reviewed: [
            { person_id: "person-789", display_name: "Sam Rivera", review_count: 8 },
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
      contributors: [],
      drilldown_links: {},
    });
  }),

  // ---- Drilldown ----
  http.post("*/api/v1/drilldown/prs", () =>
    HttpResponse.json({ items: [], total: 0 }),
  ),

  http.post("*/api/v1/drilldown/issues", () =>
    HttpResponse.json({ items: [], total: 0 }),
  ),

  // ---- Opportunities ----
  http.post("*/api/v1/opportunities", () =>
    HttpResponse.json({ opportunities: [] }),
  ),

  // ---- GraphQL ----
  http.post("*/graphql", async ({ request }) => {
    const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> } | null;
    const query = body?.query ?? "";

    // Investment breakdown query (analytics)
    if (query.includes("InvestmentBreakdown") || query.includes("analytics")) {
      return HttpResponse.json({
        data: {
          analytics: {
            breakdowns: [
              {
                dimension: "THEME",
                measure: "COUNT",
                items: Object.entries(investmentMixSample.theme_distribution).map(
                  ([key, value]) => ({ key, value }),
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

    // Work graph edges
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
          },
        },
      });
    }

    // Capacity forecast
    if (query.includes("capacityForecast") || query.includes("CapacityForecast")) {
      return HttpResponse.json({
        data: {
          capacityForecast: sampleCapacityForecast,
        },
      });
    }

    // Investment flow
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

    // Default: empty data
    return HttpResponse.json({ data: {} });
  }),

  http.post("*/api/v1/auth/register", async ({ request }) => {
    const body = (await request.json()) as { email?: string } | null;
    if (body?.email === "existing@example.com") {
      return HttpResponse.json({ detail: "Email already registered" }, { status: 409 });
    }
    return HttpResponse.json({ registered: true }, { status: 201 });
  }),

  http.post("*/api/v1/auth/onboard", () =>
    HttpResponse.json<OnboardResponseBody>({
      access_token: "mock-onboard-token",
      refresh_token: "mock-onboard-refresh",
      token_type: "bearer",
      org_id: "org-new",
      org_name: "New Organization",
      role: "owner",
      expires_in: 86400,
    }),
  ),

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

  http.post("*/api/v1/admin/sync-configs", async ({ request }) => {
    const body = (await request.json()) as Partial<MockSyncConfig> | null;
    const created: MockSyncConfig = {
      id: body?.id ?? `sync-config-${Date.now()}`,
      provider: body?.provider ?? "github",
      name: body?.name ?? "Sync Config",
      enabled: body?.enabled ?? true,
      created_at: body?.created_at ?? new Date().toISOString(),
      updated_at: body?.updated_at ?? new Date().toISOString(),
    };
    MOCK_SYNC_CONFIGS.push(created);
    return HttpResponse.json<MockSyncConfig>(created);
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

  http.get("*/api/v1/admin/sync-configs/:id/jobs", () =>
    HttpResponse.json([]),
  ),

  http.get("*/api/v1/admin/teams", () =>
    HttpResponse.json(MOCK_TEAMS),
  ),

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
      items: [{ team_id: "discovered-team", name: "Auto-discovered", source: "github" }],
    }),
  ),

  http.get("*/api/v1/admin/identities", () =>
    HttpResponse.json(MOCK_IDENTITIES),
  ),

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
      items: [{ id: "e2e-user-1", email: "test@example.com", role: "owner", is_active: true }],
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
