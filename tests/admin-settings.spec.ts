import { expect, test, type Page } from "@playwright/test";

async function waitForSettledToast(page: Page, message: RegExp) {
    const notification = page
        .locator('[data-sonner-toast][data-mounted="true"]')
        .filter({ hasText: message })
        .last();

    await expect(notification).toBeVisible();
    await expect(notification).toHaveAttribute("data-mounted", "true");
    await expect
        .poll(async () => {
            return notification.evaluate((element) => {
                const style = getComputedStyle(element);
                const transform = new DOMMatrixReadOnly(style.transform);

                return style.opacity === "1" && transform.m41 === 0 && transform.m42 === 0;
            });
        })
        .toBe(true);

    return notification;
}

test("settings page renders all sections", async ({ page }) => {
    await page.goto("/org/admin/settings");

    await expect(page.getByRole("heading", { name: "Organization", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await expect(page.getByText("Danger Zone")).toBeVisible();
});

test("settings notifications settle below Account without obscuring responsive admin content", async ({
    page,
}, testInfo) => {
    const viewports = [
        { name: "desktop", width: 1440, height: 900 },
        { name: "mobile", width: 390, height: 844 },
    ] as const;

    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto("/org/admin/settings");

        const pageTitle = page.getByRole("heading", { name: "Organization", exact: true });
        await expect(pageTitle).toBeInViewport();

        if (viewport.name === "mobile") {
            const navigationControl = page.locator('[aria-controls="admin-navigation-panel"]');
            await expect(navigationControl).toHaveAccessibleName("Show admin navigation");
            await navigationControl.focus();
            await page.keyboard.press("Enter");
            await expect(navigationControl).toHaveAttribute("aria-expanded", "true");
            await expect(navigationControl).toHaveAccessibleName("Hide admin navigation");
            await page.keyboard.press("Escape");
            await expect(navigationControl).toBeFocused();
            await expect(navigationControl).toHaveAttribute("aria-expanded", "false");
            await expect(pageTitle).toBeInViewport();
        }

        await page.locator("#name").clear();
        await page.locator("#name").fill(`Toast ${viewport.name} organization`);
        await page.getByRole("button", { name: "Save Changes" }).click();

        const notification = await waitForSettledToast(page, /saved/i);
        const notificationRegion = page.getByRole("region", { name: /Notifications/ });
        await expect(notificationRegion).toHaveAttribute("aria-live", "polite");

        const overlapsAccount = await notification.evaluate((toastElement) => {
            const accountControl = document.querySelector('[aria-label="Account options"]');
            if (!(accountControl instanceof HTMLElement)) return true;

            const toast = toastElement.getBoundingClientRect();
            const account = accountControl.getBoundingClientRect();
            return !(
                toast.right <= account.left ||
                toast.left >= account.right ||
                toast.bottom <= account.top ||
                toast.top >= account.bottom
            );
        });
        expect(overlapsAccount).toBe(false);

        const documentWidth = await page.locator("html").evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
        }));
        expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth);

        await page.screenshot({
            path: testInfo.outputPath(`admin-toast-settled-${viewport.name}.png`),
            fullPage: true,
        });
    }
});

test("slug field is disabled", async ({ page }) => {
    await page.goto("/org/admin/settings");

    await expect(page.locator("#slug")).toBeDisabled();
});

test("billing section is visible", async ({ page }) => {
    await page.goto("/org/admin/settings");

    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Upgrade|Change Plan/i })).toBeVisible();
});

test("danger zone section is visible", async ({ page }) => {
    await page.goto("/org/admin/settings");

    await expect(page.getByText("Danger Zone")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete Organization" })).toBeVisible();
});
