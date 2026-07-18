import { test as setup, expect } from "@playwright/test";

const ONBOARDING_AUTH_FILE = "test-results/.auth/onboarding-state.json";
const ONBOARDING_EMAIL = "newuser@example.com";
const ONBOARDING_PASSWORD = "password123";

function sessionEmail(session: unknown): string | undefined {
    if (typeof session !== "object" || session === null) return undefined;

    const user = Reflect.get(session, "user");
    if (typeof user !== "object" || user === null) return undefined;

    const email = Reflect.get(user, "email");
    return typeof email === "string" ? email : undefined;
}

setup("authenticate as onboarding user", async ({ page }) => {
    const initialSessionResponse = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/session" &&
            response.request().method() === "GET",
    );
    await page.goto("/auth/signin");
    expect((await initialSessionResponse).ok()).toBeTruthy();

    await page.getByLabel("Email").fill(ONBOARDING_EMAIL);
    await page.getByLabel("Password").fill(ONBOARDING_PASSWORD);

    const credentialsCallbackResponse = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign In" }).click();
    expect((await credentialsCallbackResponse).ok()).toBeTruthy();

    await expect
        .poll(async () => {
            const response = await page.request.get("/api/auth/session");
            if (!response.ok()) return undefined;

            return sessionEmail(await response.json());
        })
        .toBe(ONBOARDING_EMAIL);

    await page.context().storageState({ path: ONBOARDING_AUTH_FILE });
});
