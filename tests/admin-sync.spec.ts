import { expect, test } from "@playwright/test";

test("sync page renders empty state with new config link", async ({ page }) => {
    await page.goto("/org/admin/sync");

    await expect(page.getByRole("heading", { name: /sync/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "New Config" })).toBeVisible();
});

test("new sync config form starts at the guided provider step", async ({ page }) => {
    await page.goto("/org/admin/sync/new");

    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#provider")).toBeVisible();
    await expect(page.locator("#credential_id")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("creating sync config walks the guided flow and navigates back to list", async ({ page }) => {
    await page.goto("/org/admin/sync/new");

    await page.locator("#name").fill("Test Config");
    await page.locator("#provider").selectOption("github");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.locator("#credential_id").selectOption("cred-github-1");
    await page.getByRole("button", { name: "Continue" }).click(); // -> scope
    await page.getByRole("button", { name: "Continue" }).click(); // -> datasets, skip owner
    await page.getByRole("button", { name: "Continue" }).click(); // -> depth/schedule
    await page.getByRole("button", { name: "Continue" }).click(); // -> review
    await page.getByRole("button", { name: /submit|save|create/i }).click();

    await expect(page).toHaveURL(/\/org\/admin\/sync$/);
});

test("selecting discovered repos submits full names", async ({ page }) => {
    await page.goto("/org/admin/sync/new");

    await page.locator("#name").fill("Selected Repos");
    await page.locator("#provider").selectOption("github");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.locator("#credential_id").selectOption("cred-github-1");
    await page.getByRole("button", { name: "Continue" }).click(); // -> scope

    await page.locator("#owner").fill("myorg");
    await expect(page.getByText("repo-alpha")).toBeVisible();
    await expect(page.getByText("myorg/repo-alpha")).toHaveCount(0);

    await page.getByPlaceholder("Search repositories...").fill("myorg/repo-beta");
    await expect(page.getByText("repo-beta")).toBeVisible();
    await expect(page.getByText("repo-alpha")).toHaveCount(0);

    await page.getByRole("checkbox", { name: /repo-beta/i }).check();
    await expect(page.getByText("1 of 2 selected")).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click(); // -> datasets
    await page.getByRole("button", { name: "Continue" }).click(); // -> depth/schedule
    await page.getByRole("button", { name: "Continue" }).click(); // -> review
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

    await expect(page).toHaveURL(/\/org\/admin\/sync\/sync-config-edit-repos\/edit$/);
    await expect(page.getByText("Config updated")).toBeVisible();
    await expect(page.getByText("2 of 2 selected")).toBeVisible();
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

    await page.locator("#name").fill("Filter Targets");
    await page.locator("#provider").selectOption("github");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator("#credential_id").selectOption("cred-github-1");
    await page.getByRole("button", { name: "Continue" }).click(); // -> scope
    await page.getByRole("button", { name: "Continue" }).click(); // -> datasets

    await expect(page.getByText(/Git Data/i)).toBeVisible();
    await expect(page.getByText(/Pull Requests/i)).toBeVisible();
    await expect(page.getByText(/CI\/CD/i)).toBeVisible();
    await expect(page.getByText(/Deployments/i)).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click(); // -> scope
    await page.getByRole("button", { name: "Back" }).click(); // -> credential
    await page.getByRole("button", { name: "Back" }).click(); // -> provider
    await page.locator("#provider").selectOption("jira");
    await page.getByRole("button", { name: "Continue" }).click();
    // No jira credential is seeded in test-mode data, so the credential step
    // offers the Create Credential affordance instead of a filled dropdown.
    await expect(page.getByRole("button", { name: "Create One Now" })).toBeVisible();
});

test("sync target checkboxes toggle", async ({ page }) => {
    await page.goto("/org/admin/sync/new");

    await page.locator("#name").fill("Toggle Targets");
    await page.locator("#provider").selectOption("github");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator("#credential_id").selectOption("cred-github-1");
    await page.getByRole("button", { name: "Continue" }).click(); // -> scope
    await page.getByRole("button", { name: "Continue" }).click(); // -> datasets

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
