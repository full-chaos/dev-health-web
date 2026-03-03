import type { APIRequestContext } from "@playwright/test";

// Backend URL resolution — mirrors impersonation.spec.ts convention
export const liveBackendUrl =
  process.env.PLAYWRIGHT_LIVE_BACKEND_URL ??
  process.env.BACKEND_URL ??
  "http://127.0.0.1:8000";

/** Generate a unique test email to avoid collisions across parallel runs. */
export function testEmail(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/** Register a new user. Returns the parsed response body. */
export async function registerUser(
  request: APIRequestContext,
  email: string,
  password: string,
  fullName = "Test User"
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
  password: string
): Promise<Record<string, unknown>> {
  const res = await request.post(`${liveBackendUrl}/api/v1/auth/login`, {
    data: { email, password },
  });
  return (await res.json()) as Record<string, unknown>;
}

/** Build an Authorization header object from a bearer token. */
export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// Superuser credentials — set in CI secrets or use defaults for local dev
const superuserEmail = process.env.TEST_SUPERUSER_EMAIL ?? "admin@test.com";
const superuserPassword = process.env.TEST_SUPERUSER_PASSWORD ?? "secret";

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
