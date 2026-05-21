import { test, expect } from "@playwright/test";

test.describe("Operating Review", () => {
  test("renders page header and auto-selects first synced team", async ({ page }) => {
    await page.goto("/operating-review");

    // The standard page chrome is always present (matches /investment, /quality).
    await expect(
      page.getByRole("heading", { name: "Engineering Operating Review" })
    ).toBeVisible();

    // The page reaches one of three terminal states:
    //   (a) auto-default banner — the org has teams and the URL did not pin one;
    //   (b) no-teams hint — the org has zero synced teams;
    //   (c) operating-review agenda — the URL pinned a team OR the auto-default
    //       picked one and a review payload exists.
    const defaultBanner = page.getByText(/Showing .* by default\. Use the/);
    const noTeamsHint = page.getByRole("heading", { name: "No teams synced yet" });
    const agenda = page.getByRole("heading", { name: "Recommendations" });

    await expect(defaultBanner.or(noTeamsHint).or(agenda)).toBeVisible();
  });

  test("pinned team in URL skips the auto-default banner", async ({ page }) => {
    // When ?team=X is present the page renders that team directly and does not
    // surface the "Showing <team> by default" banner — the user is in control.
    await page.goto("/operating-review?team=team-platform&week=2026-05-18");

    await expect(
      page.getByRole("heading", { name: "Engineering Operating Review" })
    ).toBeVisible();
    await expect(page.getByText(/Showing .* by default/)).toHaveCount(0);
  });
});
