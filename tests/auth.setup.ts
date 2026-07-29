import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "test-results/.auth/state.json";
const TEST_EMAIL = "admin@devhealth.example";
const TEST_PASSWORD = "devhealth123";

function sessionEmail(session: unknown): string | undefined {
    if (typeof session !== "object" || session === null) return undefined;

    const user = Reflect.get(session, "user");
    if (typeof user !== "object" || user === null) return undefined;

    const email = Reflect.get(user, "email");
    return typeof email === "string" ? email : undefined;
}

setup("authenticate", async ({ page }) => {
    await page.goto("/auth/signin");
    const initialSessionResponse = await page.request.get("/api/auth/session");
    expect(initialSessionResponse.ok()).toBeTruthy();

    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill(TEST_PASSWORD);

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
        .toBe(TEST_EMAIL);

    await page.context().storageState({ path: AUTH_FILE });
});
