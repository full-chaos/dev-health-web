import { expect, test } from "@playwright/test";

test("billing settings renders subscription section", async ({ page }) => {
    await page.goto("/admin/settings");

    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(page.getByText("Current Plan")).toBeVisible();
    await expect(page.getByText("Subscription History")).toBeVisible();
});

test("change plan modal shows plan cards instead of price ID input", async ({ page }) => {
    await page.goto("/admin/settings");

    // Wait for subscription data to load (button is disabled while loading)
    const changePlanBtn = page.getByRole("button", { name: "Change Plan" });
    await expect(changePlanBtn).toBeEnabled({ timeout: 15000 });

    // Click Change Plan button
    await changePlanBtn.click();

    // Modal should appear with plan picker, not a text input for price ID
    await expect(page.getByRole("heading", { name: "Change Plan" })).toBeVisible({
        timeout: 10000,
    });
    await expect(page.getByText("Select the plan you want to switch to.")).toBeVisible();

    // Should show plan cards fetched from billing API (Team and Enterprise from mock)
    await expect(page.getByText("Team").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Enterprise").first()).toBeVisible();

    // Should NOT have a text input for raw Stripe price ID
    await expect(page.locator('input[placeholder="price_..."]')).not.toBeVisible();

    // Should have Confirm Change button (disabled until a plan is selected)
    await expect(page.getByRole("button", { name: "Confirm Change" })).toBeDisabled();
});
