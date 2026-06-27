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
    await expect(
        page.getByRole("main").getByRole("link", { name: "Create account" }),
    ).toBeVisible();

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
// 2. A fresh verified user is ORGLESS and lands on onboarding, not the dashboard
//    (registration does NOT silently create a workspace — needs_onboarding=true)
// ──────────────────────────────────────────────────────────────────────────────

test("fresh verified user lands on onboarding, not the dashboard", async ({ page, request }) => {
    const email = testEmail("ui-onboard");
    const password = "TestPass123!";

    // Register via API so we start fresh.
    const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
        data: { email, password, full_name: "UI Onboard User" },
        headers: { Origin: liveBackendUrl },
    });
    if (!regRes.ok()) {
        test.skip(true, "Registration failed \u2014 backend may be unavailable");
        return;
    }

    // Verify the email so login succeeds. Requires the seeded superuser admin,
    // which is kept distinct from this orgless test user.
    const regData = (await regRes.json()) as Record<string, unknown>;
    const userId = (regData.user_id ?? regData.id ?? "") as string;
    const suToken = await getSuperuserToken(request);
    if (!suToken || !userId) {
        test.skip(true, "Superuser credentials not usable \u2014 cannot verify the test user");
        return;
    }
    const verified = await verifyUser(request, userId, suToken);
    if (!verified) {
        test.skip(true, "verifyUser() returned non-OK \u2014 skipping onboarding redirect test");
        return;
    }

    // Sign in through the browser. An orgless user must be routed into the
    // onboarding flow — never straight to the dashboard.
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/auth\/onboard/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/dashboard/);
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Full browser journey: signup → login → explicit workspace creation → dashboard
//    Workspace creation is an explicit, asserted step (no hidden auto-org).
// ──────────────────────────────────────────────────────────────────────────────

test("full signup then explicit workspace creation reaches dashboard", async ({
    page,
    request,
}) => {
    const email = testEmail("ui-journey");
    const password = "TestPass123!";

    // Register via API (browser signup already covered by test 1).
    const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
        data: { email, password, full_name: "UI Journey User" },
        headers: { Origin: liveBackendUrl },
    });
    if (!regRes.ok()) {
        test.skip(true, "Registration failed \u2014 backend may be unavailable");
        return;
    }

    // Verify the email via the seeded superuser admin so login succeeds.
    const regData = (await regRes.json()) as Record<string, unknown>;
    const userId = (regData.user_id ?? regData.id ?? "") as string;
    const suToken = await getSuperuserToken(request);
    if (!suToken || !userId) {
        test.skip(true, "Superuser credentials not usable \u2014 cannot verify the test user");
        return;
    }
    const verified = await verifyUser(request, userId, suToken);
    if (!verified) {
        test.skip(true, "verifyUser() returned non-OK \u2014 skipping journey test");
        return;
    }

    // Sign in → the orgless user is routed into onboarding.
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/auth\/onboard/, { timeout: 15_000 });

    // Explicitly create the workspace, then land on the dashboard.
    await expect(page.getByRole("button", { name: "Create Workspace" })).toBeEnabled({
        timeout: 10_000,
    });
    await page.getByLabel("Organization Name").fill("UI Journey Org");
    await page.getByRole("button", { name: "Create Workspace" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Developer Health Ops Cockpit" })).toBeVisible({
        timeout: 10_000,
    });
});
