/** UI password recovery against auth-service and its loopback mail sink. */
import { expect, test, type APIRequestContext, type Page, type Response } from "@playwright/test";
import {
    envFault,
    mailTokenViaStack,
    registerUser,
    testEmail,
    verifyUserViaStack,
    waitForMailToken,
} from "./helpers";

// Per job: six forgot requests, six reset requests, three UI logins; retries spend no budget.
test.describe.configure({ retries: 0 });
test.setTimeout(120_000);

const oldPassword = "TestPass123!TestPass123!";
const newPassword = "RecoveryPass456!RecoveryPass456!";
const otherPassword = "AnotherPass789!AnotherPass789!";
const forgotSuccess = "If an account exists with that email, a password reset link has been sent.";
const resetSuccess = "Your password has been reset successfully.";
const resetRefused = "Invalid or expired token";

async function freshUser(request: APIRequestContext) {
    const email = testEmail("ui-recovery");
    await registerUser(request, email, oldPassword);
    let verified = false;
    try {
        verified = verifyUserViaStack(email);
    } catch {
        // Stack errors may carry argv, including the recipient.
        envFault("Recovery user verification failed");
    }
    if (!verified) envFault("Recovery user could not be verified");
    return email;
}

async function checkEnvironment(response: Response) {
    if (response.status() === 429 || response.status() === 423) {
        envFault("Recovery rate-limited or account locked");
        return;
    }
    if (!response.ok()) {
        const body = (await response.json().catch(() => ({}))) as {
            code?: string;
            error?: { code?: string };
        } | null;
        const code = body?.code ?? body?.error?.code;
        if (code === "rate_limited" || code === "account_locked") {
            envFault("Recovery rate-limited or account locked");
        }
    }
}

async function forgot(page: Page, email: string) {
    await page.goto("/auth/forgot-password");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    const pending = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/v1/auth/forgot-password" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    const response = await pending;
    await checkEnvironment(response);
    expect(response.ok()).toBe(true);
    await expect(page.getByText(forgotSuccess, { exact: true })).toBeVisible();
}

async function openReset(page: Page, token: string) {
    try {
        await page.goto(`/auth/reset-password?token=${encodeURIComponent(token)}`);
    } catch {
        throw new Error("Reset page could not be opened");
    }
}

async function fillReset(page: Page, password: string, confirmation = password) {
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page.getByLabel("Confirm new password", { exact: true }).fill(confirmation);
}

async function reset(page: Page, token: string, password: string, accepted: boolean) {
    await openReset(page, token);
    await fillReset(page, password);
    const pending = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/v1/auth/reset-password" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    const response = await pending;
    await checkEnvironment(response);
    if (accepted) {
        expect(response.ok()).toBe(true);
        await expect(page.getByText(resetSuccess, { exact: true })).toBeVisible();
    } else {
        expect(response.status()).toBe(400);
        await expect(page.getByText(resetRefused, { exact: true })).toBeVisible();
        await expect(page.getByText(resetSuccess, { exact: true })).toHaveCount(0);
    }
}

async function submitSignIn(page: Page, email: string, password: string) {
    await page.goto("/auth/signin");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const pending = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^sign in$/i }).click();
    const response = await pending;
    if (response.status() === 429) {
        envFault("Login rate-limited (429)");
        return;
    }
    const result = (await response.json()) as { url?: string };
    const code = result.url ? new URL(result.url, page.url()).searchParams.get("code") : null;
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

async function expectSignedIn(page: Page, email: string) {
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 60_000 });
    // Compare privately so assertion diagnostics never print the address.
    await expect.poll(async () => (await sessionUser(page))?.email === email).toBe(true);
}

test("forgot, reset and sign in with the new password", async ({ page, request, browser }) => {
    const email = await freshUser(request);
    await forgot(page, email);
    const token = await waitForMailToken(email, "reset");
    await reset(page, token, newPassword, true);
    await submitSignIn(page, email, newPassword);
    await expectSignedIn(page, email);

    const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
        const freshPage = await context.newPage();
        await submitSignIn(freshPage, email, oldPassword);
        await expect(
            freshPage.getByText("Invalid email or password", { exact: true }),
        ).toBeVisible();
        await expect(freshPage).toHaveURL(/\/auth\/signin(?:\?|$)/);
        await expect.poll(async () => Boolean(await sessionUser(freshPage))).toBe(false);
    } finally {
        await context.close();
    }
});

test("a used reset token is refused", async ({ page, request }) => {
    const email = await freshUser(request);
    await forgot(page, email);
    const token = await waitForMailToken(email, "reset");
    await reset(page, token, newPassword, true);
    // Refuse a second password mutation; the successful first reset remains in force.
    await reset(page, token, otherPassword, false);
});

test("an unknown address gets the same answer and no mail", async ({ page, request }) => {
    const known = await freshUser(request);
    const unknown = testEmail("ui-recovery-unknown");
    // Send unknown first, then prove delivery works before checking that unknown got no mail.
    await forgot(page, unknown);
    await forgot(page, known);
    await waitForMailToken(known, "reset");
    expect(mailTokenViaStack(unknown, "reset") === null).toBe(true);
});

test("a malformed reset token is refused", async ({ page, request }) => {
    const email = await freshUser(request);
    await reset(page, "not-a-token", newPassword, false);
    await submitSignIn(page, email, oldPassword);
    await expectSignedIn(page, email);
});

test("client-side rules refuse before any request", async ({ page }) => {
    let resetPosts = 0;
    await page.route("**/api/v1/auth/reset-password", async (route) => {
        if (route.request().method() === "POST") {
            resetPosts += 1;
            await route.abort();
        } else {
            await route.continue();
        }
    });
    await openReset(page, "not-a-token");
    // Exercise the React toasts, including the short-password rule, past native minLength.
    await page.locator("form").evaluate((form: HTMLFormElement) => {
        form.noValidate = true;
    });
    for (const [password, confirmation, message] of [
        [newPassword, otherPassword, "Passwords do not match"],
        ["Abc123", "Abc123", "Password must be at least 8 characters"],
        ["LettersOnly", "LettersOnly", "Password must contain at least one number"],
        ["1234567890", "1234567890", "Password must contain at least one letter"],
    ]) {
        await fillReset(page, password, confirmation);
        await page.getByRole("button", { name: "Reset password", exact: true }).click();
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        expect(resetPosts).toBe(0);
    }
});

test("a newer reset mail supersedes the older token", async ({ page, request }) => {
    const email = await freshUser(request);
    await forgot(page, email);
    const token1 = await waitForMailToken(email, "reset");
    await forgot(page, email);
    const token2 = await waitForMailToken(email, "reset", { not: token1 });
    await reset(page, token1, newPassword, false);
    await reset(page, token2, newPassword, true);
});
