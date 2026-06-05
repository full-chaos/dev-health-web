import { expect, test } from "@playwright/test";

test("/issues/[issue_id] renders related Work Graph entities", async ({ page }) => {
    await page.goto("/issues/PROJ-101");

    await expect(page.getByRole("heading", { name: "Related entities" })).toBeVisible();
    await expect(page.getByText("Investment theme")).toBeVisible();
    await expect(page.getByRole("link", { name: "PR-201" })).toBeVisible();
    await expect(page.getByRole("link", { name: "deploy-123" })).toBeVisible();
    await expect(page.getByText("Evidence quality").first()).toBeVisible();
    await expect(page.getByText("Provenance").first()).toBeVisible();
});

test("/prs/[pr_id] renders related Work Graph entities", async ({ page }) => {
    await page.goto("/prs/PR-201");

    await expect(page.getByRole("heading", { name: "Related entities" })).toBeVisible();
    await expect(page.getByRole("link", { name: "PROJ-101" })).toBeVisible();
    await expect(page.getByRole("link", { name: "deploy-123" })).toBeVisible();
    await expect(
        page.getByText("Incident opened inside the post-deploy observation window."),
    ).toBeVisible();
});
