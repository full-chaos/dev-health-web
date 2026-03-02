import { expect, test } from "@playwright/test";

test("sync page renders empty state with new config link", async ({ page }) => {
  await page.goto("/admin/sync");

  await expect(page.getByRole("heading", { name: /sync/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "New Config" })).toBeVisible();
});

test("new sync config form renders all fields", async ({ page }) => {
  await page.goto("/admin/sync/new");

  await expect(page.locator("#name")).toBeVisible();
  await expect(page.locator("#provider")).toBeVisible();
  await expect(page.locator("#credential_id")).toBeVisible();
  await expect(page.getByText("git")).toBeVisible();
  await expect(page.getByText("prs")).toBeVisible();
});

test("creating sync config navigates back to list", async ({ page }) => {
  await page.goto("/admin/sync/new");

  await page.locator("#name").fill("Test Config");
  await page.locator("#provider").selectOption("github");
  await page.getByRole("button", { name: /submit|save|create/i }).click();

  await expect(page).toHaveURL(/\/admin\/sync$/);
});

test("provider selection filters sync targets", async ({ page }) => {
  await page.goto("/admin/sync/new");

  await page.locator("#provider").selectOption("github");
  await expect(page.getByText("git")).toBeVisible();
  await expect(page.getByText("prs")).toBeVisible();
  await expect(page.getByText("cicd")).toBeVisible();
  await expect(page.getByText("deployments")).toBeVisible();

  await page.locator("#provider").selectOption("jira");
  await expect(page.getByText("work-items")).toBeVisible();
});

test("sync target checkboxes toggle", async ({ page }) => {
  await page.goto("/admin/sync/new");

  const checkbox = page.getByRole("checkbox").first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
});

test("new config link navigates to creation form", async ({ page }) => {
  await page.goto("/admin/sync");

  await page.getByRole("link", { name: "New Config" }).click();

  await expect(page).toHaveURL(/\/admin\/sync\/new/);
});
