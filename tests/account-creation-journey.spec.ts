import { expect, test } from "@playwright/test";

test.describe("Account creation journey", () => {
  test("1. user signs up and sees post-registration banner", async ({ page }) => {
    await page.goto("/auth/signup");
    await page.getByLabel("Full Name").fill("Journey User");
    await page.getByLabel("Email").fill("journey@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByLabel("Confirm Password").fill("password123");
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/auth\/signin\?registered=true/, { timeout: 10_000 });
    await expect(page.getByText("Account created successfully")).toBeVisible();
  });

  test("2. user signs in as newuser and lands on onboard page", async ({ page }) => {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill("newuser@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/auth\/onboard/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  });

  test("3. user creates workspace and lands on dashboard", async ({ page }) => {
    await page.goto("/auth/onboard");
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill("newuser@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/auth\/onboard/, { timeout: 10_000 });

    await page.getByLabel("Organization Name").fill("Journey Corp");
    await page.getByRole("button", { name: "Create Workspace" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test("4. user navigates to integrations and adds GitHub", async ({ page }) => {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 10_000 });

    await page.goto("/admin/integrations/github");
    await page.locator("#github-token").fill("ghp_journey_token");
    await page.locator("#github-org").fill("journey-org");
    await page.locator("#github-repos").fill("repo1,repo2");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Settings saved successfully")).toBeVisible({ timeout: 10_000 });
  });

  test("5. user creates a sync config", async ({ page }) => {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 10_000 });

    await page.goto("/admin/sync/new");
    await page.locator("#name").fill("Journey Sync");

    const providerSelect = page.locator("#provider");
    if (await providerSelect.isVisible()) {
      await providerSelect.selectOption("github");
    }

    await page.getByRole("button", { name: /submit|save|create/i }).click();
    await expect(page).toHaveURL(/\/admin\/sync$/, { timeout: 10_000 });
  });

  test("6. user creates a team", async ({ page }) => {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 10_000 });

    await page.goto("/admin/teams/new");
    await page.locator("#team_id").fill("journey-team");
    await page.locator("#name").fill("Journey Team");
    await page.getByRole("button", { name: "Create Team" }).click();
    await expect(page).toHaveURL(/\/admin\/teams(?!\/new)/, { timeout: 10_000 });
  });

  test("7. user creates an identity", async ({ page }) => {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 10_000 });

    await page.goto("/admin/identities/new");
    await page.locator("#canonical_id").fill("journey-person");
    await page.locator("#display_name").fill("Journey Person");
    await page.locator("#email").fill("journey@example.com");
    await page.getByRole("button", { name: /create|save/i }).click();
    await expect(page).toHaveURL(/\/admin\/identities(?!\/new)/, { timeout: 10_000 });
  });
});
