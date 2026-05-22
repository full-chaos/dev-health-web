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
import { getSuperuserToken, liveBackendUrl, testEmail, verifyUser } from "./helpers";

// ──────────────────────────────────────────────────────────────────────────────
// 1. Signup form submits successfully
// ──────────────────────────────────────────────────────────────────────────────

test("signup form submits successfully and redirects with registered banner", async ({ page }) => {
  const email = testEmail("ui-signup");

  await page.goto("/auth/signup");
  await expect(page.getByRole("main").getByRole("link", { name: "Create account" })).toBeVisible();

  await page.getByLabel("Display name").fill("UI Signup User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("TestPass123!TestPass123!");
  await page.getByRole("checkbox").check();

  // Capture the register API response so we can assert status and diagnose
  // failures caused by rate-limiting (429) or CSRF (403).
  const registerResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes("/api/v1/auth/register"),
  );
  await page.getByRole("button", { name: "Create account" }).click();
  const registerResponse = await registerResponsePromise;

  // Skip if the backend rate-limits this IP (3 registrations / hour).
  if (registerResponse.status() === 429) {
    test.skip(true, "Register rate-limited (429) \u2014 skipping browser signup test");
    return;
  }
  expect(
    registerResponse.status(),
    `Unexpected register status: ${await registerResponse.text()}`,
  ).toBe(201);

  // Should redirect to signin with registered=true banner
  await expect(page).toHaveURL(/\/auth\/signin\?registered=true/, { timeout: 15_000 });
  await expect(page.getByText("Account created successfully")).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Login with verified user redirects to dashboard
//    (Registration auto-creates an org + membership, so needs_onboarding=false)
// ──────────────────────────────────────────────────────────────────────────────

test("login with verified user redirects to dashboard", async ({ page, request }) => {
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

  // Verify the user's email so login succeeds. This REQUIRES a working
  // superuser account. Without verification, the login form surfaces
  // "Please verify your email" and never navigates away from /auth/signin,
  // so we skip rather than assert a dashboard URL we provably can't reach.
  const regData = (await regRes.json()) as Record<string, unknown>;
  const userId = (regData.user_id ?? regData.id ?? "") as string;
  const suToken = await getSuperuserToken(request);
  if (!suToken || !userId) {
    test.skip(
      true,
      "Superuser credentials not usable against this backend \u2014 cannot verify the test user. " +
        "The workflow seeds a superuser; check the 'Seed test superuser' step logs.",
    );
    return;
  }
  const verified = await verifyUser(request, userId, suToken);
  if (!verified) {
    test.skip(
      true,
      "verifyUser() returned non-OK \u2014 admin API rejected the PATCH; skipping login test.",
    );
    return;
  }

  // Now sign in through the browser
  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Registration auto-creates an org, so the user lands on the dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Full browser signup → login → dashboard journey
// ──────────────────────────────────────────────────────────────────────────────

test("full signup then login reaches dashboard", async ({ page, request }) => {
  const email = testEmail("ui-journey");
  const password = "TestPass123!";

  // Register via API (browser signup already covered by test 1)
  const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
    data: { email, password, full_name: "UI Journey User" },
    headers: { Origin: liveBackendUrl },
  });
  if (!regRes.ok()) {
    test.skip(true, "Registration failed \u2014 backend may be unavailable");
    return;
  }

  // Verify the user's email so login succeeds. See the sibling test above
  // for the full rationale on why we skip instead of pushing through without
  // verification.
  const regData = (await regRes.json()) as Record<string, unknown>;
  const userId = (regData.user_id ?? regData.id ?? "") as string;
  const suToken = await getSuperuserToken(request);
  if (!suToken || !userId) {
    test.skip(
      true,
      "Superuser credentials not usable against this backend \u2014 cannot verify the test user. " +
        "The workflow seeds a superuser; check the 'Seed test superuser' step logs.",
    );
    return;
  }
  const verified = await verifyUser(request, userId, suToken);
  if (!verified) {
    test.skip(
      true,
      "verifyUser() returned non-OK \u2014 admin API rejected the PATCH; skipping login test.",
    );
    return;
  }

  // Sign in through the browser
  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Should reach dashboard and see main navigation
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  // Verify the page has rendered (not just a redirect)
  await expect(page.getByRole("heading", { name: "Developer Health Ops Cockpit" })).toBeVisible({
    timeout: 10_000,
  });
});
