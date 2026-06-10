import { test, expect } from "@playwright/test";

import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { encodeFilter } from "../src/lib/filters/encode";

/**
 * CHAOS-1588: AI Impact dashboard e2e.
 *
 * Drives the empty / missing-data / populated UX states via the AIFilter
 * scope (the MSW handler keys mode off `scope.teamId`).
 */

const populatedFilter = encodeFilter({
    ...defaultMetricFilter,
    time: { range_days: 30, compare_days: 30 },
});

const missingDataFilter = encodeFilter({
    ...defaultMetricFilter,
    scope: { level: "team", ids: ["team-missing"] },
    time: { range_days: 30, compare_days: 30 },
});

test.describe("AI Impact dashboard", () => {
    test("populated state renders the spec panels", async ({ page }) => {
        await page.goto(`/ai/impact?f=${populatedFilter}`);

        await expect(page.getByRole("heading", { name: "Impact", exact: true })).toBeVisible();
        await expect(page.getByTestId("ai-impact-dashboard")).toBeVisible();

        // Spec panels (CHAOS-1584). Three panels (AI-assisted/Agent-created/Net
        // delivery lift) appear twice in the populated layout — once as the
        // eyebrow on a headline card and once as the heading on the matching
        // detailed panel — so we scope to the panel heading specifically.
        const dashboard = page.getByTestId("ai-impact-dashboard");
        await expect(
            dashboard.getByRole("heading", {
                name: "AI-assisted work share",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            dashboard.getByRole("heading", {
                name: "Agent-created work share",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            dashboard.getByRole("heading", {
                name: "Net delivery lift",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            dashboard.getByRole("heading", {
                name: "Review amplification",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            dashboard.getByRole("heading", { name: "Rework drag", exact: true }),
        ).toBeVisible();
        await expect(
            dashboard.getByRole("heading", { name: "Test gap rate", exact: true }),
        ).toBeVisible();
        await expect(
            dashboard.getByRole("heading", {
                name: "Revert + incident drag",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            dashboard.getByRole("heading", {
                name: "Top affected repos and teams",
                exact: true,
            }),
        ).toBeVisible();
        // CHAOS-2186: populated breakdowns render ranked rollups + evidence link.
        await expect(dashboard.getByTestId("ai-impact-breakdown")).toBeVisible();
        await expect(dashboard.getByRole("link", { name: /Open evidence/ })).toBeVisible();
        await expect(
            dashboard.getByRole("heading", {
                name: "Best-fit automation opportunities",
                exact: true,
            }),
        ).toBeVisible();

        // Unknown attribution bucket must remain visible (data coverage transparency).
        await expect(dashboard.getByText("Unknown attribution")).toBeVisible();
    });

    test("missing-data state shows honest empty messaging", async ({ page }) => {
        await page.goto(`/ai/impact?f=${missingDataFilter}`);

        await expect(page.getByRole("heading", { name: "Impact", exact: true })).toBeVisible();
        await expect(page.getByText("AI workflow data has not populated yet")).toBeVisible();
        await expect(page.getByText(/Connect a GitHub provider/i)).toBeVisible();
    });

    test("no individual-ranking framing in copy", async ({ page }) => {
        await page.goto(`/ai/impact?f=${populatedFilter}`);

        // Surveillance guardrail: page copy talks about org-level system health,
        // never per-author scoring. Probe for common ranking framings — none
        // should appear.
        await expect(page.locator("text=/individual ranking/i")).toHaveCount(0);
        await expect(page.locator("text=/leaderboard/i")).toHaveCount(0);
        await expect(page.locator("text=/productivity score/i")).toHaveCount(0);
        await expect(page.locator("text=/per author/i")).toHaveCount(0);
    });
});
