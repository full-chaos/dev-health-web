import { test, expect } from "@playwright/test";

// CHAOS-9708: the Teams tab churn column shows the team-keyed churn that the API serves.
test("Landscape Teams tab shows served churn per team", async ({ page }) => {
    await page.goto("/landscape?tab=teams");
    const teams = page.getByTestId("landscape-teams");
    await expect(teams).toBeVisible({ timeout: 30000 });
    const alpha = teams.getByRole("row", { name: /Team Alpha/ });
    await expect(alpha).toContainText("4,200");
    await expect(teams.getByRole("row", { name: /Team Gamma/ })).toContainText("640");
    const shots = process.env.LANDSCAPE_SHOT_PATH;
    if (shots) {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await teams.screenshot({ path: shots });
    }
});
