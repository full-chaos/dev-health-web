import { expect, test } from "@playwright/test";

test("incident correlation page hides work graph edge codes", async ({ page }) => {
    await page.goto("/incident-correlation");

    await expect(page.getByTestId("incident-correlation-page")).toBeVisible();
    await expect(page.getByText("DEPLOYS", { exact: true })).toHaveCount(0);
    await expect(page.getByText("LINKED_INCIDENT", { exact: true })).toHaveCount(0);
});
