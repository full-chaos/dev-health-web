import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { clickUntilHeading, clickUntilUrl, waitForHydration } from "./helpers/nav";

const primarySections = ["Cockpit", "Diagnose", "Improve", "Govern", "Reports", "Admin"];

const navLinks = [
  { section: "Cockpit", name: "Home", path: "/dashboard" },
  { section: "Cockpit", name: "Operating Review", path: "/operating-review" },
  { section: "Diagnose", name: "Work", path: "/work" },
  { section: "Diagnose", name: "Metrics", path: "/metrics" },
  { section: "Diagnose", name: "People", path: "/people" },
  { section: "Diagnose", name: "Code", path: "/code" },
  { section: "Improve", name: "Opportunities", path: "/opportunities" },
  { section: "Improve", name: "Capacity Planning", path: "/capacity-planning" },
  { section: "Improve", name: "AI Workflows", path: "/ai" },
  { section: "Govern", name: "TestOps", path: "/testops" },
  { section: "Govern", name: "Quality", path: "/quality" },
  { section: "Govern", name: "Security", path: "/security" },
  { section: "Govern", name: "Feature Flags", path: "/feature-flags" },
  {
    section: "Govern",
    name: "Incident Correlation",
    path: "/incident-correlation",
  },
  { section: "Reports", name: "Report Center", path: "/reports" },
  { section: "Admin", name: "Settings", path: "/admin" },
] as const;

const previouslyReachableDestinations = [
  "/work",
  "/metrics",
  "/people",
  "/code",
  "/testops",
  "/testops/pipelines",
  "/testops/tests",
  "/testops/coverage",
  "/testops/risk",
  "/security",
  "/quality",
  "/feature-flags",
  "/incident-correlation",
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
] as const;

/**
 * Reachability is asserted over the authenticated HTTP request context rather than
 * by browser-navigating to each route. Browser-navigating ~40 chart-heavy pages in a
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

async function resetDashboardNav(page: Page) {
  await page.goto("/dashboard");
  await page.evaluate(() => localStorage.removeItem("devhealth-nav-collapsed"));
  await page.goto("/dashboard");
}

async function expandSection(page: Page, section: string) {
  if (section === "Cockpit") return;
  await page.getByRole("button", { name: section }).click();
}

test.describe("primary navigation reachability", () => {
  test("exposes every primary section and reaches representative nav destinations", async ({
    page,
    request,
  }) => {
    // Wait for client hydration before interacting (the app appends ?f= once JS runs).
    await page.goto("/dashboard");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("f"), {
      timeout: 15000,
    });

    for (const section of primarySections) {
      await expect(page.getByRole("button", { name: section })).toBeVisible();
    }

    for (const item of navLinks) {
      await expectReachable(request, item.path);
    }
  });

  test("reaches every AI tab from the unified AI Workflows area", async ({ page, request }) => {
    await resetDashboardNav(page);
    await waitForHydration(page);
    await expandSection(page, "Improve");

    await clickUntilUrl(page, page.getByRole("link", { name: "AI Workflows" }), /\/ai(?:[?#].*)?$/);

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
        page.getByRole("heading", { level: 1, name: tab }),
      );
      await expectReachable(request, new URL(page.url()).pathname);
    }
  });

  test("previously reachable destinations resolve without 404", async ({ request }) => {
    for (const destination of previouslyReachableDestinations) {
      await expectReachable(request, destination);
    }
  });
});
