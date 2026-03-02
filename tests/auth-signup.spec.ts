import { expect, test } from "@playwright/test";

test("signup page renders registration form", async ({ page }) => {
  await page.goto("/auth/signup");

  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full Name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByLabel("Confirm Password")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Account" }),
  ).toBeVisible();
  await expect(page.getByText("Sign in")).toBeVisible();
});

test("successful registration redirects to signin with banner", async ({
  page,
}) => {
  await page.goto("/auth/signup");

  await page.getByLabel("Full Name").fill("Test User");
  await page.getByLabel("Email").fill("brand-new@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByLabel("Confirm Password").fill("password123");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page).toHaveURL(/\/auth\/signin\?registered=true/);
  await expect(page.getByText("Account created successfully")).toBeVisible();
});

test("password mismatch shows error toast", async ({ page }) => {
  await page.goto("/auth/signup");

  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByLabel("Confirm Password").fill("different123");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page.getByText("Passwords do not match")).toBeVisible({
    timeout: 10_000,
  });
});

test("password too short shows error toast", async ({ page }) => {
  await page.goto("/auth/signup");

  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password").fill("short");
  await page.getByLabel("Confirm Password").fill("short");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(
    page.getByText("Password must be at least 8 characters"),
  ).toBeVisible({ timeout: 10_000 });
});

test("duplicate email shows server error toast", async ({ page }) => {
  await page.goto("/auth/signup");

  await page.getByLabel("Email").fill("existing@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByLabel("Confirm Password").fill("password123");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page.getByText("Email already registered")).toBeVisible({
    timeout: 10_000,
  });
});

test("sign in link navigates to signin page", async ({ page }) => {
  await page.goto("/auth/signup");

  await page.getByRole("link", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/auth\/signin/);
});
