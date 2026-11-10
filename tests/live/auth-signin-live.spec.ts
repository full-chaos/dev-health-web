/**
 * UI password sign-in against the real backend (auth-service).
 * Run with playwright.live.config.ts (baseURL = http://127.0.0.1:3002).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { envFault, registerUser, testEmail, verifyUserViaStack } from "./helpers";

// Four UI logins, each with a fresh account; retries must not spend the login budget.
test.describe.configure({ retries: 0 });
test.setTimeout(120_000);

const password = "TestPass123!TestPass123!";

async function freshUser(request: APIRequestContext, prefix: string, verify = true) {
    const email = testEmail(prefix);
    // registerUser uses expectRegisterAccepted, including its 429 environment-fault check.
    await registerUser(request, email, password);
    if (verify && !verifyUserViaStack(email)) {
        envFault("verifyUserViaStack() returned non-OK — cannot verify the sign-in test user");
    }
    return email;
}

async function submitSignIn(page: Page, email: string, submittedPassword = password) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(submittedPassword);
    const callbackResponse = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^sign in$/i }).click();
    const response = await callbackResponse;
    if (response.status() === 429) {
        envFault("Login rate-limited (429)");
        return;
    }
    const result = (await response.json()) as { url?: string };
    const code = result.url ? new URL(result.url, page.url()).searchParams.get("code") : null;
    // Auth.js wraps backend 429s in a JSON redirect URL, often with HTTP 200.
    // authServiceOutcome also maps a 429 with retry_after_seconds to account_locked.
    if (code === "rate_limited" || code === "account_locked") {
        envFault("Login rate-limited or account locked (backend 429)");
        return;
    }
    expect(response.ok(), "The credentials callback must complete successfully").toBe(true);
}

async function sessionUser(page: Page) {
    const response = await page.request.get("/api/auth/session");
    expect(response.ok()).toBe(true);
    const session = (await response.json()) as { user?: { email?: string } } | null;
    return session?.user;
}

test("sign-in with the right password reaches the dashboard", async ({ page, request }) => {
    const email = await freshUser(request, "ui-signin-ok");

    await page.goto("/auth/signin");
    await submitSignIn(page, email);

    // A fresh dev server may need to compile the dashboard on this first landing.
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 60_000 });
    await expect.poll(async () => (await sessionUser(page))?.email).toBe(email);
});

test("a wrong password is refused and no session is created", async ({ page, request }) => {
    const email = await freshUser(request, "ui-signin-wrong");

    await page.goto("/auth/signin");
    await submitSignIn(page, email, "WrongPass456!WrongPass456!");

    await expect(page.getByText("Invalid email or password", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin(?:\?|$)/);
    await expect.poll(async () => Boolean(await sessionUser(page))).toBe(false);
});

test("sign-in returns to the protected URL including its query", async ({ page, request }) => {
    const email = await freshUser(request, "ui-signin-return");

    await page.goto("/settings?tab=integrations");
    await expect(page).toHaveURL(
        (url) =>
            url.pathname === "/auth/signin" &&
            url.searchParams.get("callbackUrl") === "/settings?tab=integrations",
    );
    await submitSignIn(page, email);

    await expect(page).toHaveURL(/\/settings\?tab=integrations$/, { timeout: 60_000 });
    await expect.poll(async () => (await sessionUser(page))?.email).toBe(email);
});

test("an unverified user cannot sign in", async ({ page, request }) => {
    const email = await freshUser(request, "ui-signin-unverified", false);

    await page.goto("/auth/signin");
    await submitSignIn(page, email);

    // LoginForm renders this only after the email_verification_required answer.
    await expect(page.getByText("Please verify your email", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin(?:\?|$)/);
    await expect.poll(async () => Boolean(await sessionUser(page))).toBe(false);
});
