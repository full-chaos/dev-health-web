import { expect, test } from "@playwright/test";

test("onboard page renders workspace setup form", async ({ page }) => {
  await page.goto("/auth/onboard");

  await expect(
    page.getByRole("heading", { name: "Set up your workspace" }),
  ).toBeVisible();
  await expect(page.getByLabel("Organization Name")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Workspace" }),
  ).toBeVisible();
});

test("submitting org name creates workspace and redirects to dashboard", async ({
  page,
}) => {
  await page.goto("/auth/onboard");

  await page.getByLabel("Organization Name").fill("My Test Org");
  await page.getByRole("button", { name: "Create Workspace" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
});

test("submitting blank org name still creates workspace", async ({ page }) => {
  await page.goto("/auth/onboard");

  await page.getByRole("button", { name: "Create Workspace" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
});

test("unauthenticated access redirects to signin", async ({ page }) => {
  test.use({ storageState: { cookies: [], origins: [] } });

  await page.goto("/auth/onboard");

  await expect(page).toHaveURL(/\/auth\/signin/);
});
