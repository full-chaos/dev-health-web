import { expect, test } from "@playwright/test";

// CHAOS-12459: the Investment tables hold an sr-only "Evidence" header inside an unpositioned clip
// box. The page needs the Investment entitlement; the mock serves the scenario set here, so the
// spec runs in the serial entitlement-scenario project.
const MOCK = "http://127.0.0.1:8001";
const screenshotDir = process.env.MOBILE_OVERFLOW_SCREENSHOT_DIR;

test.describe.configure({ mode: "serial" });

test.describe("no horizontal page overflow at 390px (investment)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test.beforeEach(async ({ request }) => {
        const response = await request.post(`${MOCK}/__test/entitlements`, {
            data: { scenario: "investment-enabled" },
        });
        expect(response.ok()).toBe(true);
    });

    test.afterEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "unprovisioned" } });
    });

    for (const { name, path, testId } of [
        {
            name: "investment overview (classification table)",
            path: "/investment?tab=overview",
            testId: "classification-table",
        },
        {
            name: "investment evidence table",
            path: "/investment?tab=evidence",
            testId: "evidence-table-head",
        },
    ]) {
        test(name, async ({ page }, testInfo) => {
            await page.goto(path);
            await expect(page.getByTestId(testId)).toBeVisible();
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
