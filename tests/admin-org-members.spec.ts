import { expect, test } from "@playwright/test";

const shotDir = process.env.ADMIN_USERS_SCREENSHOT_DIR;

test("org page lists members with invite, remove and make-owner controls", async ({ page }) => {
    await page.goto("/superadmin/orgs/e2e-org");

    await expect(page.getByLabel("Invite email")).toBeVisible();
    await expect(page.getByLabel("Invite role").locator("option")).toHaveText([
        "member",
        "admin",
        "viewer",
    ]);
    await expect(page.getByRole("button", { name: "Remove ada@example.com" })).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Make ada@example.com the owner" }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Make grace@example.com the owner" }),
    ).toHaveCount(0);
    if (shotDir) await page.screenshot({ path: `${shotDir}/org-members.png`, fullPage: true });
});

test("remove asks for a confirm, then shows the server sentence for a refusal", async ({
    page,
}) => {
    await page.goto("/superadmin/orgs/e2e-org");

    await page.getByRole("button", { name: "Remove grace@example.com" }).click();
    await expect(
        page.getByRole("button", { name: "Confirm remove grace@example.com" }),
    ).toBeVisible();
    if (shotDir)
        await page.screenshot({ path: `${shotDir}/org-members-confirm.png`, fullPage: true });
    await page.getByRole("button", { name: "Confirm remove grace@example.com" }).click();

    await expect(page.getByText("This is the last owner. Name another owner first.")).toBeVisible();
    await expect(page.getByText("internal words")).toHaveCount(0);
    if (shotDir)
        await page.screenshot({ path: `${shotDir}/org-members-refused.png`, fullPage: true });
});

test("invite from the org page shows a sent toast", async ({ page }) => {
    await page.goto("/superadmin/orgs/e2e-org");

    await page.getByLabel("Invite email").fill("new.person@example.com");
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText("Invite sent")).toBeVisible();
});
