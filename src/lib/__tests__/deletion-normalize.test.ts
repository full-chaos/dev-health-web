import { describe, it, expect } from "vitest";
import { normalizeDeletionResult } from "../admin/api/orgs";
import type { DeletionResultRaw } from "../admin/types";

const raw: DeletionResultRaw = {
  organization_id: "org-1",
  dry_run: true,
  timestamp: "2026-01-01T00:00:00Z",
  postgres: {
    total: 5,
    tables: { organizations: 1, settings: 2, scheduled_jobs: 0, teams: 2 },
  },
  clickhouse: {
    total: 7,
    tables: { repo_metrics_daily: 3, teams: 4, ai_attribution: 0 },
  },
  disabled_jobs: 2,
  credentials_deleted: 3,
  warnings: ["ClickHouse URI not configured; analytics tables were not verified."],
};

describe("normalizeDeletionResult", () => {
  it("maps snake_case backend result to camelCase UI plan", () => {
    const plan = normalizeDeletionResult(raw);
    expect(plan.organizationId).toBe("org-1");
    expect(plan.dryRun).toBe(true);
    expect(plan.timestamp).toBe("2026-01-01T00:00:00Z");
    expect(plan.disabledJobCount).toBe(2);
    expect(plan.credentialDeletionCount).toBe(3);
    expect(plan.warnings).toHaveLength(1);
  });

  it("omits zero-count tables and disambiguates analytics name collisions", () => {
    const plan = normalizeDeletionResult(raw);
    // zero-count tables are dropped from the preview
    expect(plan.deletedCounts).not.toHaveProperty("scheduled_jobs");
    expect(plan.deletedCounts).not.toHaveProperty("ai_attribution");
    // postgres tables surface directly
    expect(plan.deletedCounts.organizations).toBe(1);
    expect(plan.deletedCounts.settings).toBe(2);
    // collision: postgres "teams" kept, clickhouse "teams" suffixed (not merged)
    expect(plan.deletedCounts.teams).toBe(2);
    expect(plan.deletedCounts["teams (analytics)"]).toBe(4);
    // non-colliding clickhouse table surfaces directly
    expect(plan.deletedCounts.repo_metrics_daily).toBe(3);
  });

  it("defaults counts and warnings when fields are absent", () => {
    const plan = normalizeDeletionResult({
      organization_id: "org-2",
      dry_run: false,
      timestamp: "2026-01-01T00:00:00Z",
      postgres: { total: 0, tables: {} },
      clickhouse: { total: 0, tables: {} },
      disabled_jobs: 0,
      credentials_deleted: 0,
      warnings: [],
    });
    expect(plan.deletedCounts).toEqual({});
    expect(plan.warnings).toEqual([]);
    expect(plan.disabledJobCount).toBe(0);
  });
});
