/**
 * E2E tests for the forgot-password flow.
 *
 * CHAOS-1769: An authenticated user who clicks "Back to Sign in" after submitting
 * the forgot-password form was being silently redirected to /dashboard instead of
 * seeing the sign-in form.
 *
 * Fix (option b): The "Back to Sign in" link in the success state navigates to
 * /auth/signin?from=reset.  The signin page skips its session-based auto-redirect
 * when ?from=reset is present, so authenticated users see the login form instead
 * of being bounced to /dashboard.
 *
 * These tests run under the `authenticated` Playwright project (storage state
 * already injected) so we start each test as a logged-in user — the exact
 * scenario that triggered the bug.
 */
import { expect, test } from "@playwright/test";

test("forgot-password page is accessible while authenticated", async ({ page }) => {
  await page.goto("/auth/forgot-password");

  await expect(page).toHaveURL(/\/auth\/forgot-password/);
  await expect(page.getByRole("heading", { name: /forgot your password/i })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
});

/**
 * CHAOS-1769 regression test.
 *
 * Flow: authenticated user → forgot-password → submit reset-email → success banner
 *       → click "Back to Sign in" → land on /auth/signin?from=reset (NOT /dashboard).
 *
 * The ?from=reset param instructs signin/page.tsx to skip the authenticated-user
 * redirect so the login form is always rendered after a password-reset flow.
 */
test("forgot-password: Back to Sign in after submit lands on sign-in form, not /dashboard (CHAOS-1769)", async ({ page }) => {
  // 1. Navigate to forgot-password (starting from authenticated state)
  await page.goto("/auth/forgot-password");
  await expect(page).toHaveURL(/\/auth\/forgot-password/);

  // 2. Fill and submit the reset-email form
  await page.getByLabel("Email address").fill("test@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();

  // 3. Success banner must appear.
  await expect(
    page.getByText("If an account exists with that email, a password reset link has been sent."),
  ).toBeVisible({ timeout: 10_000 });

  // 4. Click "Back to Sign in"
  await page.getByRole("link", { name: "Back to Sign in" }).click();

  // 5. Must land on /auth/signin?from=reset — NOT /dashboard.
  //    The ?from=reset param prevents the authenticated-user redirect in signin/page.tsx.
  await expect(page).toHaveURL(/\/auth\/signin\?from=reset/, { timeout: 10_000 });

  // 6. Sign-in form must be visible (confirms no dashboard redirect).
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible({ timeout: 10_000 });
});

test("forgot-password: Remember your password link navigates to sign-in", async ({ page }) => {
  await page.goto("/auth/forgot-password");

  await page.getByRole("link", { name: "Remember your password?" }).click();

  await expect(page).toHaveURL(/\/auth\/signin/);
});
