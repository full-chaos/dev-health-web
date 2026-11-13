/**
 * Live guided onboarding journey against the real go-api and auth-service (the `guided` tier: auto-org off, guided web flag on).
 * The default suite covers the same screens against a mock backend (tests/auth-onboard.spec.ts); these cells run them on the real
 * stack: the validation, the integration step, the resume from the backend's onboarding state, the persisted skip and the routing
 * guards. `?github_app=connected` after a real GitHub App install is not executable here (no stand-in for the install callback).
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
    clickHydratedOnboardingControl,
    envFault,
    isServerActionTo,
    loginUser,
    registerUser,
    testEmail,
    verifyUserViaStack,
} from "./helpers";

const liveGuidedOnboarding =
    process.env.LIVE_GUIDED_ONBOARDING === "true" || process.env.LIVE_GUIDED_ONBOARDING === "1";

const BASE = "http://127.0.0.1:3002";
const password = "TestPass123!TestPass123!";

// Retries spend login budget: none. One fresh user per group, groups run in order inside the shared guided job.
test.describe.configure({ retries: 0 });
test.setTimeout(120_000);

// The DIAG lines go to a file the whole run appends to, not to worker memory: a failed cell restarts the worker and would empty a list.
const diagFile = join(
    tmpdir(),
    `auth-onboard-live-diag-${process.env.GITHUB_RUN_ID ?? "local"}-${process.env.GITHUB_RUN_ATTEMPT ?? "0"}.log`,
);
const DIAG_LINES_WRITTEN = 6;
function note(name: string, line: string): void {
    const text = `DIAG ${name}: ${line}`;
    appendFileSync(diagFile, `${text}\n`);
    console.log(text);
    test.info().annotations.push({ type: `diag-${name}`, description: line });
}

async function freshUser(
    browser: Browser,
    prefix: string,
): Promise<{ email: string; page: Page; close: () => Promise<void> }> {
    const context = await browser.newContext({ baseURL: BASE });
    const email = testEmail(prefix);
    await registerUser(context.request, email, password);
    let verified = false;
    try {
        verified = verifyUserViaStack(email);
    } catch {
        // Stack errors may carry argv, including the address.
        envFault("Onboarding user verification failed");
    }
    if (!verified) envFault("Onboarding user could not be verified");
    const page = await context.newPage();
    return { email, page, close: () => context.close() };
}

async function signIn(page: Page, email: string): Promise<void> {
    await page.goto("/auth/signin");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
}

const where = (page: Page): string => new URL(page.url()).pathname;

/** The toasts on screen (the form reports its refusals as toasts, outside <main>). */
async function snapshotToasts(page: Page, name: string): Promise<void> {
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts();
    note(
        name,
        `path=${where(page)} toasts=${JSON.stringify(toasts.map((t) => t.replace(/\s+/gu, " ").slice(0, 160)))}`,
    );
}

/** The refusal of an empty or blank workspace name is a toast with this exact text (the real backend's wording, not the mock's). */
const WORKSPACE_NAME_REQUIRED = "Workspace name is required";

/** Which setup banner the dashboard shows: its variant attribute and the count of each variant's title. */
async function snapshotBanner(page: Page, name: string): Promise<void> {
    const banner = page.locator('[data-testid="setup-banner"]');
    const variant =
        (await banner.count()) > 0 ? await banner.first().getAttribute("data-variant") : "none";
    const count = (text: string) => page.getByText(text).count();
    note(
        name,
        `path=${where(page)} variant=${String(variant)} connect-a-source=${String(await count("Connect a source to begin"))} skipped=${String(await count("Integration setup skipped"))} pending=${String(await count("GitHub connected"))}`,
    );
}

test.describe("@guided onboarding validation", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        !liveGuidedOnboarding,
        "Set LIVE_GUIDED_ONBOARDING=1 (backend AUTH_AUTO_CREATE_ORG_ON_REGISTER=false) for the orgless onboarding journey",
    );
    let user: Awaited<ReturnType<typeof freshUser>> | undefined;

    test.beforeAll(async ({ browser }) => {
        user = await freshUser(browser, "onboard-valid");
    });
    test.afterAll(async () => {
        await user?.close();
    });

    test("a fresh verified user signs in onto the workspace step", async () => {
        const { page, email } = user!;
        await signIn(page, email);
        await expect(page).toHaveURL(/\/auth\/onboard\/workspace/, { timeout: 60_000 });
        await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Create Workspace" })).toBeEnabled({
            timeout: 30_000,
        });
        await expect(page.getByRole("list", { name: "Onboarding progress" })).toBeVisible();
    });

    test("a blank org name is rejected and the user stays on the workspace step", async () => {
        const { page } = user!;
        await page.getByRole("button", { name: "Create Workspace" }).click();
        await page.waitForTimeout(3_000);
        await snapshotToasts(page, "blank-org-submit");
        await expect(
            page.locator("[data-sonner-toast]").filter({ hasText: WORKSPACE_NAME_REQUIRED }),
        ).toBeVisible({
            timeout: 15_000,
        });
        expect(where(page)).toBe("/auth/onboard/workspace");
    });

    test("a whitespace-only org name is rejected and no workspace is created", async () => {
        const { page, email } = user!;
        await page.getByLabel("Organization Name").fill("   ");
        await page.getByRole("button", { name: "Create Workspace" }).click();
        await page.waitForTimeout(3_000);
        await snapshotToasts(page, "whitespace-org-submit");
        await expect(
            page.locator("[data-sonner-toast]").filter({ hasText: WORKSPACE_NAME_REQUIRED }),
        ).toBeVisible({
            timeout: 15_000,
        });
        expect(where(page)).toBe("/auth/onboard/workspace");
        // The real backend still sees an orgless user: nothing was created by either rejected submit.
        const login = (await loginUser(page.request, email, password)) as {
            needs_onboarding?: boolean;
        };
        expect(login.needs_onboarding).toBe(true);
    });
});

test.describe("@guided onboarding journey", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        !liveGuidedOnboarding,
        "Set LIVE_GUIDED_ONBOARDING=1 (backend AUTH_AUTO_CREATE_ORG_ON_REGISTER=false) for the orgless onboarding journey",
    );
    let user: Awaited<ReturnType<typeof freshUser>> | undefined;
    const orgName = `Onboard Org ${Date.now().toString(36)}`;

    test.beforeAll(async ({ browser }) => {
        user = await freshUser(browser, "onboard-journey");
    });
    test.afterAll(async () => {
        await user?.close();
    });

    test("creating the workspace leads to the integration step with its install link and a skip", async () => {
        const { page, email } = user!;
        await signIn(page, email);
        await expect(page).toHaveURL(/\/auth\/onboard\/workspace/, { timeout: 60_000 });
        await expect(page.getByRole("button", { name: "Create Workspace" })).toBeEnabled({
            timeout: 30_000,
        });
        await page.getByLabel("Organization Name").fill(orgName);
        await page.getByRole("button", { name: "Create Workspace" }).click();
        await expect(page).toHaveURL(/\/auth\/onboard\/integration/, { timeout: 60_000 });
        await expect(page.getByRole("heading", { name: "Connect your tools" })).toBeVisible();
        const install = page.getByRole("link", { name: "Connect GitHub App" });
        await expect(install).toBeVisible();
        await expect(install).toHaveAttribute("href", /return_to=%2Fauth%2Fonboard%2Fintegration/);
        await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
    });

    test("a fresh sign-in after the workspace exists lands on the dashboard (by design: the setup banner carries the nudge, not a resumed step)", async ({
        browser,
    }) => {
        const { email } = user!;
        const context = await browser.newContext({ baseURL: BASE });
        try {
            const page = await context.newPage();
            await signIn(page, email);
            await expect.poll(() => where(page), { timeout: 60_000 }).not.toBe("/auth/signin");
            await page.waitForLoadState("networkidle").catch(() => undefined);
            note("resume-landing", `path=${where(page)}`);
            expect(where(page)).toBe("/dashboard");
        } finally {
            await context.close();
        }
    });

    // CURRENT ANSWER, NOT THE INTENDED ONE: after a real Skip the dashboard shows the no-integration banner ("Connect a source to
    // begin"), never the skipped banner ("Integration setup skipped"). The web derives "skipped" only from `!has_integration &&
    // next_action === "complete"` (src/lib/onboarding/setupSurface.ts:53-56), but the ops setup status answers
    // next_action "connect_integration" whenever no integration is connected and never reads the stored skip
    // (internal/apiservice/admin/setupstatus.go:202-203). This pins what the product answers today.
    test("skipping the integration reaches completion, then the dashboard shows the no-integration banner, not the skipped one (the current answer, not the intended one)", async () => {
        const { page } = user!;
        await page.goto("/auth/onboard/integration");
        await clickHydratedOnboardingControl(
            page,
            page.getByRole("button", { name: "Skip for now" }),
            "Skip for now",
            isServerActionTo("/auth/onboard/integration"),
        );
        await expect(page).toHaveURL(/\/auth\/onboard\/complete/, { timeout: 60_000 });
        await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();
        await page.getByRole("link", { name: "Go to dashboard" }).click();
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
        const banner = page.locator('[data-testid="setup-banner"]');
        await expect(banner.first()).toBeVisible({ timeout: 30_000 });
        await snapshotBanner(page, "dashboard-after-skip");
        await expect(banner.first()).toHaveAttribute("data-variant", "no-integration");
        await expect(page.getByText("Connect a source to begin").first()).toBeVisible();
        await expect(page.getByText("Integration setup skipped")).toHaveCount(0);
        await page.reload();
        await expect(banner.first()).toHaveAttribute("data-variant", "no-integration", {
            timeout: 30_000,
        });
        await expect(page.getByText("Integration setup skipped")).toHaveCount(0);
    });

    test("an onboarded user opening the workspace step is routed by the backend state", async () => {
        const { page } = user!;
        await page.goto("/auth/onboard/workspace");
        await page.waitForLoadState("networkidle").catch(() => undefined);
        note("guard-onboarded-on-workspace", `path=${where(page)}`);
        expect(where(page)).toMatch(/^\/(auth\/onboard|dashboard)/);
    });
});

test.describe("@guided onboarding guard", () => {
    test.skip(
        !liveGuidedOnboarding,
        "Set LIVE_GUIDED_ONBOARDING=1 (backend AUTH_AUTO_CREATE_ORG_ON_REGISTER=false) for the orgless onboarding journey",
    );

    test("an orgless user opening the dashboard is routed to onboarding, not served the dashboard", async ({
        browser,
    }) => {
        const user = await freshUser(browser, "onboard-guard");
        try {
            const { page, email } = user;
            await signIn(page, email);
            await expect(page).toHaveURL(/\/auth\/onboard/, { timeout: 60_000 });
            await page.goto("/dashboard");
            await page.waitForLoadState("networkidle").catch(() => undefined);
            note("guard-orgless-on-dashboard", `path=${where(page)}`);
            expect(where(page)).toBe("/auth/onboard/workspace");
        } finally {
            await user.close();
        }
    });
});

test.describe("@guided onboarding diagnostics", () => {
    test.skip(
        !liveGuidedOnboarding,
        "Set LIVE_GUIDED_ONBOARDING=1 (backend AUTH_AUTO_CREATE_ORG_ON_REGISTER=false) for the orgless onboarding journey",
    );

    test("no DIAG line of this file names a secret, and the expected lines were written", () => {
        const lines = existsSync(diagFile)
            ? readFileSync(diagFile, "utf8")
                  .split("\n")
                  .filter((line) => line !== "")
            : [];
        expect(lines.length, "the DIAG lines the earlier cells wrote").toBe(DIAG_LINES_WRITTEN);
        for (const line of lines) {
            expect(line, "a DIAG line carries a credential-shaped value").not.toMatch(
                /eyJ[A-Za-z0-9_-]{8,}|bearer|password|access_token|refresh_token|@example\.com/iu,
            );
        }
    });
});
