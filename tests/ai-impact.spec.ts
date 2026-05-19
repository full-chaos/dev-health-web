import { test, expect } from "@playwright/test";

import { encodeAIFilterParam } from "../src/lib/filters/ai";

/**
 * CHAOS-1588: AI Impact dashboard e2e.
 *
 * Drives the empty / missing-data / populated UX states via the AIFilter
 * scope (the MSW handler keys mode off `scope.teamId`).
 */

const populatedFilter = encodeAIFilterParam({
  startDate: "2026-04-20",
  endDate: "2026-05-19",
});

const missingDataFilter = encodeAIFilterParam({
  startDate: "2026-04-20",
  endDate: "2026-05-19",
  teamId: "team-missing",
});

test.describe("AI Impact dashboard", () => {
  test("populated state renders the spec panels", async ({ page }) => {
    await page.goto(`/ai/impact?f=${populatedFilter}`);

    await expect(page.getByRole("heading", { name: "AI Impact" })).toBeVisible();
    await expect(page.getByTestId("ai-impact-dashboard")).toBeVisible();

    // Spec panels (CHAOS-1584).
    const dashboard = page.getByTestId("ai-impact-dashboard");
    await expect(dashboard.getByText("AI-assisted work share")).toBeVisible();
    await expect(dashboard.getByText("Agent-created work share")).toBeVisible();
    await expect(dashboard.getByText("Net delivery lift")).toBeVisible();
    await expect(dashboard.getByText("Review amplification")).toBeVisible();
    await expect(dashboard.getByText("Rework drag")).toBeVisible();
    await expect(dashboard.getByText("Test gap rate")).toBeVisible();
    await expect(dashboard.getByText("Revert + incident drag")).toBeVisible();
    await expect(dashboard.getByText("Top affected repos and teams")).toBeVisible();
    await expect(dashboard.getByText("Best-fit automation opportunities")).toBeVisible();

    // Unknown attribution bucket must remain visible (data coverage transparency).
    await expect(dashboard.getByText("Unknown attribution")).toBeVisible();
  });

  test("missing-data state shows honest empty messaging", async ({ page }) => {
    await page.goto(`/ai/impact?f=${missingDataFilter}`);

    await expect(page.getByRole("heading", { name: "AI Impact" })).toBeVisible();
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
