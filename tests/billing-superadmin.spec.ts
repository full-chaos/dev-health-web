import { expect, test } from "@playwright/test";

test("superadmin invoices page renders without org requirement errors", async ({ page }) => {
    await page.goto("/superadmin/billing/invoices");

    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
    await expect(page.getByText("No organization found")).toHaveCount(0);
});

test("superadmin subscriptions page renders", async ({ page }) => {
    await page.goto("/superadmin/billing/subscriptions");

    await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible();
});

test("superadmin refunds page renders", async ({ page }) => {
    await page.goto("/superadmin/billing/refunds");

    await expect(page.getByRole("heading", { name: "Refunds" })).toBeVisible();
});

test("superadmin audit page renders without no-org crash", async ({ page }) => {
    await page.goto("/superadmin/billing/audit");

    await expect(page.getByRole("heading", { name: "Billing Audit" })).toBeVisible();
    await expect(page.getByText("No organization found")).toHaveCount(0);
});
