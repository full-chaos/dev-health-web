import { test, expect } from "@playwright/test";

test.describe("Marketing landing page", () => {
  test("renders hero section with key headings", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /where is your engineering effort/i,
      })
    ).toBeVisible();
    await expect(page.getByText("Engineering effort analytics")).toBeVisible();
  });

  test("nav contains pricing link", async ({ page }) => {
    await page.goto("/");
    const pricingLink = page.getByRole("navigation").getByRole("link", { name: "Pricing" });
    await expect(pricingLink).toBeVisible();
    await expect(pricingLink).toHaveAttribute("href", "/pricing");
  });

  test("features section renders all five capabilities", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Signals, not surveillance")).toBeVisible();
    await expect(page.getByText("Investment View")).toBeVisible();
    await expect(page.getByText("Flow Metrics")).toBeVisible();
    await expect(page.getByText("DORA Dashboard")).toBeVisible();
    await expect(page.getByText("Quadrant Explorer")).toBeVisible();
    await expect(page.getByText("Developer Health", { exact: true })).toBeVisible();
  });

  test("personas section renders all four roles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("One platform, four perspectives")).toBeVisible();
    await expect(page.getByText("Individual Contributor")).toBeVisible();
    await expect(page.getByText("Engineering Manager")).toBeVisible();
    await expect(page.getByText("Product Manager")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Leadership" })).toBeVisible();
  });
});

test.describe("Pricing page", () => {
  test("renders pricing page heading and all three tiers", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: /simple, transparent pricing/i })
    ).toBeVisible();
    // All three tiers visible
    await expect(page.getByText("Community")).toBeVisible();
    await expect(page.getByText("Team")).toBeVisible();
    await expect(page.getByText("Enterprise")).toBeVisible();
  });

  test("displays dynamic prices from billing API", async ({ page }) => {
    await page.goto("/pricing");
    // Mock server returns Team=$49 (4900 cents) and Enterprise=$129 (12900 cents)
    await expect(page.getByText("$49")).toBeVisible();
    await expect(page.getByText("$129")).toBeVisible();
    // Community is always free
    await expect(page.getByText("Free")).toBeVisible();
  });

  test("shows comparison table", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("Compare plans")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /all features at a glance/i })
    ).toBeVisible();
  });

  test("CTA buttons link to signup", async ({ page }) => {
    await page.goto("/pricing");
    const startTrial = page.getByRole("link", { name: /start free trial/i });
    await expect(startTrial).toHaveAttribute("href", "/auth/signup");
  });

  test("bottom CTA section is visible", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: /ready to understand your engineering effort/i })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /get started free/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /talk to sales/i })).toBeVisible();
  });

  test("navigating from landing to pricing works", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/\/pricing/);
    await expect(
      page.getByRole("heading", { name: /simple, transparent pricing/i })
    ).toBeVisible();
  });
});
