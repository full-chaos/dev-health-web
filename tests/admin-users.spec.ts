import { expect, test } from "@playwright/test";

const shotDir = process.env.ADMIN_USERS_SCREENSHOT_DIR;

test("add user form offers a role, Member first, and no password", async ({ page }) => {
    await page.goto("/org/admin/users/new");

    const role = page.getByLabel("Role");
    await expect(role).toBeVisible();
    await expect(role).toHaveValue("member");
    await expect(role.locator("option")).toHaveText(["Member", "Admin", "Viewer"]);
    await expect(page.getByLabel(/Password/u)).toHaveCount(0);
    if (shotDir) await page.screenshot({ path: `${shotDir}/invite-form.png`, fullPage: true });
});

test("invite shows the refusal sentence and stays on the form", async ({ page }) => {
    await page.goto("/org/admin/users/new");

    await page.locator("#email").fill("taken@example.com");
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(page.getByText("An invite for this email is already pending.")).toBeVisible();
    await expect(page.getByText("internal words")).toHaveCount(0);
    await expect(page).toHaveURL(/\/org\/admin\/users\/new/);
    if (shotDir) await page.screenshot({ path: `${shotDir}/invite-refused.png`, fullPage: true });
});

test("invite with a role returns to the Users list", async ({ page }) => {
    await page.goto("/org/admin/users/new");

    await page.locator("#email").fill("new.admin@example.com");
    await page.getByLabel("Role").selectOption("admin");
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(page).toHaveURL(/\/org\/admin\/users$/, { timeout: 10_000 });
    await expect(page.getByText("Invite sent to new.admin@example.com")).toBeVisible();
    if (shotDir) await page.screenshot({ path: `${shotDir}/invite-sent.png`, fullPage: true });
});
