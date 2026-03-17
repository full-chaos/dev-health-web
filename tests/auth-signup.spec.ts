import { expect, test } from "@playwright/test";

test("signup page renders registration form with tabs", async ({ page }) => {
  await page.goto("/auth/signup");

  // Tab toggle should show Create account as active (scope to main to avoid nav "Sign in" link)
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByText("continue with email")).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeVisible();
});

test("signup shows password strength indicator", async ({ page }) => {
  await page.goto("/auth/signup");

  await page.getByLabel("Password").fill("weak");
  await expect(page.getByText("Password strength")).toBeVisible();
  await expect(page.getByText("Weak")).toBeVisible();

  await page.getByLabel("Password").fill("StrongPass123!");
  await expect(page.getByText("Strong")).toBeVisible();
});

test("successful registration redirects to signin with banner", async ({
  page,
}) => {
  await page.goto("/auth/signup");

  await page.getByLabel("Display name").fill("Test User");
  await page.getByLabel("Email").fill("brand-new@example.com");
  await page.getByLabel("Password").fill("SecurePass123!");
  // Accept terms
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/auth\/signin\?registered=true/);
  await expect(page.getByText("Account created successfully")).toBeVisible();
});

test("terms checkbox required to submit", async ({ page }) => {
  await page.goto("/auth/signup");

  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password").fill("SecurePass123!");
  // Don't check terms — button should be disabled
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
});

test("password too short shows error toast", async ({ page }) => {
  await page.goto("/auth/signup");

  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("checkbox").check();
  await page.evaluate(() =>
    document.querySelector("form")?.setAttribute("novalidate", ""),
  );
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByText("Password must be at least 12 characters"),
  ).toBeVisible({ timeout: 10_000 });
});

test("duplicate email shows server error toast", async ({ page }) => {
  await page.goto("/auth/signup");

  await page.getByLabel("Email").fill("existing@example.com");
  await page.getByLabel("Password").fill("SecurePass123!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Email already registered")).toBeVisible({
    timeout: 10_000,
  });
});

test("sign in tab navigates to signin page", async ({ page }) => {
  await page.goto("/auth/signup");

  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/auth\/signin/);
});
