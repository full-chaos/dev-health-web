import type { APIRequestContext } from "@playwright/test";

// Backend URL resolution — mirrors impersonation.spec.ts convention
export const liveBackendUrl =
  process.env.PLAYWRIGHT_LIVE_BACKEND_URL ??
  process.env.BACKEND_URL ??
  "http://127.0.0.1:8000";

/** Generate a unique test email to avoid collisions across parallel runs. */
export function testEmail(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
}

/** Register a new user. Returns the parsed response body. */
export async function registerUser(
  request: APIRequestContext,
  email: string,
  password: string,
  name = "Test User"
): Promise<Record<string, unknown>> {
  const res = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
    data: { email, password, name },
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
