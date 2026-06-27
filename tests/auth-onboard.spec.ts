/**
 * Guided first-run onboarding E2E (CHAOS-2670 / CHAOS-2679).
 *
 * These specs run in the `onboarding-user` project, which points at the guided
 * dev server (port 3003) where NEXT_PUBLIC_GUIDED_ONBOARDING is enabled. That
 * server reads its routing target server-side from the C1 onboarding-state
 * endpoint, so the stateful mock backend (port 8002) advances a shared progress
 * object as the user creates a workspace, skips, or connects an integration.
 *
 * The journey encoded here is:
 *   /auth/signup -> /auth/signin?registered=true -> /auth/onboard/workspace
 *   -> /auth/onboard/integration -> /auth/onboard/complete -> /dashboard
 *
 * `newuser@example.com` is the ORGLESS new signup that drives this flow; the
 * onboarding-setup project signs in as that user to seed the storage state.
 */
import { expect, test, type Page } from "@playwright/test";

/**
 * Reset the guided onboarding progress on the mock backend. The endpoint lives
 * under the public, proxied `/api/v1/auth` prefix so it works before sign-in.
 * Pass `{ step: "integration" }` (or `{ connected: true }`) to seed a later
 * starting point.
 */
async function resetOnboarding(
    page: Page,
    body?: { step?: "workspace" | "integration" | "complete"; connected?: boolean },
): Promise<void> {
    const res = await page.request.post("/api/v1/auth/onboarding/reset", {
        data: body ?? {},
    });
    expect(res.ok()).toBeTruthy();
}

test.describe("guided first-run onboarding", () => {
    test("workspace step renders the workspace setup form", async ({ page }) => {
        await resetOnboarding(page);
        await page.goto("/auth/onboard/workspace");

        await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
        await expect(page.getByLabel("Organization Name")).toBeVisible();
        await expect(page.getByRole("button", { name: "Create Workspace" })).toBeVisible();
        // The guided shell renders the step progress indicator.
        await expect(page.getByRole("list", { name: "Onboarding progress" })).toBeVisible();
    });

    test("creating a workspace advances to the integration step (not the dashboard)", async ({
        page,
    }) => {
        test.slow();
        await resetOnboarding(page);
        await page.goto("/auth/onboard/workspace");
        await expect(page.getByRole("button", { name: "Create Workspace" })).toBeEnabled({
            timeout: 10_000,
        });

        await page.getByLabel("Organization Name").fill("My Test Org");
        await page.getByRole("button", { name: "Create Workspace" }).click();

        // Guided workspace creation routes to the integration step — NOT straight
        // to the dashboard (the legacy single-page behaviour).
        await expect(page).toHaveURL(/\/auth\/onboard\/integration/, { timeout: 30_000 });
        await expect(page.getByRole("heading", { name: "Connect your tools" })).toBeVisible();
    });

    test("a blank org name is rejected and stays on the workspace step", async ({ page }) => {
        test.slow();
        await resetOnboarding(page);
        await page.goto("/auth/onboard/workspace");
        await expect(page.getByRole("button", { name: "Create Workspace" })).toBeEnabled({
            timeout: 10_000,
        });

        await page.getByRole("button", { name: "Create Workspace" }).click();

        // The backend rejects the empty name; the user never leaves the workspace
        // step and no workspace is silently created.
        await expect(page.getByText("Organization name is required")).toBeVisible({
            timeout: 10_000,
        });
        await expect(page).toHaveURL(/\/auth\/onboard\/workspace/);
        await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
    });

    test("a whitespace-only org name is rejected", async ({ page }) => {
        test.slow();
        await resetOnboarding(page);
        await page.goto("/auth/onboard/workspace");
        await expect(page.getByRole("button", { name: "Create Workspace" })).toBeEnabled({
            timeout: 10_000,
        });

        await page.getByLabel("Organization Name").fill("   ");
        await page.getByRole("button", { name: "Create Workspace" }).click();

        await expect(page.getByText("Organization name is required")).toBeVisible({
            timeout: 10_000,
        });
        await expect(page).toHaveURL(/\/auth\/onboard\/workspace/);
    });

    test("the integration step leads with a return-aware GitHub App install and a skip", async ({
        page,
    }) => {
        await resetOnboarding(page, { step: "integration" });
        await page.goto("/auth/onboard/integration");

        await expect(page.getByRole("heading", { name: "Connect your tools" })).toBeVisible();

        // The return-aware install routes the callback back to the integration
        // step so the guided flow resumes there (CHAOS-2675/2676).
        const installLink = page.getByRole("link", { name: "Connect GitHub App" });
        await expect(installLink).toBeVisible();
        await expect(installLink).toHaveAttribute(
            "href",
            /return_to=%2Fauth%2Fonboard%2Fintegration/,
        );

        // The user can skip the integration for now.
        await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
    });

    test("returning from the GitHub App install surfaces the connected state", async ({ page }) => {
        await resetOnboarding(page, { step: "integration" });
        await page.goto("/auth/onboard/integration?github_app=connected");

        await expect(page.getByText("Your first integration is connected")).toBeVisible();
        // The success state offers a Continue CTA into the completion step.
        const continueLink = page.getByRole("link", { name: "Continue" });
        await expect(continueLink).toHaveAttribute("href", /\/auth\/onboard\/complete/);
    });

    test("skipping the integration advances to completion then the dashboard", async ({ page }) => {
        test.slow();
        await resetOnboarding(page);
        await page.goto("/auth/onboard/workspace");
        await expect(page.getByRole("button", { name: "Create Workspace" })).toBeEnabled({
            timeout: 10_000,
        });

        await page.getByLabel("Organization Name").fill("Skip Path Org");
        await page.getByRole("button", { name: "Create Workspace" }).click();
        await expect(page).toHaveURL(/\/auth\/onboard\/integration/, { timeout: 30_000 });

        await page.getByRole("button", { name: "Skip for now" }).click();
        await expect(page).toHaveURL(/\/auth\/onboard\/complete/, { timeout: 30_000 });
        await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();

        await page.getByRole("link", { name: "Go to dashboard" }).click();
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

        // The dashboard surfaces the persistent skipped-integration setup banner.
        await expect(page.getByText("Integration setup skipped").first()).toBeVisible({
            timeout: 15_000,
        });
    });
});

test.describe("guided first-run journey (fresh signup)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("signup → signin → workspace → integration → complete → dashboard", async ({ page }) => {
        test.slow();
        // Start from a clean orgless state. The reset endpoint is public, so it
        // works before any sign-in.
        await resetOnboarding(page);

        // 1. Sign up.
        await page.goto("/auth/signup");
        await page.getByLabel("Display name").fill("Journey User");
        await page.getByLabel("Email").fill("journey@example.com");
        await page.getByLabel("Password").fill("password123");
        await page.getByRole("checkbox").check();
        await page.getByRole("button", { name: "Create account" }).click();

        // 2. Post-registration banner on the signin route.
        await expect(page).toHaveURL(/\/auth\/signin\?registered=true/, { timeout: 15_000 });
        await expect(page.getByText("Account created successfully")).toBeVisible();

        // 3. Sign in as the SAME just-registered orgless user → the stateful
        //    register handler made journey@example.com a needs_onboarding user,
        //    so guided onboarding takes over and routes to the workspace step
        //    (never straight to the dashboard).
        await page.getByLabel("Email").fill("journey@example.com");
        await page.getByLabel("Password").fill("password123");
        await page.getByRole("button", { name: "Sign In" }).click();
        await expect(page).toHaveURL(/\/auth\/onboard\/workspace/, { timeout: 30_000 });
        await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();

        // 4. Create the workspace → integration step.
        await expect(page.getByRole("button", { name: "Create Workspace" })).toBeEnabled({
            timeout: 10_000,
        });
        await page.getByLabel("Organization Name").fill("Journey Corp");
        await page.getByRole("button", { name: "Create Workspace" }).click();
        await expect(page).toHaveURL(/\/auth\/onboard\/integration/, { timeout: 30_000 });

        // 5. Skip the integration → completion step.
        await page.getByRole("button", { name: "Skip for now" }).click();
        await expect(page).toHaveURL(/\/auth\/onboard\/complete/, { timeout: 30_000 });

        // 6. Continue into the product.
        await page.getByRole("link", { name: "Go to dashboard" }).click();
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
        await expect(
            page.getByRole("heading", { name: "Developer Health Ops Cockpit" }),
        ).toBeVisible({ timeout: 15_000 });
    });
});

test.describe("unauthenticated", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("unauthenticated access redirects to signin", async ({ page }) => {
        await page.goto("/auth/onboard");

        await expect(page).toHaveURL(/\/auth\/signin/);
    });
});
