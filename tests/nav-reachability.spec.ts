import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { clickUntilUrl, waitForHydration } from "./helpers/nav";

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

  // CHAOS-2075 two-level nav: aria-current marks the current-page link (a child
  // leaf on a leaf route, the area row on a landing), so the active AREA is marked
  // with data-active instead. Assert exactly one area is active and it's the
  // expected one — rendered from usePathname(), independent of the ?f= append.
  const selectedArea = page.locator('aside a[data-active="true"]');
  await expect(selectedArea).toHaveCount(1, { timeout: 15000 });
  await expect(selectedArea).toHaveText(selectedLabel);
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

  test("reaches AI as a top-level area and routes its visible subviews", async ({
    page,
    request,
  }) => {
    // J1 (CHAOS-2080): AI is now a first-class TOP-LEVEL decision area — it no
    // longer lives as a drill-down under Improve. Reach it directly from the
    // sidebar spine, then walk only its navVisible children (areas.ts). The
    // redirect/preview AI routes (/ai/impact, /ai/attribution, /ai/test-gaps,
    // /ai/evidence, /ai/automations) are navVisible:false and surfaced solely via
    // the in-page tab strip (covered by ai-navigation.spec.ts), so they are
    // intentionally NOT sidebar destinations here.
    await page.goto("/dashboard");
    await waitForHydration(page);

    const sidebar = page.locator("aside");

    // The AI area row is a top-level sibling of Diagnose/Improve/Govern and links
    // to the /ai workspace.
    await clickUntilUrl(
      page,
      sidebar.getByRole("link", { name: "AI", exact: true }),
      /\/ai(?:[?#].*)?$/,
    );

    // The active AI area expands to exactly its navVisible children (areas.ts):
    // Overview (/ai), Review Load (/ai/review-load), Governance Risk (/ai/risk).
    const aiChildren = page.getByTestId("nav-children-ai");
    await expect(aiChildren).toBeVisible({ timeout: 15000 });

    for (const child of [
      { label: "Overview", url: /\/ai(?:[?#].*)?$/, path: "/ai" },
      {
        label: "Review Load",
        url: /\/ai\/review-load(?:[?#].*)?$/,
        path: "/ai/review-load",
      },
      {
        label: "Governance Risk",
        url: /\/ai\/risk(?:[?#].*)?$/,
        path: "/ai/risk",
      },
    ]) {
      await clickUntilUrl(
        page,
        aiChildren.getByRole("link", { name: child.label, exact: true }),
        child.url,
      );
      await expectReachable(request, child.path);
    }
  });

  test("marks exactly one area as selected for representative leaf routes", async ({ page }) => {
    for (const route of [
      { path: "/metrics?tab=dora", selectedLabel: "Diagnose" },
      { path: "/testops/coverage", selectedLabel: "Govern" },
      { path: "/testops/risk", selectedLabel: "Govern" },
      { path: "/bottleneck", selectedLabel: "Diagnose" },
      { path: "/risk/compounding", selectedLabel: "Govern" },
      // J1 (CHAOS-2080): Plan owns the /operating-review prefix, so PrimaryNav marks Plan active.
      { path: "/operating-review", selectedLabel: "Plan" },
    ]) {
      await expectSingleSelectedArea(page, route.path, route.selectedLabel);
    }
  });
});
