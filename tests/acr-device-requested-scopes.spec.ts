import { expect, test } from "@playwright/test";

// CHAOS-7107: the typed-code device approval page shows the scopes the device
// grant asked for (acr's preview response `requested_scopes`), beside the code.
// A grant that asked for data:read must show data:read; a preview from an acr
// that does not send the field must show no scope list at all. Set
// SCOPES_SCREENSHOT_DIR to also write screenshots of each state.
const USER_CODE = "EP23TUGG";
const screenshotDir = process.env.SCOPES_SCREENSHOT_DIR;

async function previewWith(
    page: import("@playwright/test").Page,
    preview: Record<string, unknown>,
): Promise<void> {
    await page.route("**/api/acr/device", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(preview),
        });
    });
    await page.goto(`/acr/device?user_code=${USER_CODE}`);
    await page.getByRole("button", { name: "Preview request" }).click();
    await expect(page.getByRole("heading", { name: "Review device access" })).toBeVisible();
}

test("a grant that asked for data:read shows data:read beside the code", async ({ page }) => {
    await previewWith(page, {
        repositoryHints: [],
        requestedScopes: ["context:read", "data:read"],
    });

    const scopes = page.getByRole("list", { name: "Requested access" });
    await expect(scopes).toContainText("data:read");
    await expect(scopes).toContainText("Run direct data operations");
    await expect(scopes).toContainText("context:read");
    await expect(scopes).not.toContainText("evidence:read");
    await expect(page.getByText(USER_CODE)).toBeVisible();
    if (screenshotDir)
        await page.screenshot({ fullPage: true, path: `${screenshotDir}/after-data-read.png` });
});

test("a preview without requested scopes shows no scope list", async ({ page }) => {
    await previewWith(page, { repositoryHints: [] });

    await expect(page.getByRole("list", { name: "Requested access" })).toHaveCount(0);
    if (screenshotDir)
        await page.screenshot({ fullPage: true, path: `${screenshotDir}/before-no-scopes.png` });
});
