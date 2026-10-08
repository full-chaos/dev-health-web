import { expect, test } from "@playwright/test";

const shotDir = process.env.ADMIN_USERS_SCREENSHOT_DIR;

test("add user form offers a role, Member first", async ({ page }) => {
    await page.goto("/org/admin/users/new");

    const role = page.getByLabel("Role");
    await expect(role).toBeVisible();
    await expect(role).toHaveValue("member");
    await expect(role.locator("option")).toHaveText(["Member", "Admin", "Viewer"]);
    if (shotDir) await page.screenshot({ path: `${shotDir}/add-user-role.png`, fullPage: true });
});

test("add user shows the served error and stays on the form", async ({ page }) => {
    await page.goto("/org/admin/users/new");

    await page.locator("#email").fill("taken@example.com");
    await page.getByRole("button", { name: "Add User" }).click();

    await expect(page.getByText("User with email taken@example.com already exists")).toBeVisible();
    await expect(page).toHaveURL(/\/org\/admin\/users\/new/);
    if (shotDir) await page.screenshot({ path: `${shotDir}/add-user-error.png`, fullPage: true });
});

test("add user with a role returns to the Users list", async ({ page }) => {
    await page.goto("/org/admin/users/new");

    await page.locator("#email").fill("new.admin@example.com");
    await page.getByLabel("Role").selectOption("admin");
    await page.getByRole("button", { name: "Add User" }).click();

    await expect(page).toHaveURL(/\/org\/admin\/users$/, { timeout: 10_000 });
    await expect(page.getByText("Added new.admin@example.com")).toBeVisible();
    if (shotDir) await page.screenshot({ path: `${shotDir}/add-user-success.png`, fullPage: true });
});
