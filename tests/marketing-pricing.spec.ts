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
  test("renders all three pricing tiers", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: /simple, transparent pricing/i })
    ).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Community$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Team$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Enterprise$/ })).toBeVisible();
  });

  test("team tier is highlighted with most popular badge", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("Most Popular")).toBeVisible();
  });

  test("displays correct prices", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("Free", { exact: true })).toBeVisible();
    await expect(page.getByText("$12")).toBeVisible();
    await expect(page.getByText("Custom", { exact: true })).toBeVisible();
  });

  test("comparison table renders all features", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: /all features at a glance/i })
    ).toBeVisible();
    await expect(page.getByText("DORA Metrics")).toBeVisible();
    await expect(page.getByRole("cell", { name: "SSO / SAML" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Audit Logs" })).toBeVisible();
  });

  test("CTA buttons have correct hrefs", async ({ page }) => {
    await page.goto("/pricing");
    const getStarted = page.getByRole("link", { name: "Get started free" }).first();
    await expect(getStarted).toHaveAttribute("href", "/auth/signup");

    const contactSales = page.getByRole("link", { name: "Contact sales" });
    await expect(contactSales).toHaveAttribute("href", "mailto:sales@fullchaos.dev");
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
