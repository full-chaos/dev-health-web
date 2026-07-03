import { expect, test } from "@playwright/test";

import { decodeFilter, encodeFilter } from "../src/lib/filters/encode";
import type { MetricFilter } from "../src/lib/filters/types";

/**
 * CHAOS-1642: Compounding Risk surface e2e.
 *
 * Drives the page against the MSW handler (sample mode). Verifies:
 *
 * - Authenticated page renders with the canonical heading and dashboard.
 * - Headline score, severity chip, component bars, audit-trail copy, and
 *   the per-scope table are all populated from the GraphQL row.
 * - Work Graph drilldown links carry the scope + id query params.
 * - Person/developer scope triggers the guardrail banner instead of a
 *   developer breakdown (no-surveillance contract).
 */

const teamFilter: MetricFilter = {
    scope: { level: "team", ids: ["team-platform"] },
    who: null,
    what: null,
    why: null,
    how: null,
    dateRange: { startDate: "2026-04-20", endDate: "2026-05-20" },
};
const developerFilter: MetricFilter = {
    ...teamFilter,
    scope: { level: "developer", ids: ["user-x"] },
};

test.describe("Compounding Risk surface", () => {
    test("populated repo view renders score, severity, components, and drilldown", async ({
        page,
    }) => {
        await page.goto(`/risk/compounding?f=${encodeFilter(teamFilter)}`);

        await expect(
            page.getByRole("heading", {
                name: "Where change pressure is compounding risk.",
            }),
        ).toBeVisible();
        const dashboard = page.getByTestId("compounding-risk-dashboard");
        await expect(dashboard).toBeVisible();

        // Headline reflects the persisted score, not 0 or 1.
        await expect(page.getByTestId("headline-score")).toHaveText("0.71");
        const chips = page.getByTestId("severity-chip");
        await expect(chips.first()).toHaveAttribute("data-severity", "high");

        // Component bars present for all four contributions.
        await expect(page.getByTestId("component-churn")).toBeVisible();
        await expect(page.getByTestId("component-complexity")).toBeVisible();
        await expect(page.getByTestId("component-ownership")).toBeVisible();
        await expect(page.getByTestId("component-review-latency")).toBeVisible();

        // Audit-trail copy surfaces the persisted thresholds.
        await expect(page.getByText(/elevated ≥ 0\.40/i)).toBeVisible();
        await expect(page.getByText(/high ≥ 0\.65/i)).toBeVisible();

        // Table renders one row per repo, sorted by score desc.
        const rows = page.getByTestId("risk-row");
        await expect(rows).toHaveCount(3);
        await expect(rows.first()).toHaveAttribute("data-scope-id", "repo-a");
        await expect(rows.first()).toHaveAttribute("data-severity", "high");

        // Drilldown link encodes the scope directly for /diagnose/work-graph
        // (CHAOS-2851) instead of the lossy /work?risk_scope_* redirect.
        const drilldown = page.getByTestId("open-in-work-graph").first();
        const drilldownHref = await drilldown.getAttribute("href");
        expect(drilldownHref).toMatch(/^\/diagnose\/work-graph\?f=/);
        const drilldownFilters = decodeFilter(
            new URL(drilldownHref ?? "", "http://localhost").searchParams.get("f"),
        );
        expect(drilldownFilters.scope).toEqual({ level: "repo", ids: ["repo-a"] });
        expect(drilldownFilters.what.repos).toEqual(["repo-a"]);
    });

    test("team-scope rows show a disabled Work Graph indicator, not an active link", async ({
        page,
    }) => {
        // Work Graph only supports repo-scoped edge filtering (no persisted
        // team\u2192repo resolution client-side), so team-breakout rows must not
        // link to an unscoped/misleading "global" graph (CHAOS-2851).
        await page.goto(`/risk/compounding?f=${encodeFilter(teamFilter)}&breakout=team`);

        await expect(page.getByTestId("compounding-risk-dashboard")).toBeVisible();
        await expect(page.getByTestId("open-in-work-graph")).toHaveCount(0);
        await expect(page.getByTestId("work-graph-drilldown-unavailable")).toBeVisible();
    });

    test("person scope is blocked with the no-surveillance guardrail", async ({ page }) => {
        await page.goto(`/risk/compounding?f=${encodeFilter(developerFilter)}`);

        await expect(page.getByTestId("developer-scope-guardrail")).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: "Compounding Risk is a team and repo signal.",
            }),
        ).toBeVisible();
        // Dashboard must NOT render for developer scope.
        await expect(page.getByTestId("compounding-risk-dashboard")).toHaveCount(0);
    });
});
