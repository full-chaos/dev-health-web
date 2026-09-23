import { expect, test } from "@playwright/test";

// CHAOS-6317: a signed-out visitor opening the printed device-approval link
// (acr's `verification_uri_complete`, e.g. `/acr/device?user_code=F6KR8VXX`)
// with a genuinely fresh browser profile must be bounced to sign-in with the
// code preserved, then land back on the device page with it prefilled and
// able to complete the approve flow. This spec runs OUTSIDE the
// `authenticated` Playwright project (see playwright.config.ts's testIgnore
// for auth-signin.spec.ts, the sibling spec this one follows) so every test
// here starts with zero cookies -- no storageState fixture is applied.
const USER_CODE = "F6KR8VXX";

test("fresh-cookie visit to /acr/device redirects to sign-in with the code preserved", async ({
    page,
}) => {
    await page.goto(`/acr/device?user_code=${USER_CODE}`);

    const signInUrl = new URL(page.url());
    expect(signInUrl.pathname).toBe("/auth/signin");
    expect(signInUrl.searchParams.get("callbackUrl")).toBe(`/acr/device?user_code=${USER_CODE}`);
});

test("sign-in returns to /acr/device with the code prefilled, and approve completes", async ({
    page,
}) => {
    await page.goto(`/acr/device?user_code=${USER_CODE}`);
    await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=/);

    await page.getByLabel("Email").fill("admin@devhealth.example");
    await page.getByLabel("Password").fill("devhealth123");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Full round trip: hard nav back to /acr/device with the SAME code, no
    // sign-in interstitial left over, no bounce to /dashboard.
    await expect(page).toHaveURL(new RegExp(`/acr/device\\?user_code=${USER_CODE}$`));
    await expect(page.getByLabel("Verification code")).toHaveValue(USER_CODE);

    const previewButton = page.getByRole("button", { name: "Preview request" });
    await expect(previewButton).toBeEnabled();

    await page.route("**/api/acr/device", async (route) => {
        const body = route.request().postDataJSON() as { action: string };
        if (body.action === "preview") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ repositoryHints: ["org/example-repo"] }),
            });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "approved" }),
        });
    });

    await previewButton.click();
    await expect(page.getByRole("heading", { name: "Review device access" })).toBeVisible();

    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("heading", { name: "Approval complete" })).toBeVisible();
});
