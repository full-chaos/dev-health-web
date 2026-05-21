import { test, expect } from "@playwright/test";

test.describe("Operating Review", () => {
  test("navigate, click first team, assert URL", async ({ page }) => {
    await page.goto("/operating-review");

    // It should render the team picker
    await expect(page.getByRole("heading", { name: "Select a team" })).toBeVisible();

    // Click the first team link
    // E.g. <a href="/operating-review?team=CHAOS&week=...">
    const teamLinks = page.locator('section:has-text("Select a team") a');
    await expect(teamLinks.first()).toBeVisible();
    
    // Get href to verify it has team and week
    const href = await teamLinks.first().getAttribute("href");
    expect(href).toMatch(/\?team=.+&week=\d{4}-\d{2}-\d{2}/);

    await teamLinks.first().click();

    // Verify URL
    await page.waitForURL(/\/operating-review\?team=.+&week=\d{4}-\d{2}-\d{2}/);

    // Context card should show the selected team (and hide picker)
    await expect(page.getByRole("heading", { name: "Select a team" })).not.toBeVisible();
  });
});
