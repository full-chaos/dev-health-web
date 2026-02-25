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
  test("renders pricing page heading and plan cards", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: /plans for every stage/i })
    ).toBeVisible();
    // Dynamic page shows Team and Enterprise from fallback data
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Enterprise" })).toBeVisible();
  });

  test("displays fallback prices when API unavailable", async ({ page }) => {
    await page.goto("/pricing");
    // Team: $49/month, Enterprise: $129/month from FALLBACK_PLANS
    await expect(page.getByText("$49")).toBeVisible();
    await expect(page.getByText("$129")).toBeVisible();
  });

  test("CTA buttons link to signup", async ({ page }) => {
    await page.goto("/pricing");
    const chooseTeam = page.getByRole("link", { name: /choose team/i });
    await expect(chooseTeam).toHaveAttribute("href", "/auth/signup");
  });

  test("navigating from landing to pricing works", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/\/pricing/);
    await expect(
      page.getByRole("heading", { name: /plans for every stage/i })
    ).toBeVisible();
  });
});
