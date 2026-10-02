import { expect, test } from "@playwright/test";

// CHAOS-7592: below md the shell navigation is a slide-over opened from a menu button.
// Run in CI only (it needs the signed-in stack).

test.describe("shell navigation below md", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("opens from the menu button, closes with Escape and after a navigation", async ({
        page,
    }) => {
        await page.goto("/dashboard");

        const menu = page.getByRole("button", { name: "Show navigation" });
        await expect(menu).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator("#primary-navigation-panel")).toBeHidden();

        await menu.click();
        const dialog = page.getByRole("dialog", { name: "Navigation" });
        await expect(dialog).toBeVisible();
        await expect(page.getByRole("button", { name: "Hide navigation" })).toHaveAttribute(
            "aria-expanded",
            "true",
        );

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(page.getByRole("button", { name: "Show navigation" })).toBeFocused();

        await page.getByRole("button", { name: "Show navigation" }).click();
        await page
            .getByRole("dialog", { name: "Navigation" })
            .getByRole("link", { name: "Diagnose" })
            .click();
        await expect(page).toHaveURL(/\/diagnose/);
        await expect(page.locator("#primary-navigation-panel")).toBeHidden();
    });
});

test.describe("shell navigation from md up", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("is the static sidebar and has no menu button", async ({ page }) => {
        await page.goto("/dashboard");

        await expect(page.getByRole("button", { name: /show navigation/i })).toBeHidden();
        await expect(page.locator("#primary-navigation-panel")).toBeVisible();
    });
});
