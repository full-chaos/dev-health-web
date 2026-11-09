import { expect, test } from "@playwright/test";

// The ops mock signs this admin in with an access token that ends 301 s later, inside web's 5 min
// refresh window, so the next session read refreshes it (tests/mocks/handlers.ts).
const EMAIL = "admin-refresh@devhealth.example";
const PASSWORD = "devhealth123";

test.use({ storageState: { cookies: [], origins: [] } });

test("a platform admin whose session was refreshed still opens /superadmin/billing/audit", async ({
    page,
}) => {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    const callback = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign In" }).click();
    expect((await callback).ok()).toBeTruthy();

    await expect
        .poll(async () => {
            const response = await page.request.get("/api/auth/session");
            if (!response.ok()) return undefined;
            const session = (await response.json()) as {
                user?: { email?: string; is_superuser?: boolean };
            } | null;
            return session?.user?.email === EMAIL ? session.user.is_superuser : undefined;
        })
        .toBe(true);

    await page.goto("/superadmin/billing/audit");
    await expect(page).toHaveURL(/\/superadmin\/billing\/audit$/);
    await expect(page.getByRole("heading", { name: "Billing Audit" })).toBeVisible();
});
