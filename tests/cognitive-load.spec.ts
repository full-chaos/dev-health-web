import { expect, test } from "@playwright/test";

test.describe("Cognitive Load dashboard", () => {
  test("renders privacy-first team/repo cognitive load signals", async ({ page }) => {
    await page.goto("/cognitive-load");

    const dashboard = page.getByTestId("cognitive-load-dashboard");
    await expect(dashboard).toBeVisible();
    await expect(dashboard.getByRole("heading", { name: /Focus fragmentation, not surveillance/i })).toBeVisible();
    await expect(dashboard.getByText("PR interruption load")).toBeVisible();
    await expect(dashboard.getByText("Context spread", { exact: true })).toBeVisible();
    await expect(dashboard.getByText("Review request load", { exact: true })).toBeVisible();
    await expect(dashboard.getByText("After-hours trend", { exact: true })).toBeVisible();
    await expect(dashboard.getByText("Weekend trend", { exact: true })).toBeVisible();
  });

  test("states the no-surveillance guardrails", async ({ page }) => {
    await page.goto("/cognitive-load");

    const dashboard = page.getByTestId("cognitive-load-dashboard");
    await expect(dashboard.getByText(/No leaderboards/i)).toBeVisible();
    await expect(dashboard.getByText(/No peer rankings/i)).toBeVisible();
    await expect(dashboard.getByText(/self-reflection/i)).toBeVisible();
  });

  test("allows individual self-reflection only for the current user", async ({ page }) => {
    await page.goto("/cognitive-load?scope_type=developer&scope_id=e2e-user-1");

    const dashboard = page.getByTestId("cognitive-load-dashboard");
    await expect(dashboard.getByText(/Self-reflection mode/i)).toBeVisible();
    await expect(dashboard.getByText(/Only you can open this individual cognitive-load view/i)).toBeVisible();
    await expect(dashboard.getByText("PR interruption load")).toBeVisible();
  });

  test("blocks individual cognitive load for another person", async ({ page }) => {
    await page.goto("/cognitive-load?scope_type=developer&scope_id=other-user");

    const dashboard = page.getByTestId("cognitive-load-dashboard");
    await expect(dashboard.getByText(/Individual cognitive load is self-only/i)).toBeVisible();
    await expect(dashboard.getByRole("link", { name: /Return to team\/repo view/i })).toBeVisible();
    await expect(dashboard.getByText("PR interruption load")).not.toBeVisible();
  });
});
