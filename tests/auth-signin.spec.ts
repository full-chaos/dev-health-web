import { expect, test } from "@playwright/test";

test("/auth/signin renders login form", async ({ page }) => {
  await page.goto("/auth/signin");

  await expect(page).toHaveURL(/\/auth\/signin(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your account" }),
  ).toBeVisible();
  await expect(page.getByText("Access your Dev Health dashboard")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
});

test("/auth/signin shows post-registration banner", async ({ page }) => {
  await page.goto("/auth/signin?registered=true");

  await expect(
    page.getByText("Account created successfully. Please sign in."),
  ).toBeVisible();
});

test("/auth/signin shows error toast on failed login", async ({ page }) => {
  await page.goto("/auth/signin");

  // Fill in credentials that will fail (mock backend rejects all logins)
  await page.getByLabel("Email").fill("bad@example.com");
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: "Sign In" }).click();

  // The Toaster component must be mounted in the (auth) layout for this to appear
  await expect(
    page.getByText("Invalid email or password"),
  ).toBeVisible({ timeout: 10_000 });
});
