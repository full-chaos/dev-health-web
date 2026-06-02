/**
 * Component tests for CompoundingRiskDashboard (CHAOS-1642).
 *
 * Verifies the contract a reviewer will look for on the surface:
 *
 * - Score, severity chip, scope label, and per-component values are all
 *   rendered from the GraphQL row exactly as persisted.
 * - Empty state renders when no rows are supplied.
 * - Table includes the Work Graph drilldown link with the correct scope
 *   parameters.
 * - The dashboard surfaces the weights/thresholds audit trail.
 */

import { describe, expect, it } from "vitest";

import { render, screen, within } from "@/test/utils";

import {
  CompoundingRiskDashboard,
  type CompoundingRiskDashboardProps,
  type CompoundingRiskRowView,
} from "./CompoundingRiskDashboard";

function makeRow(overrides: Partial<CompoundingRiskRowView> = {}): CompoundingRiskRowView {
  return {
    day: "2026-05-20",
    scope: "repo",
    scopeId: "11111111-1111-1111-1111-111111111111",
    scopeLabel: "meridian/core-api",
    score: 0.72,
    severity: "high",
    components: {
      churnNorm: 0.8,
      complexityNorm: 0.7,
      ownershipNorm: 0.6,
      reviewNorm: 0.5,
      reworkChurn: 0.18,
      complexityDelta: 0.12,
      busFactor: 4,
      ownershipGini: 0.55,
      singleOwnerRatio: 0.65,
      reviewLatencyP90h: 30,
    },
    weights: {
      churn: 0.3,
      complexity: 0.3,
      ownership: 0.2,
      review: 0.2,
    },
    thresholds: {
      elevated: 0.4,
      high: 0.65,
    },
    computedAt: "2026-05-21T12:00:00Z",
    ...overrides,
  };
}

function renderDashboard(overrides: Partial<CompoundingRiskDashboardProps> = {}) {
  const props: CompoundingRiskDashboardProps = {
    orgId: "demo-org",
    breakout: "repo",
    rows: [makeRow()],
    trend: [
      { day: "2026-05-19", score: 0.65, severity: "high" },
      { day: "2026-05-20", score: 0.72, severity: "high" },
    ],
    generatedAt: "2026-05-21T12:00:00Z",
    ...overrides,
  };
  return render(<CompoundingRiskDashboard {...props} />);
}

describe("CompoundingRiskDashboard", () => {
  it("renders the headline score and severity from the row", () => {
    renderDashboard();
    const score = screen.getByTestId("headline-score");
    expect(score.textContent).toBe("0.72");
    const chips = screen.getAllByTestId("severity-chip");
    // First chip is the headline; subsequent chips are in the table.
    expect(chips[0].getAttribute("data-severity")).toBe("high");
  });

  it("renders all four component bars with the normalized value", () => {
    renderDashboard();
    const churn = screen.getByTestId("component-churn");
    expect(within(churn).getByText("0.80")).toBeInTheDocument();
    const complexity = screen.getByTestId("component-complexity");
    expect(within(complexity).getByText("0.70")).toBeInTheDocument();
    const ownership = screen.getByTestId("component-ownership");
    expect(within(ownership).getByText("0.60")).toBeInTheDocument();
    const review = screen.getByTestId("component-review-latency");
    expect(within(review).getByText("0.50")).toBeInTheDocument();
  });

  it("surfaces the persisted thresholds audit trail", () => {
    renderDashboard();
    expect(screen.getByText(/elevated ≥ 0\.40/i)).toBeInTheDocument();
    expect(screen.getByText(/high ≥ 0\.65/i)).toBeInTheDocument();
  });

  it("renders one table row per scope and links into Work Graph", () => {
    const rows = [
      makeRow({
        scopeId: "repo-a",
        scopeLabel: "meridian/web-app",
        score: 0.8,
      }),
      makeRow({
        scopeId: "repo-b",
        scopeLabel: "meridian/infra",
        score: 0.35,
        severity: "low",
      }),
    ];
    renderDashboard({ rows });

    const tableRows = screen.getAllByTestId("risk-row");
    expect(tableRows).toHaveLength(2);
    expect(tableRows[0].getAttribute("data-scope-id")).toBe("repo-a");
    expect(tableRows[1].getAttribute("data-severity")).toBe("low");

    const drilldownLinks = screen.getAllByTestId("open-in-work-graph");
    expect(drilldownLinks[0].getAttribute("href")).toContain("risk_scope_id=repo-a");
    expect(drilldownLinks[0].getAttribute("href")).toContain("risk_scope_kind=repo");
  });

  it("uses 'team' in the drilldown URL when breakout is team", () => {
    const rows = [
      makeRow({
        scope: "team",
        scopeId: "team-x",
        scopeLabel: "Platform",
        score: 0.6,
      }),
    ];
    renderDashboard({ breakout: "team", rows });

    const drilldown = screen.getByTestId("open-in-work-graph");
    expect(drilldown.getAttribute("href")).toContain("risk_scope_kind=team");
    expect(drilldown.getAttribute("href")).toContain("risk_scope_id=team-x");
  });

  it("renders the rich empty state when no rows are supplied (no compounding_risk_daily payload)", () => {
    renderDashboard({ rows: [], trend: [] });
    // Unified rich empty state — same testid as the all-null branch.
    expect(screen.getByTestId("all-scores-null-state")).toBeInTheDocument();
    expect(screen.getByText(/Scores currently unavailable/)).toBeInTheDocument();
    // Empty-rows branch points the operator at the metrics command.
    expect(screen.getByText(/dev-hops metrics daily/)).toBeInTheDocument();
    // No specific input list when there are no rows to inspect.
    expect(screen.queryByText(/Missing inputs across all/)).not.toBeInTheDocument();
    // The normal dashboard chrome must NOT render.
    expect(screen.queryByTestId("headline-score")).not.toBeInTheDocument();
    expect(screen.queryByTestId("compounding-risk-table")).not.toBeInTheDocument();
  });

  it("renders a trend sparkline with one bar per day", () => {
    renderDashboard();
    const sparkline = screen.getByTestId("trend-sparkline");
    expect(sparkline.children.length).toBe(2);
  });

  it("renders '—' for null scores rather than 0 in a mixed or non-empty valid set", () => {
    const rows = [
      makeRow({
        score: null,
        severity: "unknown",
        components: {
          ...makeRow().components,
          churnNorm: null,
          complexityNorm: null,
          ownershipNorm: null,
          reviewNorm: null,
        },
      }),
      makeRow({
        score: 0.8,
        severity: "high",
        scopeId: "repo-b",
      }),
    ];
    renderDashboard({ rows });
    // headline shows 0.8 from the valid row
    const score = screen.getByTestId("headline-score");
    expect(score.textContent).toBe("0.80");

    // the first row in the table should be the null one if we just look at rows[0], but let's check the table
    const tableRows = screen.getAllByTestId("risk-row");
    // The null row is tableRows[0]
    expect(tableRows[0].textContent).toContain("—");
  });

  it("renders the explanatory empty state when ALL rows have null scores", () => {
    const rows = [
      makeRow({
        score: null,
        severity: "unknown",
        components: {
          ...makeRow().components,
          churnNorm: null,
          complexityNorm: null,
          ownershipNorm: null,
          reviewNorm: null,
        },
      }),
      makeRow({
        scopeId: "repo-b",
        score: null,
        severity: "unknown",
        components: {
          ...makeRow().components,
          churnNorm: null,
          complexityNorm: null,
          ownershipNorm: null,
          reviewNorm: null,
        },
      }),
    ];
    renderDashboard({ rows, breakout: "team" });

    expect(screen.getByTestId("all-scores-null-state")).toBeInTheDocument();
    expect(screen.getByText(/Scores currently unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Missing inputs across all teams:/)).toBeInTheDocument();

    // check that the 4 derived missing inputs are listed
    expect(screen.getByText("rework churn")).toBeInTheDocument();
    expect(
      screen.getByText("complexity delta (rising cyclomatic_per_kloc trend)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ownership concentration (gini and single-owner ratio)"),
    ).toBeInTheDocument();
    expect(screen.getByText("review latency (p90h)")).toBeInTheDocument();

    // The normal components shouldn't be there
    expect(screen.queryByTestId("headline-score")).not.toBeInTheDocument();
    expect(screen.queryByTestId("compounding-risk-table")).not.toBeInTheDocument();
  });
});
