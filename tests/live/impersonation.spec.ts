import { expect, test, type APIRequestContext } from "@playwright/test";

const liveBackendUrl =
  process.env.PLAYWRIGHT_LIVE_BACKEND_URL ??
  process.env.BACKEND_URL ??
  "http://127.0.0.1:8000";

const superuserEmail = process.env.TEST_SUPERUSER_EMAIL ?? "admin@test.com";
const superuserPassword = process.env.TEST_SUPERUSER_PASSWORD ?? "secret";
const targetUserId = process.env.TEST_TARGET_USER_ID ?? "";
const superuserTargetUserId = process.env.TEST_SUPERUSER_TARGET_USER_ID ?? "";

/** Authenticate as superuser and return the access token, or null on failure. */
async function getSuperuserToken(request: APIRequestContext): Promise<string | null> {
  const res = await request.post(`${liveBackendUrl}/api/v1/auth/login`, {
    data: { email: superuserEmail, password: superuserPassword },
  });
  if (!res.ok()) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Sanity checks
// ──────────────────────────────────────────────────────────────────────────────

test("backend health is reachable", async ({ request }) => {
  const response = await request.get(`${liveBackendUrl}/health`);
  expect(response.status()).toBe(200);

  const payload = (await response.json()) as { status?: string };
  expect(payload.status).toBe("ok");
});

test("superuser login returns access_token with needs_onboarding false", async ({ request }) => {
  const res = await request.post(`${liveBackendUrl}/api/v1/auth/login`, {
    data: { email: superuserEmail, password: superuserPassword },
  });
  expect(res.ok()).toBe(true);

  const data = (await res.json()) as {
    access_token?: string;
    needs_onboarding?: boolean;
  };
  expect(data.access_token).toBeDefined();
  expect(typeof data.access_token).toBe("string");
  expect(data.needs_onboarding).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// Pre-impersonation status check (independent)
// ──────────────────────────────────────────────────────────────────────────────

test("impersonation status is false when not impersonating", async ({ request }) => {
  const token = await getSuperuserToken(request);
  if (!token) {
    test.skip(true, "Could not obtain superuser token — backend may be unavailable");
    return;
  }

  const res = await request.get(`${liveBackendUrl}/api/v1/admin/impersonate/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);

  const data = (await res.json()) as {
    is_impersonating: boolean;
    target_user_id?: string | null;
  };
  expect(data.is_impersonating).toBe(false);
  expect(data.target_user_id == null).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// Impersonation lifecycle (start → status → stop) — must run in order
// ──────────────────────────────────────────────────────────────────────────────

test.describe("impersonation lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  let superuserToken: string | null = null;

  test.beforeAll(async ({ request }) => {
    superuserToken = await getSuperuserToken(request);
  });

  test("start impersonation returns active status without access_token", async ({ request }) => {
    if (!targetUserId) {
      test.skip(true, "TEST_TARGET_USER_ID not set — skipping start impersonation test");
      return;
    }
    const token = superuserToken;
    if (!token) {
      test.skip(true, "Could not obtain superuser token");
      return;
    }

    const res = await request.post(`${liveBackendUrl}/api/v1/admin/impersonate`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { target_user_id: targetUserId },
    });
    expect(res.status()).toBe(200);

    const data = (await res.json()) as {
      status?: string;
      target_user?: { id: string; email: string; org_id: string; role: string };
      expires_at?: string;
      access_token?: unknown;
    };
    expect(data.status).toBe("active");
    expect(data.target_user).toBeDefined();
    expect(data.target_user?.id).toBe(targetUserId);
    expect(data.expires_at).toBeDefined();
    // Response must NOT expose an access_token field
    expect("access_token" in data).toBe(false);
  });

  test("impersonation status is true while impersonating", async ({ request }) => {
    if (!targetUserId) {
      test.skip(true, "TEST_TARGET_USER_ID not set — skipping impersonation active status check");
      return;
    }
    const token = superuserToken;
    if (!token) {
      test.skip(true, "Could not obtain superuser token");
      return;
    }

    const res = await request.get(`${liveBackendUrl}/api/v1/admin/impersonate/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);

    const data = (await res.json()) as {
      is_impersonating: boolean;
      target_user_id?: string | null;
      expires_at?: string | null;
    };
    expect(data.is_impersonating).toBe(true);
    expect(data.target_user_id).toBe(targetUserId);
    expect(data.expires_at).toBeDefined();
  });

  test("stop impersonation returns stopped status", async ({ request }) => {
    if (!targetUserId) {
      test.skip(true, "TEST_TARGET_USER_ID not set — skipping stop impersonation test");
      return;
    }
    const token = superuserToken;
    if (!token) {
      test.skip(true, "Could not obtain superuser token");
      return;
    }

    const res = await request.post(`${liveBackendUrl}/api/v1/admin/impersonate/stop`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);

    const data = (await res.json()) as { status?: string };
    expect(data.status).toBe("stopped");
  });

  // Best-effort cleanup to avoid leaving the backend in an impersonating state
  test.afterAll(async ({ request }) => {
    if (!superuserToken) {
      return;
    }
    try {
      await request.post(`${liveBackendUrl}/api/v1/admin/impersonate/stop`, {
        headers: { Authorization: `Bearer ${superuserToken}` },
      });
    } catch {
      // Ignore cleanup errors; this is best-effort only.
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Error cases
// ──────────────────────────────────────────────────────────────────────────────

test("cannot impersonate another superuser — expects 403", async ({ request }) => {
  if (!superuserTargetUserId) {
    test.skip(
      true,
      "TEST_SUPERUSER_TARGET_USER_ID not set — skipping superuser-to-superuser impersonation test"
    );
    return;
  }

  const token = await getSuperuserToken(request);
  if (!token) {
    test.skip(true, "Could not obtain superuser token");
    return;
  }

  const res = await request.post(`${liveBackendUrl}/api/v1/admin/impersonate`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { target_user_id: superuserTargetUserId },
  });
  expect(res.status()).toBe(403);
});

test("unauthenticated request to impersonate endpoint is rejected", async ({ request }) => {
  if (!targetUserId) {
    test.skip(true, "TEST_TARGET_USER_ID not set — skipping unauthenticated impersonation test");
    return;
  }

  // No Authorization header — should be rejected with 401 or 403
  const res = await request.post(`${liveBackendUrl}/api/v1/admin/impersonate`, {
    data: { target_user_id: targetUserId },
  });
  expect([401, 403]).toContain(res.status());
});
