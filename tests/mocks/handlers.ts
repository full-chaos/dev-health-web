/**
 * MSW v2 request handlers for Playwright e2e tests.
 *
 * These handlers replace the inline DEV_HEALTH_TEST_MODE conditionals that
 * were previously scattered across production components.  The Express mock
 * server (http-server.ts) mounts them on port 8000, which is the default
 * BACKEND_URL that the Next.js proxy middleware rewrites to.
 */

import { http, HttpResponse } from "msw";

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

const FLAME_RESPONSES: Record<string, unknown> = {
  cycle_breakdown: cycleBreakdownFlameSample,
  code_hotspots: codeHotspotsFlameSample,
  throughput: throughputFlameSample,
};

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
];
