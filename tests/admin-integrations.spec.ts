import { expect, test } from "@playwright/test";

test("integrations page renders provider cards", async ({ page }) => {
    await page.goto("/admin/integrations");

    await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "GitHub" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "GitLab" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Jira" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linear" })).toBeVisible();
});

// CHAOS-840 made the integrations page credential-card-first. When at least
// one credential is already saved (the case in the seeded test environment),
// the page renders saved-credential cards rather than the legacy form, so
// these tests open the form via the "Add Connection" button before asserting
// on form fields. The button is also rendered when no credentials exist (the
// page just auto-opens the form in that case), so the click is conditional.
async function openGithubForm(page: import("@playwright/test").Page) {
    await page.goto("/admin/integrations/github");
    const addConnection = page.getByRole("button", { name: "Add Connection" }).first();
    if (await addConnection.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await addConnection.click();
    }
}

test("GitHub integration form renders all fields", async ({ page }) => {
    await openGithubForm(page);

    await expect(page.locator("#github-token")).toBeVisible();
    await expect(page.locator("#github-org")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Test Connection" })).toBeVisible();
});

test("GitHub save shows success toast", async ({ page }) => {
    await openGithubForm(page);

    await page.locator("#github-token").fill("ghp_test123");
    await page.locator("#github-org").fill("test-org");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText("Settings saved successfully")).toBeVisible({ timeout: 10_000 });
});

test("GitHub test connection updates status", async ({ page }) => {
    await openGithubForm(page);

    await page.locator("#github-token").fill("ghp_test123");
    await page.getByRole("button", { name: "Test Connection" }).click();

    await expect(page.getByText("Connection successful")).toBeVisible({ timeout: 10_000 });
});

test("GitLab integration form renders fields", async ({ page }) => {
    await page.goto("/admin/integrations/gitlab");

    await expect(page.locator("#gitlab-token")).toBeVisible();
    await expect(page.locator("#gitlab-group")).toBeVisible();
});

test("Jira integration form renders fields", async ({ page }) => {
    await page.goto("/admin/integrations/jira");

    await expect(page.locator("#jira-url")).toBeVisible();
    await expect(page.locator("#jira-email")).toBeVisible();
    await expect(page.locator("#jira-token")).toBeVisible();
    await expect(page.locator("#jira-projects")).toBeVisible();
});

test("Linear integration form renders fields", async ({ page }) => {
    await page.goto("/admin/integrations/linear");

    await expect(page.locator("#linear-key")).toBeVisible();
    await expect(page.locator("#linear-teams")).toBeVisible();
});

test("unknown provider returns 404", async ({ page }) => {
    await page.goto("/admin/integrations/unknown");

    await expect(page.getByText(/this page could not be found/i)).toBeVisible();
});
