import { expect, test } from "@playwright/test";

// CHAOS-6317: acr's device-approval endpoint returns HTTP 400 invalid_request
// for "no such device authorization", "wrong flow", AND "expired" alike --
// it never emits 410, and the web layer cannot tell which one happened,
// including whether the code was simply typed wrong. Before the fix,
// DeviceApprovalForm's errorState() only mapped 410 -> "expired", so a real
// 400 fell through to "pending" with a generic, unhelpful status line --
// exactly the prod symptom ("Approve doesn't go through at all"). The fix
// keeps the "pending" state (so a mistyped code stays correctable, per a
// codex review finding on the first cut of this fix) and gives the status
// line a specific, cause-agnostic message instead: it never asserts
// "expired" as fact for a case that could equally be "already used",
// "wrong flow", or a typo. This spec runs under the default `authenticated`
// Playwright project (real signed-in session, see auth.setup.ts) and proves
// the corrected behavior end to end.
const USER_CODE = "EP23TUGG";

test("a code that is no longer valid between Preview and Approve shows a clear message and stays editable, not a silent/terminal reset", async ({
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

    await expect(
        page.getByText(
            "This code is no longer valid — it may have expired, already been used, or been typed incorrectly. Check the code and try again, or return to your terminal to start over.",
        ),
    ).toBeVisible();
    // Not a terminal dead-end: back on the editable pending form, code intact.
    await expect(page.getByRole("heading", { name: "Approve device access" })).toBeVisible();
    await expect(page.getByLabel("Verification code")).toHaveValue(USER_CODE);
    await expect(page.getByRole("button", { name: "Preview request" })).toBeEnabled();
});
