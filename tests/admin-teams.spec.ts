import { expect, test } from "@playwright/test";

test("teams page renders empty state with add team link", async ({ page }) => {
    await page.goto("/admin/teams");

    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    await expect(
        page
            .getByRole("link", { name: "Add Team" })
            .or(page.getByRole("button", { name: "Add Team" })),
    ).toBeVisible();
});

test("new team form renders all fields", async ({ page }) => {
    await page.goto("/admin/teams/new");

    await expect(page.locator("#team_id")).toBeVisible();
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#description")).toBeVisible();
    await expect(page.locator("#repo_patterns")).toBeVisible();
    await expect(page.locator("#project_keys")).toBeVisible();
});

test("creating team redirects to team list", async ({ page }) => {
    await page.goto("/admin/teams/new");

    await page.locator("#team_id").fill("test-team");
    await page.locator("#name").fill("Test Team");
    await page.getByRole("button", { name: "Create Team" }).click();

    await expect(page).toHaveURL(/\/admin\/teams/, { timeout: 10_000 });
});

test("team_id required validation", async ({ page }) => {
    await page.goto("/admin/teams/new");

    await page.locator("#name").fill("Test Team");
    await page.getByRole("button", { name: "Create Team" }).click();

    await expect(page.locator("#team_id:invalid")).toBeVisible();
});

test("name required validation", async ({ page }) => {
    await page.goto("/admin/teams/new");

    await page.locator("#team_id").fill("test-team");
    await page.getByRole("button", { name: "Create Team" }).click();

    await expect(page.locator("#name:invalid")).toBeVisible();
});

test("cancel returns to team list", async ({ page }) => {
    await page.goto("/admin/teams/new");

    await page
        .getByRole("button", { name: "Cancel" })
        .or(page.getByRole("link", { name: "Cancel" }))
        .click();

    await expect(page).toHaveURL(/\/admin\/teams/);
});
