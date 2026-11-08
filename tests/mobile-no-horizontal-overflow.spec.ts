import { expect, test, type Page } from "@playwright/test";

// CHAOS-12459: an `sr-only` (position: absolute) header inside an unpositioned scroll or clip box
// escapes the box and widens the document at phone width.

const screenshotDir = process.env.MOBILE_OVERFLOW_SCREENSHOT_DIR;

const PAGES: { name: string; path: string; ready: (page: Page) => Promise<void> }[] = [
    {
        name: "dashboard (ranked signals)",
        path: "/dashboard",
        ready: async (page) => {
            await expect(page.getByTestId("ranked-signals")).toBeVisible();
        },
    },
    {
        name: "org members",
        path: "/superadmin/orgs/e2e-org",
        ready: async (page) => {
            await expect(page.getByLabel("Invite email")).toBeVisible();
        },
    },
    {
        name: "audit logs",
        path: "/org/admin/audit-logs",
        ready: async (page) => {
            await expect(page.getByRole("table")).toBeVisible();
        },
    },
    {
        name: "investment overview (classification table)",
        path: "/investment?tab=overview",
        ready: async (page) => {
            await expect(page.getByTestId("classification-table")).toBeVisible();
        },
    },
    {
        name: "investment evidence table",
        path: "/investment?tab=evidence",
        ready: async (page) => {
            await expect(page.getByTestId("evidence-table-head")).toBeVisible();
        },
    },
    {
        name: "sync coverage timeline",
        path: "/org/admin/sync/sample-sync-config",
        ready: async (page) => {
            await expect(page.locator("caption.sr-only").first()).toBeAttached();
        },
    },
];

test.describe("no horizontal page overflow at 390px", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const { name, path, ready } of PAGES) {
        test(name, async ({ page }, testInfo) => {
            await page.goto(path);
            await ready(page);
            if (screenshotDir) {
                await page.screenshot({
                    path: `${screenshotDir}/${testInfo.title.replace(/\W+/gu, "-")}.png`,
                });
            }
            const widths = await page.evaluate(() => ({
                scroll: document.documentElement.scrollWidth,
                client: document.documentElement.clientWidth,
            }));
            expect(widths.scroll).toBeLessThanOrEqual(widths.client);
        });
    }
});
