/**
 * Live onboarding UI tests — CHAOS-709
 *
 * Browser-level tests that hit the real backend (via Next.js dev server at
 * http://127.0.0.1:3002). Each test creates a real user via POST /register so
 * no SQL seeding is required.
 *
 * Run with playwright.live.config.ts (baseURL = http://127.0.0.1:3002).
 */
import { expect, test } from "@playwright/test";
import { liveBackendUrl, testEmail } from "./helpers";

// ──────────────────────────────────────────────────────────────────────────────
// 1. Signup form submits successfully
// ──────────────────────────────────────────────────────────────────────────────

test("signup form submits successfully and redirects with registered banner", async ({
  page,
  request,
}) => {
  const email = testEmail("ui-signup");

  await page.goto("/auth/signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  await page.getByLabel("Full Name").fill("UI Signup User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("TestPass123!");
  await page.getByLabel("Confirm Password").fill("TestPass123!");
  await page.getByRole("button", { name: "Create Account" }).click();

  // Should redirect to signin with registered=true banner
  await expect(page).toHaveURL(/\/auth\/signin\?registered=true/, { timeout: 15_000 });
  await expect(page.getByText("Account created successfully")).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Login with new user redirects to /auth/onboard (needs_onboarding=true)
// ──────────────────────────────────────────────────────────────────────────────

test("login with new user redirects to onboard page", async ({ page, request }) => {
  const email = testEmail("ui-login");
  const password = "TestPass123!";

  // Register via API so we start fresh
  const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
    data: { email, password, name: "UI Login User" },
  });
  if (!regRes.ok()) {
    test.skip(true, "Registration failed — backend may be unavailable");
    return;
  }

  // Now sign in through the browser
  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // New user should land on the onboard page
  await expect(page).toHaveURL(/\/auth\/onboard/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Onboard creates workspace and redirects to dashboard
// ──────────────────────────────────────────────────────────────────────────────

test("onboard creates workspace and redirects to dashboard", async ({ page, request }) => {
  const email = testEmail("ui-onboard");
  const password = "TestPass123!";

  // Register via API
  const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
    data: { email, password, name: "UI Onboard User" },
  });
  if (!regRes.ok()) {
    test.skip(true, "Registration failed — backend may be unavailable");
    return;
  }

  // Sign in through the browser
  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Should land on onboard
  await expect(page).toHaveURL(/\/auth\/onboard/, { timeout: 15_000 });

  // Fill org name and submit
  await page.getByLabel("Organization Name").fill("Live UI Org");
  await page.getByRole("button", { name: "Create Workspace" }).click();

  // Should redirect to dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});
