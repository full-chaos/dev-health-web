import { expect, test } from "@playwright/test";

test("invoice list renders and void flow works", async ({ page }) => {
  await page.goto("/superadmin/billing/invoices");

  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await expect(page.getByText("in_e2e_001")).toBeVisible();
  await expect(page.getByText("$120.00")).toBeVisible();

  await page.getByRole("button", { name: "View" }).first().click();
  await expect(page.getByRole("heading", { name: "Invoice Details" })).toBeVisible();
  await expect(page.getByText("Team plan")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Void" }).first().click();
  await expect(page.getByRole("heading", { name: "Void Invoice" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Void" }).click();

  await expect(page.getByText("Invoice voided")).toBeVisible();
  await expect(page.getByText("void").first()).toBeVisible();
});
