import { expect, test } from "@playwright/test";

test("valid token shows success message and sign in link", async ({ page }) => {
  await page.goto("/auth/verify?token=valid-token");

  await expect(page.getByText("Email verified successfully")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("invalid token shows error message", async ({ page }) => {
  await page.goto("/auth/verify?token=bad-token");

  await expect(page.getByText("Invalid or expired verification token")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Sign in" })).toBeVisible();
});

test("missing token shows error message", async ({ page }) => {
  await page.goto("/auth/verify");

  await expect(page.getByText("Missing verification token")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Sign in" })).toBeVisible();
});

test("sign in link navigates to signin page", async ({ page }) => {
  await page.goto("/auth/verify?token=valid-token");

  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/auth\/signin/);
});
