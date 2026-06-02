import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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

async function expectNo404(pageUrl: URL | string, request: APIRequestContext) {
  const response = await request.get(pageUrl.toString());
  expect(response.status(), `${pageUrl.toString()} should not return 404`).not.toBe(404);
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
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("exposes every primary section and reaches representative nav destinations", async ({
    page,
    request,
  }) => {
    for (const section of primarySections) {
      await expect(page.getByRole("button", { name: section })).toBeVisible();
    }

    for (const item of navLinks) {
      await resetDashboardNav(page);
      await expandSection(page, item.section);
      const link = page.getByRole("link", { name: item.name }).first();
      await expect(link, `${item.name} nav link`).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(
        new RegExp(`${item.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[?#].*)?$`),
      );
      await expectNo404(page.url(), request);
    }
  });

  test("reaches every AI tab from the unified AI Workflows area", async ({ page, request }) => {
    await resetDashboardNav(page);
    await expandSection(page, "Improve");
    await page.getByRole("link", { name: "AI Workflows" }).click();
    await expect(page).toHaveURL(/\/ai(?:[?#].*)?$/);

    for (const tab of [
      "Impact",
      "Attribution",
      "Review Load",
      "Test Gaps",
      "Governance Risk",
      "Evidence",
      "Automations",
    ]) {
      await page.getByRole("link", { name: new RegExp(`^${tab}`) }).click();
      await expect(page.getByRole("heading", { level: 1, name: tab })).toBeVisible();
      await expectNo404(page.url(), request);
    }
  });

  test("previously reachable destinations resolve without 404", async ({ page, request }) => {
    for (const destination of previouslyReachableDestinations) {
      const response = await page.goto(destination);
      expect(response?.status(), `${destination} navigation response`).not.toBe(404);
      await expectNo404(page.url(), request);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
  });
});
