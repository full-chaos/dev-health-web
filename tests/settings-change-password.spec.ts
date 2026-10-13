import { expect, test } from "@playwright/test";

// CHAOS-9513: the signed-in user changes their own password on the Settings page. The backend is
// the repository's mock server; the real route is covered by the ops integration tests.
test("settings: change password shows the refusal, the rule names and the success", async ({
    page,
}) => {
    await page.goto("/settings");
    const form = page.getByTestId("change-password-form");
    await expect(form).toBeVisible();
    const card = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Password" }) });
    const notice = page.getByTestId("change-password-notice");

    async function submit(current: string, next: string) {
        await page.getByLabel("Current password").fill(current);
        await page.getByLabel("New password", { exact: true }).fill(next);
        await page.getByLabel("Confirm new password").fill(next);
        await form.getByRole("button", { name: "Change password" }).click();
    }

    await submit("wrong-password-1", "a-long-enough-pass-1");
    await expect(notice).toContainText("Current password verification failed");

    await submit("right-password-1", "short-pass");
    await expect(notice).toContainText("The new password was not accepted.");
    await expect(notice).toContainText("Password must be at least 12 characters long");
    await card.screenshot({ path: "test-results/change-password-refused.png" });

    await submit("right-password-1", "a-long-enough-pass-1");
    await expect(notice).toContainText("Password changed. Your other sessions were signed out.");
    await expect(page.getByLabel("Current password")).toHaveValue("");
    await card.screenshot({ path: "test-results/change-password-success.png" });
});
