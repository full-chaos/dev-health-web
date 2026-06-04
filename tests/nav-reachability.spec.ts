import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { clickUntilHeading, clickUntilUrl, waitForHydration } from "./helpers/nav";

// CHAOS-2073: the sidebar collapsed to exactly six decision-area links; leaf
// destinations moved off the sidebar into area-landing drill-downs (AreaHub).
const primaryAreas = [
  { label: "Cockpit", path: "/dashboard" },
  { label: "Diagnose", path: "/work" },
  { label: "Improve", path: "/opportunities" },
  { label: "Govern", path: "/testops" },
  { label: "Reports", path: "/reports" },
  { label: "Admin", path: "/admin" },
] as const;

// Leaf labels that must NOT appear as flat sidebar rows anymore.
const collapsedLeafLabels = [
  "Metrics",
  "People",
  "Code",
  "Complexity",
  "Cognitive Load",
  "Bottlenecks",
  "Operating Review",
  "Capacity Planning",
  "AI Workflows",
  "Pipelines",
  "Tests",
  "Quality",
  "Coverage",
  "Delivery Risk",
  "Incident Correlation",
  "Security",
  "Feature Flags",
  "Compounding Risk",
  "Report Center",
] as const;

// Every destination that used to be a sidebar leaf must still resolve (no 404),
// reachable via its area landing + drill-down. Routes are unchanged by CHAOS-2073.
const reachableRoutes = [
  "/dashboard",
  "/operating-review",
  "/work",
  "/metrics",
  "/people",
  "/code",
  "/explore/landscape",
  "/complexity",
  "/cognitive-load",
  "/bottleneck",
  "/opportunities",
  "/capacity-planning",
  "/ai",
  "/ai/impact",
  "/ai/attribution",
  "/ai/review-load",
  "/ai/test-gaps",
  "/ai/risk",
  "/ai/evidence",
  "/ai/automations",
  "/testops",
  "/testops/pipelines",
  "/testops/tests",
  "/testops/coverage",
  "/testops/risk",
  "/quality",
  "/security",
  "/feature-flags",
  "/incident-correlation",
  "/risk/compounding",
  "/reports",
  "/admin",
] as const;

/**
 * Reachability is asserted over the authenticated HTTP request context rather than
 * by browser-navigating to each route. Browser-navigating ~30 chart-heavy pages in a
 * single spec wedged the dev server under CI's constrained runners (net::ERR_ABORTED /
 * "[WebServer] Error: aborted"); an SSR status check is the right weight for "is this
 * route reachable / not a 404". Retries absorb transient dev-server aborts under load.
 */
async function expectReachable(request: APIRequestContext, path: string) {
  await expect(async () => {
    const response = await request.get(path);
    const status = response.status();
    expect(status, `${path} returned ${status}`).not.toBe(404);
    expect(status, `${path} returned ${status}`).toBeLessThan(500);
  }).toPass({ timeout: 30000, intervals: [500, 1000, 2000] });
}

async function expectSingleSelectedArea(page: Page, path: string, selectedLabel: string) {
  await page.goto(path);

  // aria-current is rendered from usePathname() (server + hydration) and does not
  // depend on the slower ?f= filter-param append, so wait for the selected link
  // directly to stay robust under CI load.
  const selectedLinks = page.locator('aside a[aria-current="page"]');
  await expect(selectedLinks).toHaveCount(1, { timeout: 15000 });
  await expect(selectedLinks).toHaveText(selectedLabel);
}

test.describe("primary navigation reachability (collapsed areas — CHAOS-2073)", () => {
  test("sidebar surfaces exactly the six decision areas as links, no leaf rows", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await waitForHydration(page);

    const aside = page.locator("aside");

    for (const area of primaryAreas) {
      await expect(aside.getByRole("link", { name: area.label, exact: true })).toHaveAttribute(
        "href",
        new RegExp(`${area.path}(?:[?#].*)?`),
      );
    }

    // Leaf destinations are no longer enumerated flat in the sidebar.
    for (const leaf of collapsedLeafLabels) {
      await expect(aside.getByRole("link", { name: leaf, exact: true })).toHaveCount(0);
    }
  });

  test("every former leaf destination still resolves without 404", async ({ request }) => {
    // ~30 sequential SSR reachability fetches; Turbopack cold-compiles each route
    // on first hit under suite load, which overruns the default 30s test budget.
    test.setTimeout(120_000);
    for (const route of reachableRoutes) {
      await expectReachable(request, route);
    }
  });

  test("reaches every AI tab from the Improve area landing drill-down", async ({
    page,
    request,
  }) => {
    await page.goto("/opportunities");

    // AI Workflows now lives in the Improve area's drill-down hub, not the sidebar.
    // AreaHub renders aria-label="${area.label} signals" → "Improve signals".
    // The hub is server-rendered, so wait for it directly: CHAOS-2073 area-overview
    // pages don't append the ?f= hydration marker waitForHydration relies on.
    const improveHub = page.getByRole("region", {
      name: "Improve signals",
    });
    await expect(improveHub).toBeVisible({ timeout: 15000 });
    await clickUntilUrl(
      page,
      improveHub.getByRole("link", { name: /AI Workflows/ }),
      /\/ai(?:[?#].*)?$/,
    );

    for (const tab of [
      "Impact",
      "Attribution",
      "Review Load",
      "Test Gaps",
      "Governance Risk",
      "Evidence",
      "Automations",
    ]) {
      await clickUntilHeading(
        page,
        page.getByRole("link", { name: new RegExp(`^${tab}`) }),
        page.getByRole("heading", { level: 2, name: tab }),
      );
      await expectReachable(request, new URL(page.url()).pathname);
    }
  });

  test("marks exactly one area as selected for representative leaf routes", async ({ page }) => {
    for (const route of [
      { path: "/metrics?tab=dora", selectedLabel: "Diagnose" },
      { path: "/testops/coverage", selectedLabel: "Govern" },
      { path: "/testops/risk", selectedLabel: "Govern" },
      { path: "/bottleneck", selectedLabel: "Diagnose" },
      { path: "/risk/compounding", selectedLabel: "Govern" },
      // Operating Review moved Cockpit → Improve (CHAOS-2075); PrimaryNav marks Improve active.
      { path: "/operating-review", selectedLabel: "Improve" },
    ]) {
      await expectSingleSelectedArea(page, route.path, route.selectedLabel);
    }
  });
});
