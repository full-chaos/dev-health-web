import { expect, test } from "@playwright/test";

test("/auth/signin renders login form with tabs", async ({ page }) => {
  await page.goto("/auth/signin");

  await expect(page).toHaveURL(/\/auth\/signin(?:\?|$)/);
  // Tab toggle should show Sign in as active (scope to main to avoid nav "Sign in" link)
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByText("continue with email")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("/auth/signin shows post-registration banner", async ({ page }) => {
  await page.goto("/auth/signin?registered=true");

  await expect(page.getByText("Account created successfully. Please sign in.")).toBeVisible();
});

test("/auth/signin shows error toast on failed login", async ({ page }) => {
  await page.goto("/auth/signin");

  // Fill in credentials that will fail (mock backend rejects all logins)
  await page.getByLabel("Email").fill("bad@example.com");
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: "Sign in" }).click();

  // The Toaster component must be mounted in the (auth) layout for this to appear
  await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 10_000 });
});

test("/auth/signin tab navigates to signup", async ({ page }) => {
  await page.goto("/auth/signin");

  await page.getByRole("link", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/auth\/signup/);
});
