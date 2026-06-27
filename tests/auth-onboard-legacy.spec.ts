/**
 * Legacy (flag-off) single-page onboarding E2E (CHAOS-2670).
 *
 * Runs in the DEFAULT Playwright suite, where NEXT_PUBLIC_GUIDED_ONBOARDING is
 * OFF. With the flag off, /auth/onboard renders the legacy single-page
 * workspace form and creating a workspace lands directly on the dashboard —
 * the behaviour that still ships until the guided flow is rolled out. The
 * guided multi-step journey lives in the flag-on config
 * (playwright.onboarding.config.ts / `pnpm test:e2e:onboarding`).
 *
 * The orgless `newuser@example.com` drives it: signing in routes to
 * /auth/onboard, and naming a workspace completes onboarding into /dashboard
 * (NOT the guided integration step).
 */
import { expect, test } from "@playwright/test";

test.describe("legacy single-page onboarding (flag off)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("orgless sign-in renders the workspace form and creating one lands on the dashboard", async ({
        page,
    }) => {
        test.slow();

        // Sign in as the orgless new user; the post-auth guard routes a
        // needs_onboarding user to the onboard page.
        await page.goto("/auth/signin");
        await page.getByLabel("Email").fill("newuser@example.com");
        await page.getByLabel("Password").fill("password123");
        await page.getByRole("button", { name: "Sign In" }).click();

        await expect(page).toHaveURL(/\/auth\/onboard/, { timeout: 30_000 });

        // Legacy single-page workspace form (no guided step shell or progress
        // indicator — that only renders with the flag on).
        await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
        await expect(page.getByLabel("Organization Name")).toBeVisible();
        await expect(page.getByRole("button", { name: "Create Workspace" })).toBeEnabled({
            timeout: 10_000,
        });

        await page.getByLabel("Organization Name").fill("Legacy Org");
        await page.getByRole("button", { name: "Create Workspace" }).click();

        // Legacy behaviour: workspace creation lands directly on the dashboard.
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    });
});
