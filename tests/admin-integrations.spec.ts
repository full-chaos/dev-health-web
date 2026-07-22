import { expect, test } from "@playwright/test";
import { setPagerDutyEntitlement } from "./pagerduty-final-qa.helpers";

test("providers page renders a provider management table", async ({ page }) => {
    await page.goto("/org/admin/integrations");

    await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("cell", { name: "GitHub", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "GitLab", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Jira", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Linear", exact: true })).toBeVisible();
});

// CHAOS-2837 reworked provider connections into a guided Add Provider
// workflow (provider -> auth method -> credential -> verify -> review),
// replacing the always-visible credential form. The wizard auto-opens when
// a provider has zero credentials (the "Add Provider" button click below is
// conditional for that reason, mirroring the pre-existing seeded-vs-empty
// test-environment handling).
async function openAddProviderWizard(page: import("@playwright/test").Page, provider: string) {
    await page.goto(`/org/admin/integrations/${provider}`);
    const addProvider = page.getByRole("button", { name: "Add Provider" }).first();
    if (await addProvider.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await addProvider.click();
    }
}

async function openGitHubAddProviderWizard(page: import("@playwright/test").Page) {
    await page.goto("/org/admin/integrations");
    await page.getByRole("button", { name: "Add Provider" }).click();
    await page.getByText("GitHub", { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
}

test("GitHub Add Provider wizard offers GitHub App first, then a manual token credential step", async ({
    page,
}) => {
    await openGitHubAddProviderWizard(page);

    // Auth-method step only renders when no GitHub App is connected yet.
    const manualLink = page.getByText("Use a personal access token instead");
    if (await manualLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await manualLink.click();
        await page.getByRole("button", { name: "Continue" }).click();
    }

    await expect(page.getByLabel("Personal access token", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Organization / Owner", { exact: true })).toBeVisible();
});

test("GitHub manual credential flow: fill token -> verify -> finish", async ({ page }) => {
    await openGitHubAddProviderWizard(page);

    const manualLink = page.getByText("Use a personal access token instead");
    if (await manualLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await manualLink.click();
        await page.getByRole("button", { name: "Continue" }).click();
    }

    await page.getByLabel("Personal access token", { exact: true }).fill("ghp_test123");
    await page.getByLabel("Organization / Owner", { exact: true }).fill("test-org");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Verify connection", exact: true }).click();
    await expect(page.getByText(/Connection successful/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Finish" }).click();

    await expect(page.getByText(/credential saved/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Create sync configuration" })).toBeVisible();
});

test("GitLab Add Provider wizard renders manual credential fields immediately", async ({
    page,
}) => {
    await openAddProviderWizard(page, "gitlab");

    await expect(page.locator("#gitlab-token")).toBeVisible();
    await expect(page.locator("#gitlab-group")).toBeVisible();
});

test("Jira Add Provider wizard renders manual credential fields immediately", async ({ page }) => {
    await openAddProviderWizard(page, "jira");

    await expect(page.locator("#jira-url")).toBeVisible();
    await expect(page.locator("#jira-email")).toBeVisible();
    await expect(page.locator("#jira-token")).toBeVisible();
    await expect(page.locator("#jira-projects")).toBeVisible();
});

test("Linear Add Provider wizard renders manual credential fields immediately", async ({
    page,
}) => {
    await openAddProviderWizard(page, "linear");

    await expect(page.locator("#linear-key")).toBeVisible();
    await expect(page.locator("#linear-teams")).toBeVisible();
});

test("PagerDuty OAuth starts immediately without credential fields", async ({ page, request }) => {
    await setPagerDutyEntitlement(request, "canonical-enabled");
    await page.goto("/org/admin/integrations/pagerduty");

    const oauth = page.getByRole("button", { name: "OAuth (recommended)" });
    await expect(oauth).toBeVisible();
    await oauth.click();

    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
    await expect(page.getByLabel("Credential Name")).toHaveCount(0);
    await expect(page.getByLabel("Account subdomain")).toHaveCount(0);
    await expect(page.getByLabel("Client ID")).toHaveCount(0);
    await expect(page.getByLabel("Client secret")).toHaveCount(0);
    await expect(page.getByLabel("API token")).toHaveCount(0);
});

test("PagerDuty setup retains generic manual credential fallbacks", async ({ page, request }) => {
    await setPagerDutyEntitlement(request, "canonical-enabled");
    await page.goto("/org/admin/integrations/pagerduty");

    await expect(page.getByRole("button", { name: "OAuth (recommended)" })).toBeVisible();
    await page.getByRole("button", { name: "Client credentials" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Client ID")).toBeVisible();
    await expect(page.getByLabel("Client secret")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Use API token instead" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("API token")).toBeVisible();
});

test("unknown provider returns 404", async ({ page }) => {
    await page.goto("/org/admin/integrations/unknown");

    await expect(page.getByText(/this page could not be found/i)).toBeVisible();
});
