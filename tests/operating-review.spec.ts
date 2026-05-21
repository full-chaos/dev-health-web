import { test, expect } from "@playwright/test";

test.describe("Operating Review", () => {
  test("navigate, click first team, assert URL", async ({ page }) => {
    await page.goto("/operating-review");

    // The page renders either:
    //   (a) the team picker with 'Select a team' heading + team links, OR
    //   (b) the empty 'No teams synced yet' state when catalog has no team values.
    // The picker behavior is the contract; the empty state is acceptable in
    // environments without seeded team data.
    const heading = page.getByRole("heading", { name: "Select a team" });
    const emptyState = page.getByText("No teams synced yet");
    await expect(heading.or(emptyState)).toBeVisible();

    if (await emptyState.isVisible().catch(() => false)) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "catalog has no teams; picker click path not exercised",
      });
      return;
    }

    // Picker path: click the first team and verify the URL params.
    const teamLinks = page.locator('section:has-text("Select a team") a');
    await expect(teamLinks.first()).toBeVisible();

    const href = await teamLinks.first().getAttribute("href");
    expect(href).toMatch(/\?team=.+&week=\d{4}-\d{2}-\d{2}/);

    await teamLinks.first().click();
    await page.waitForURL(/\/operating-review\?team=.+&week=\d{4}-\d{2}-\d{2}/);
    await expect(heading).not.toBeVisible();
  });
});
