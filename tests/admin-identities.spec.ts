import { expect, test } from "@playwright/test";

test("identities page renders empty state with add link", async ({ page }) => {
  await page.goto("/admin/identities");

  await expect(page.getByRole("heading", { name: "Identities" })).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: "Add Identity" })
      .or(page.getByRole("button", { name: "Add Identity" })),
  ).toBeVisible();
});

test("new identity form renders all fields", async ({ page }) => {
  await page.goto("/admin/identities/new");

  await expect(page.locator("#canonical_id")).toBeVisible();
  await expect(page.locator("#display_name")).toBeVisible();
  await expect(page.locator("#email")).toBeVisible();
});

test("add identity button adds provider identity row", async ({ page }) => {
  await page.goto("/admin/identities/new");

  await page.getByRole("button", { name: /\+\s*Add Identity|Add Identity/i }).click();

  await expect(page.locator("select").last()).toBeVisible();
  await expect(
    page
      .locator("input[name*='username']")
      .last()
      .or(page.locator("input[placeholder*='username' i]").last()),
  ).toBeVisible();
});

test("creating identity redirects to list", async ({ page }) => {
  await page.goto("/admin/identities/new");

  await page.locator("#canonical_id").fill("test-person");
  await page.locator("#display_name").fill("Test Person");
  await page.locator("#email").fill("test@example.com");
  await page.getByRole("button", { name: /Create Identity|Save/i }).click();

  await expect(page).toHaveURL(/\/admin\/identities/, { timeout: 10_000 });
});

test("cancel returns to identity list", async ({ page }) => {
  await page.goto("/admin/identities/new");

  await page
    .getByRole("button", { name: "Cancel" })
    .or(page.getByRole("link", { name: "Cancel" }))
    .click();

  await expect(page).toHaveURL(/\/admin\/identities/);
});
