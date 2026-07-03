import { expect, test } from "@playwright/test";

test("sync page renders empty state with new config link", async ({ page }) => {
    await page.goto("/org/admin/sync");

    await expect(page.getByRole("heading", { name: /sync/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "New Config" })).toBeVisible();
});

test("new sync config form renders all fields", async ({ page }) => {
    await page.goto("/org/admin/sync/new");

    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#provider")).toBeVisible();
    await expect(page.locator("#credential_id")).toBeVisible();
    await expect(page.getByText(/Git Data/i)).toBeVisible();
    await expect(page.getByText(/Pull Requests/i)).toBeVisible();
});

test("creating sync config navigates back to list", async ({ page }) => {
    await page.goto("/org/admin/sync/new");

    await page.locator("#name").fill("Test Config");
    await page.locator("#provider").selectOption("github");
    await page.getByRole("button", { name: /submit|save|create/i }).click();

    await expect(page).toHaveURL(/\/org\/admin\/sync$/);
});

test("selecting discovered repos submits full names", async ({ page }) => {
    await page.goto("/org/admin/sync/new");

    await page.locator("#name").fill("Selected Repos");
    await page.locator("#provider").selectOption("github");
    await page.locator("#credential_id").selectOption("cred-github-1");
    await page.locator("#owner").fill("myorg");

    await expect(page.getByText("repo-alpha")).toBeVisible();
    await expect(page.getByText("myorg/repo-alpha")).toHaveCount(0);

    await page.getByPlaceholder("Search repositories...").fill("myorg/repo-beta");
    await expect(page.getByText("repo-beta")).toBeVisible();
    await expect(page.getByText("repo-alpha")).toHaveCount(0);

    await page.getByRole("checkbox", { name: /repo-beta/i }).check();
    await expect(page.getByText("1 of 2 selected")).toBeVisible();
    await page.getByRole("button", { name: /submit|save|create/i }).click();

    await expect(page).toHaveURL(/\/org\/admin\/sync$/);
});

test("editing sync config repositories updates selected repos", async ({ page }) => {
    await page.goto("/org/admin/sync/sync-config-edit-repos/edit");

    await expect(page.getByRole("heading", { name: /edit editable repos/i })).toBeVisible();
    await expect(page.getByText("Select Repositories")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /repo-alpha/i })).toBeChecked();

    await page.getByRole("checkbox", { name: /repo-beta/i }).check();
    await expect(page.getByText("2 of 2 selected")).toBeVisible();
    await page.getByRole("button", { name: /update configuration/i }).click();

    await expect(page).toHaveURL(/\/org\/admin\/sync$/);
});

test("sync config history exposes coverage-first job columns and results", async ({ page }) => {
    await page.goto("/org/admin/sync/sync-config-edit-repos");

    // DEV_HEALTH_TEST_MODE renders the deterministic sample config/coverage/
    // job data regardless of the configId in the URL (see [configId]/page.tsx).
    await expect(
        page.getByRole("heading", { name: "fullchaos/platform-api (sample)" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Job History" })).toBeVisible();

    const jobTable = page.getByRole("table").filter({ hasText: "Trigger" });
    for (const heading of [
        "Trigger",
        "Mode",
        "Requested range",
        "Covered range",
        "Status",
        "Scope",
        "Units",
        "Started",
        "Duration",
        "Actions",
    ]) {
        await expect(jobTable.getByRole("columnheader", { name: heading })).toBeVisible();
    }

    // Coverage-result badges derive from persisted sync_run unit counts only
    // (CHAOS-2792) — never from client-side range/interval recomputation.
    await expect(jobTable.getByRole("cell", { name: "Partial", exact: true })).toBeVisible();
    await expect(jobTable.getByRole("cell", { name: "4 done · 1 failed · 6 total" })).toBeVisible();
    await expect(jobTable.getByRole("cell", { name: "2 sources", exact: true })).toBeVisible();
    await expect(
        jobTable.getByRole("link", { name: /View run details for sync run started/ }).first(),
    ).toBeVisible();
});

test("provider selection filters sync targets", async ({ page }) => {
    await page.goto("/org/admin/sync/new");

    await page.locator("#provider").selectOption("github");
    await expect(page.getByText(/Git Data/i)).toBeVisible();
    await expect(page.getByText(/Pull Requests/i)).toBeVisible();
    await expect(page.getByText(/CI\/CD/i)).toBeVisible();
    await expect(page.getByText(/Deployments/i)).toBeVisible();

    await page.locator("#provider").selectOption("jira");
    await expect(page.getByText(/Work Items/i)).toBeVisible();
});

test("sync target checkboxes toggle", async ({ page }) => {
    await page.goto("/org/admin/sync/new");

    const checkbox = page.getByRole("checkbox").first();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
});

test("new config link navigates to creation form", async ({ page }) => {
    await page.goto("/org/admin/sync");

    await page.getByRole("link", { name: "New Config" }).click();

    await expect(page).toHaveURL(/\/org\/admin\/sync\/new/);
});
