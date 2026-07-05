import { expect, test } from "@playwright/test";

test("settings page renders all sections", async ({ page }) => {
    await page.goto("/org/admin/settings");

    await expect(page.getByRole("heading", { name: "Organization Settings" })).toBeVisible();
    await expect(page.getByText("Profile")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await expect(page.getByText("Danger Zone")).toBeVisible();
});

test("updating org name shows success toast", async ({ page }) => {
    await page.goto("/org/admin/settings");

    await page.locator("#name").clear();
    await page.locator("#name").fill("Updated Org Name");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 });
});

test("slug field is disabled", async ({ page }) => {
    await page.goto("/org/admin/settings");

    await expect(page.locator("#slug")).toBeDisabled();
});

test("billing section is visible", async ({ page }) => {
    await page.goto("/org/admin/settings");

    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Upgrade|Change Plan/i })).toBeVisible();
});

test("danger zone section is visible", async ({ page }) => {
    await page.goto("/org/admin/settings");

    await expect(page.getByText("Danger Zone")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete Organization" })).toBeVisible();
});
