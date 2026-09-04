/**
 * Live E2E helpers (CHAOS-709 / CHAOS-2684).
 *
 * Two DELIBERATELY distinct actor types back the live onboarding journey:
 *   - Per-test ORGLESS new users: created fresh via {@link registerUser} with a
 *     unique {@link testEmail}. After verification they have needs_onboarding
 *     true and must walk onboarding (explicit workspace creation) before any
 *     org-scoped endpoint is reachable. New-signup specs must NOT assume a
 *     workspace exists implicitly — they call {@link onboardOrg}.
 *   - The seeded SUPERUSER admin ({@link getSuperuserToken}): a pre-provisioned
 *     platform admin used only to verify those new users. It is never conflated
 *     with the orgless test users.
 */
import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Backend URL resolution — mirrors impersonation.spec.ts convention
export const liveBackendUrl =
    process.env.PLAYWRIGHT_LIVE_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/** Generate a unique test email to avoid collisions across parallel runs. */
export function testEmail(prefix = "test"): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/** Register a new user. Returns the parsed response body. */
export async function registerUser(
    request: APIRequestContext,
    email: string,
    password: string,
    fullName = "Test User",
): Promise<Record<string, unknown>> {
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
        data: { email, password, full_name: fullName },
        headers: { Origin: liveBackendUrl },
    });
    return (await res.json()) as Record<string, unknown>;
}

/** Login a user. Returns the parsed response body (contains access_token, needs_onboarding, …). */
export async function loginUser(
    request: APIRequestContext,
    email: string,
    password: string,
): Promise<Record<string, unknown>> {
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/login`, {
        data: { email, password },
    });
    return (await res.json()) as Record<string, unknown>;
}

/**
 * Explicitly create the org/workspace for a freshly-registered user (the
 * onboarding action). New-signup specs use this so workspace creation is an
 * explicit, asserted step rather than a hidden side effect of registration.
 */
export async function onboardOrg(
    request: APIRequestContext,
    token: string,
    orgName: string,
): Promise<Record<string, unknown>> {
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/onboard`, {
        headers: authHeaders(token),
        data: { action: "create_org", org_name: orgName },
    });
    return (await res.json()) as Record<string, unknown>;
}

/** Build an Authorization header object from a bearer token. */
export function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

// Superuser credentials — set in CI secrets or use defaults for local dev
const superuserEmail = process.env.TEST_SUPERUSER_EMAIL || "admin@devhealth.example";
const superuserPassword = process.env.TEST_SUPERUSER_PASSWORD || "devhealth123";

function sessionEmail(session: unknown): string | undefined {
    if (typeof session !== "object" || session === null) return undefined;
    const user = Reflect.get(session, "user");
    if (typeof user !== "object" || user === null) return undefined;
    const email = Reflect.get(user, "email");
    return typeof email === "string" ? email : undefined;
}

/** Sign the seeded canonical user in through the real Auth.js browser flow. */
export async function signInCanonicalUser(page: Page): Promise<void> {
    await page.goto("/auth/signin");
    const initialSessionResponse = await page.request.get("/api/auth/session");
    expect(initialSessionResponse.ok()).toBe(true);

    await page.getByLabel("Email").fill(superuserEmail);
    await page.getByLabel("Password").fill(superuserPassword);
    const callbackResponse = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign In" }).click();
    expect((await callbackResponse).ok(), "The canonical acceptance user could not sign in.").toBe(
        true,
    );

    await expect
        .poll(async () => {
            const response = await page.request.get("/api/auth/session");
            if (!response.ok()) return undefined;
            return sessionEmail(await response.json());
        })
        .toBe(superuserEmail);
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/u);
}

/** Authenticate as superuser and return the access token, or null on failure. */
export async function getSuperuserToken(request: APIRequestContext): Promise<string | null> {
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/login`, {
        data: { email: superuserEmail, password: superuserPassword },
    });
    if (!res.ok()) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
}

/**
 * Mark a user as email-verified via the admin API.
 * Requires a superuser token. Returns true on success.
 */
export async function verifyUser(
    request: APIRequestContext,
    userId: string,
    superuserToken: string,
): Promise<boolean> {
    const res = await request.patch(`${liveBackendUrl}/api/v1/admin/users/${userId}`, {
        headers: authHeaders(superuserToken),
        data: { is_verified: true },
    });
    return res.ok();
}
