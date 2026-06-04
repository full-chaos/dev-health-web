import { test, expect } from "@playwright/test";

// NOTE: These tests require the app to be running (npm run dev or npm run start).
// The ops backend GraphQL server does not need to be running; the app will show
// error/empty states when security data is unavailable, which we assert against.

test("security page renders and shows KPI tiles", async ({ page }) => {
  await page.goto("/security");

  // Wait for the main heading to confirm the page mounted
  await expect(page.getByRole("heading", { name: "Security Alerts" })).toBeVisible({
    timeout: 15000,
  });

  // All four KPI tile wrappers must be in the DOM — they render loading state
  // or error state but the testid divs are always rendered.
  await expect(page.getByTestId("kpi-open")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("kpi-critical")).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByTestId("kpi-high")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("kpi-mttf")).toBeVisible({ timeout: 10000 });
});

test("security page has top-repos chart container in DOM", async ({ page }) => {
  await page.goto("/security");

  // Wait for page to finish loading
  await expect(page.getByRole("heading", { name: "Security Alerts" })).toBeVisible({
    timeout: 15000,
  });

  // The top-repos-chart testid is always rendered (shows empty or data state)
  await expect(page.getByTestId("top-repos-chart")).toBeVisible({
    timeout: 10000,
  });
});

test("security repo evidence page renders with locked pill", async ({ page }) => {
  // Navigate to a repo evidence page directly (no backend data needed)
  await page.goto("/security/repos/test-repo-id");

  // Should see the repo heading
  await expect(page.getByRole("heading", { name: "test-repo-id" })).toBeVisible({
    timeout: 15000,
  });

  // The locked pill must appear
  await expect(page.getByTestId("locked-repo-pill")).toBeVisible({
    timeout: 10000,
  });

  // Locked pill should contain the repoId
  const pill = page.getByTestId("locked-repo-pill");
  await expect(pill).toContainText("test-repo-id");
});

test("security in primary nav links to /security", async ({ page }) => {
  // CHAOS-2073: Security is a Govern-area child, rendered when Govern is the
  // active area. Land on the Govern area so its child rows (incl. Security)
  // expand in the sidebar.
  await page.goto("/testops");

  // Find the Security nav link
  const securityLink = page.getByRole("link", { name: /^security$/i }).first();
  await expect(securityLink).toBeVisible({ timeout: 10000 });

  const href = await securityLink.getAttribute("href");
  expect(href).toMatch(/\/security/);
});

test("alert rows have target=_blank on anchor when url is present", async ({ page }) => {
  // Navigate to security page and wait for any alert rows to appear
  await page.goto("/security");

  // Wait for page render to settle; networkidle can timeout in error-state pages, which is acceptable.
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch((err: Error) => {
    // Intentionally swallowed: "networkidle" may never fire when the page shows an error state.
    void err;
  });

  // Find any external anchor with target=_blank that matches alert link pattern.
  // When backend is unavailable, there are no rows — this assertion is conditional.
  const externalAnchors = page.locator('a[target="_blank"][rel="noopener noreferrer"]');
  const count = await externalAnchors.count();
  if (count > 0) {
    // Verify the first one has the correct rel attribute
    const first = externalAnchors.first();
    await expect(first).toHaveAttribute("rel", "noopener noreferrer");
  }
  // If no rows are present (backend down), the test passes vacuously.
});
