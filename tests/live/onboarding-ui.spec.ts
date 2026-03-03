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
import { getSuperuserToken, liveBackendUrl, testEmail, verifyUser, authHeaders } from "./helpers";

// ──────────────────────────────────────────────────────────────────────────────
// 1. Signup form submits successfully
// ──────────────────────────────────────────────────────────────────────────────

test("signup form submits successfully and redirects with registered banner", async ({
  page,
  request,
}) => {
  const email = testEmail("ui-signup");

  // Capture the register API response to diagnose failures
  const registerResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes("/api/v1/auth/register"),
  );

  await page.goto("/auth/signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  await page.getByLabel("Full Name").fill("UI Signup User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("TestPass123!");
  await page.getByLabel("Confirm Password").fill("TestPass123!");
  await page.getByRole("button", { name: "Create Account" }).click();

  // Wait for the register API response and log it for debugging
  const registerResponse = await registerResponsePromise;
  const status = registerResponse.status();
  const body = await registerResponse.text();
  // eslint-disable-next-line no-console
  console.log(`[signup-debug] POST /register status=${status} body=${body}`);
  expect(status, `Register API returned ${status}: ${body}`).toBe(201);

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
    data: { email, password, full_name: "UI Login User" },
    headers: { Origin: liveBackendUrl },
  });
  if (!regRes.ok()) {
    test.skip(true, "Registration failed \u2014 backend may be unavailable");
    return;
  }

  // Verify the user's email so login succeeds
  const regData = (await regRes.json()) as Record<string, unknown>;
  const userId = (regData.user_id ?? regData.id ?? "") as string;
  const suToken = await getSuperuserToken(request);
  if (suToken && userId) await verifyUser(request, userId, suToken);

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
    data: { email, password, full_name: "UI Onboard User" },
    headers: { Origin: liveBackendUrl },
  });
  if (!regRes.ok()) {
    test.skip(true, "Registration failed \u2014 backend may be unavailable");
    return;
  }

  // Verify the user's email so login succeeds
  const regData = (await regRes.json()) as Record<string, unknown>;
  const userId = (regData.user_id ?? regData.id ?? "") as string;
  const suToken = await getSuperuserToken(request);
  if (suToken && userId) await verifyUser(request, userId, suToken);

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
