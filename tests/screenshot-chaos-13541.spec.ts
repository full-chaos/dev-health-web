/**
 * CHAOS-13541 screenshot spec: the device approval page names the 256 repository-grant cap when the server refuses
 * grant_limit_exceeded, on preview and on approve, instead of the generic refusal line.
 *
 * Runs under the "authenticated" project (auth state from auth.setup.ts), test-mode (mocked backend). The device
 * API answers are routed in the browser with the route's own refusal body. Delete this file after the PR is merged.
 */
import { expect, test } from "@playwright/test";

const USER_CODE = "EP23TUGG";
const CAP =
    "This account holds more than 256 repository grants in this organization. One credential covers at most 256 repositories.";
const REFUSAL = JSON.stringify({
    error: { code: "grant_limit_exceeded", message: CAP, retryable: false },
});

for (const step of ["preview", "approve"] as const) {
    test(`device approval names the 256 cap when ${step} is refused grant_limit_exceeded`, async ({
        page,
    }) => {
        await page.route("**/api/acr/device", async (route) => {
            const body = route.request().postDataJSON() as { action: string };
            if (body.action === "preview" && step === "approve") {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ repositoryHints: [], requestedScopes: [] }),
                });
                return;
            }
            await route.fulfill({ status: 403, contentType: "application/json", body: REFUSAL });
        });

        await page.goto(`/acr/device?user_code=${USER_CODE}`);
        await page.getByRole("button", { name: "Preview request" }).click();
        if (step === "approve") {
            await expect(page.getByRole("heading", { name: "Review device access" })).toBeVisible();
            await page.getByRole("button", { name: "Confirm" }).click();
        }

        await expect(page.getByText(CAP)).toBeVisible();
        await page.screenshot({
            path: `output/chaos-13541/chaos-13541-device-${step}-grant-limit.png`,
            fullPage: true,
        });
    });
}
