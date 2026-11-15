import { expect, test } from "@playwright/test";

test("/auth/signin renders login form with tabs", async ({ page }) => {
    await page.goto("/auth/signin");

    await expect(page).toHaveURL(/\/auth\/signin(?:\?|$)/);
    // Tab toggle should show Sign in as active (scope to main to avoid nav "Sign in" link)
    await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
        page.getByRole("main").getByRole("link", { name: "Create account" }),
    ).toBeVisible();
    await expect(page.getByText("continue with email")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("/auth/signin shows post-registration banner", async ({ page }) => {
    await page.goto("/auth/signin?registered=true");

    await expect(page.getByText("Account created successfully. Please sign in.")).toBeVisible();
});

test("/auth/signin shows error toast on failed login", async ({ page }) => {
    await page.goto("/auth/signin");

    // Fill in credentials that will fail (mock backend rejects all logins)
    await page.getByLabel("Email").fill("bad@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    // The Toaster component must be mounted in the (auth) layout for this to appear
    await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 10_000 });
});

test("/auth/signin tab navigates to signup", async ({ page }) => {
    await page.goto("/auth/signin");

    await page.getByRole("link", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/auth\/signup/);
});

test("successful sign-in returns to the protected URL including its query", async ({ page }) => {
    await page.goto("/settings?tab=integrations");

    const signInUrl = new URL(page.url());
    expect(signInUrl.pathname).toBe("/auth/signin");
    expect(signInUrl.searchParams.get("callbackUrl")).toBe("/settings?tab=integrations");

    await page.getByLabel("Email").fill("admin@devhealth.example");
    await page.getByLabel("Password").fill("devhealth123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/settings\?tab=integrations$/);
});

// CHAOS-13756: a refused social sign-in lands on /auth/signin?error=social_<reason>. Each code shows its
// sentence; the screenshots (before: no code, after: each code) are attached to the report for the review.
const SOCIAL_REFUSAL_SENTENCES: Record<string, string> = {
    social_email_unverified:
        "The sign-in provider has not verified your email address. Verify it with the provider, then try again.",
    social_identity_conflict:
        "This sign-in could not be completed. Contact your administrator if this continues.",
    social_signup_unavailable:
        "Sign-up with this provider is not available. Sign in with an existing account or contact your administrator.",
    social_principal_deactivated: "This account is disabled. Contact your administrator.",
    social_invalid_credentials:
        "The sign-in provider did not accept this sign-in. Please try again.",
    social_malformed:
        "The sign-in provider returned an account that cannot be used. Please try again or use another sign-in method.",
    social_dependency_unavailable:
        "This sign-in method is not available right now. Please try again later or use another sign-in method.",
    social_login_failed: "Social login failed. Please try again or use email and password.",
};

test("/auth/signin shows the sentence of each social refusal code", async ({ page }, testInfo) => {
    await page.goto("/auth/signin");
    await testInfo.attach("before-no-code", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
    });
    for (const [code, sentence] of Object.entries(SOCIAL_REFUSAL_SENTENCES)) {
        await page.goto(`/auth/signin?error=${code}`);
        await expect(page.getByText(sentence, { exact: true })).toBeVisible();
        await testInfo.attach(`after-${code}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: "image/png",
        });
    }
});
