import { test, expect } from "@playwright/test";

test.describe("Marketing landing page", () => {
    test("renders hero section with key headings", async ({ page }) => {
        await page.goto("/");
        await expect(
            page.getByRole("heading", {
                name: /where is your engineering effort/i,
            }),
        ).toBeVisible();
        await expect(page.getByText("Engineering effort analytics")).toBeVisible();
    });

    test("nav contains pricing link", async ({ page }) => {
        await page.goto("/");
        const pricingLink = page.getByRole("navigation").getByRole("link", { name: "Pricing" });
        await expect(pricingLink).toBeVisible();
        await expect(pricingLink).toHaveAttribute("href", "/marketing/pricing");
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
        await expect(page.getByRole("heading", { name: "Individual Contributor" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Engineering Manager" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Product Manager" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Leadership" })).toBeVisible();
    });
});

test.describe("Pricing page", () => {
    test("renders pricing page heading and all three tiers", async ({ page }) => {
        await page.goto("/marketing/pricing");
        await expect(
            page.getByRole("heading", { name: /simple, transparent pricing/i }),
        ).toBeVisible();
        // All three tiers visible (scoped to tier card section to avoid comparison table duplicates)
        const tierCards = page
            .locator("section")
            .filter({ has: page.locator(".grid.sm\\:grid-cols-3") });
        await expect(tierCards.getByText("Community").first()).toBeVisible();
        await expect(tierCards.getByText("Team").first()).toBeVisible();
        await expect(tierCards.getByText("Enterprise").first()).toBeVisible();
    });

    test("displays dynamic prices from billing API", async ({ page }) => {
        await page.goto("/marketing/pricing");
        // Mock server returns Team=$49 (4900 cents) and Enterprise=$129 (12900 cents)
        await expect(page.getByText("$49").first()).toBeVisible();
        await expect(page.getByText("$129").first()).toBeVisible();
        // Community is always free (use first() since 'Free' appears in multiple places)
        await expect(page.getByText("Free").first()).toBeVisible();
    });

    test("shows comparison table", async ({ page }) => {
        await page.goto("/marketing/pricing");
        await expect(page.getByText("Compare plans")).toBeVisible();
        await expect(
            page.getByRole("heading", { name: /all features at a glance/i }),
        ).toBeVisible();
    });

    test("CTA buttons link to signup", async ({ page }) => {
        await page.goto("/marketing/pricing");
        const startTrial = page.getByRole("link", { name: /start free trial/i });
        await expect(startTrial).toHaveAttribute("href", "/auth/signup?plan=team&trial=true");
    });

    test("bottom CTA section is visible", async ({ page }) => {
        await page.goto("/marketing/pricing");
        await expect(
            page.getByRole("heading", { name: /ready to understand your engineering effort/i }),
        ).toBeVisible();
        await expect(page.getByRole("link", { name: /get started free/i }).last()).toBeVisible();
        await expect(page.getByRole("link", { name: /talk to sales/i })).toBeVisible();
    });

    test("navigating from landing to pricing works", async ({ page }) => {
        await page.goto("/");
        await page.getByRole("navigation").getByRole("link", { name: "Pricing" }).click();
        await expect(page).toHaveURL(/\/pricing/);
        await expect(
            page.getByRole("heading", { name: /simple, transparent pricing/i }),
        ).toBeVisible();
    });
});
