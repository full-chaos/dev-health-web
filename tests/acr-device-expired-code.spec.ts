import { expect, test } from "@playwright/test";

// CHAOS-6317: acr's device-approval endpoint returns HTTP 400 invalid_request
// for an expired (or otherwise no-longer-usable) device code -- it never
// emits 410. Before the fix, DeviceApprovalForm's errorState() only mapped
// 410 -> "expired", so a real expired code's 400 fell through to "pending",
// silently resetting the signed-in user to the same-looking screen with a
// generic status line and the stale code still in the input -- exactly the
// prod symptom ("Approve doesn't go through at all"). This spec runs under
// the default `authenticated` Playwright project (real signed-in session,
// see auth.setup.ts) and proves the corrected behavior end to end.
const USER_CODE = "EP23TUGG";

test("a code that expires between Preview and Approve shows a clear expired state, not a silent reset", async ({
    page,
}) => {
    await page.route("**/api/acr/device", async (route) => {
        const body = route.request().postDataJSON() as { action: string };
        if (body.action === "preview") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ repositoryHints: ["full-chaos/platform"] }),
            });
            return;
        }
        // The exact shape acr's writeDeviceApprovalError sends for an
        // expired/no-longer-pending device authorization.
        await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
                error: { code: "invalid_request", message: "Device approval request is invalid" },
            }),
        });
    });

    await page.goto(`/acr/device?user_code=${USER_CODE}`);
    await expect(page.getByLabel("Verification code")).toHaveValue(USER_CODE);

    await page.getByRole("button", { name: "Preview request" }).click();
    await expect(page.getByRole("heading", { name: "Review device access" })).toBeVisible();

    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByRole("heading", { name: "Code expired" })).toBeVisible();
    await expect(
        page.getByText("This code has expired. Return to your terminal to request a new one."),
    ).toBeVisible();
});
