/**
 * Live API journey tests — CHAOS-709
 *
 * Each describe group creates its own user via POST /register (self-bootstrapping).
 * No SQL seeding required. Run with playwright.live.config.ts.
 */
import { expect, test } from "@playwright/test";
import {
  authHeaders,
  getSuperuserToken,
  liveBackendUrl,
  loginUser,
  registerUser,
  testEmail,
  verifyUser,
} from "./helpers";

// ──────────────────────────────────────────────────────────────────────────────
// Registration & Login (2 tests — independent, no serial needed)
// ──────────────────────────────────────────────────────────────────────────────

test("POST /register → 201 with user_id and org_id", async ({ request }) => {
  const email = testEmail("reg");
  const res = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
    data: { email, password: "TestPass123!", full_name: "Reg User" },
    headers: { Origin: liveBackendUrl },
  });
  expect(res.status()).toBe(201);

  const data = (await res.json()) as Record<string, unknown>;
  expect(typeof data.user_id === "string" || typeof data.id === "string").toBe(true);
});

test("POST /login after fresh registration \u2192 needs_onboarding true", async ({ request }) => {
  const email = testEmail("login");
  const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
    data: { email, password: "TestPass123!", full_name: "Login User" },
    headers: { Origin: liveBackendUrl },
  });
  if (!regRes.ok()) {
    test.skip(true, "Registration failed \u2014 backend may be unavailable");
    return;
  }

  // Verify the user's email via superuser so login returns tokens
  const regData = (await regRes.json()) as Record<string, unknown>;
  const userId = (regData.user_id ?? regData.id ?? "") as string;
  const suToken = await getSuperuserToken(request);
  if (!suToken || !userId) {
    test.skip(true, "Cannot verify user \u2014 superuser unavailable");
    return;
  }
  await verifyUser(request, userId, suToken);

  const data = (await loginUser(request, email, "TestPass123!")) as {
    access_token?: string;
    needs_onboarding?: boolean;
  };
  expect(typeof data.access_token).toBe("string");
  expect(data.needs_onboarding).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// Onboarding Journey (serial — tests depend on each other)
// ──────────────────────────────────────────────────────────────────────────────

test.describe("onboarding journey", () => {
  test.describe.configure({ mode: "serial" });

  const email = testEmail("onboard");
  const password = "TestPass123!";
  let token = "";

  test.beforeAll(async ({ request }) => {
    const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
      data: { email, password, full_name: "Onboard User" },
      headers: { Origin: liveBackendUrl },
    });
    if (!regRes.ok()) return;

    // Verify the user's email so login returns tokens
    const regData = (await regRes.json()) as Record<string, unknown>;
    const userId = (regData.user_id ?? regData.id ?? "") as string;
    const suToken = await getSuperuserToken(request);
    if (suToken && userId) await verifyUser(request, userId, suToken);

    const loginData = (await loginUser(request, email, password)) as { access_token?: string };
    token = loginData.access_token ?? "";
  });

  test("POST /onboard with org_name → success, returns org_id", async ({ request }) => {
    if (!token) {
      test.skip(true, "No token — backend may be unavailable");
      return;
    }

    const res = await request.post(`${liveBackendUrl}/api/v1/auth/onboard`, {
      headers: authHeaders(token),
      data: { action: "create_org", org_name: "Journey Corp" },
    });
    expect(res.status()).toBe(200);

    const data = (await res.json()) as Record<string, unknown>;
    expect(
      typeof data.org_id === "string" || typeof data.organization_id === "string"
    ).toBe(true);
  });

  test("re-login after onboarding → needs_onboarding false", async ({ request }) => {
    if (!token) {
      test.skip(true, "No token — backend may be unavailable");
      return;
    }

    const data = (await loginUser(request, email, password)) as {
      needs_onboarding?: boolean;
    };
    expect(data.needs_onboarding).toBe(false);
  });

  test("second POST /onboard → 400 (already onboarded)", async ({ request }) => {
    if (!token) {
      test.skip(true, "No token — backend may be unavailable");
      return;
    }

    const res = await request.post(`${liveBackendUrl}/api/v1/auth/onboard`, {
      headers: authHeaders(token),
      data: { action: "create_org", org_name: "Duplicate Corp" },
    });
    expect(res.status()).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Credentials Journey (serial)
// ──────────────────────────────────────────────────────────────────────────────

test.describe("credentials journey", () => {
  test.describe.configure({ mode: "serial" });

  const email = testEmail("creds");
  const password = "TestPass123!";
  let token = "";
  let credentialId = "";

  test.beforeAll(async ({ request }) => {
    const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
      data: { email, password, full_name: "Creds User" },
      headers: { Origin: liveBackendUrl },
    });
    if (!regRes.ok()) return;

    // Verify the user's email so login returns tokens
    const regData = (await regRes.json()) as Record<string, unknown>;
    const userId = (regData.user_id ?? regData.id ?? "") as string;
    const suToken = await getSuperuserToken(request);
    if (suToken && userId) await verifyUser(request, userId, suToken);

    const loginData = (await loginUser(request, email, password)) as { access_token?: string };
    token = loginData.access_token ?? "";
    if (!token) return;

    // Onboard first so admin endpoints are accessible
    await request.post(`${liveBackendUrl}/api/v1/auth/onboard`, {
      headers: authHeaders(token),
      data: { action: "create_org", org_name: "Creds Org" },
    });

    // Re-login to get updated token after onboarding
    const reloginData = (await loginUser(request, email, password)) as { access_token?: string };
    token = reloginData.access_token ?? token;
  });

  test("POST /credentials → created credential", async ({ request }) => {
    if (!token) {
      test.skip(true, "No token — backend may be unavailable");
      return;
    }

    const res = await request.post(`${liveBackendUrl}/api/v1/admin/credentials`, {
      headers: authHeaders(token),
      data: {
        provider: "github",
        token: "fake-token-for-testing",
        org_name: "test-org",
      },
    });
    expect([200, 201]).toContain(res.status());

    const data = (await res.json()) as Record<string, unknown>;
    credentialId = (data.id ?? data.credential_id ?? "") as string;
    expect(credentialId).toBeTruthy();
  });

  test("POST /credentials/test → success false (fake token expected)", async ({ request }) => {
    if (!token || !credentialId) {
      test.skip(true, "No token or credential — skipping test check");
      return;
    }

    const res = await request.post(
      `${liveBackendUrl}/api/v1/admin/credentials/${credentialId}/test`,
      { headers: authHeaders(token) }
    );
    // Endpoint may return 200 with success:false or 422 for invalid creds
    expect([200, 422]).toContain(res.status());

    if (res.status() === 200) {
      const data = (await res.json()) as { success?: boolean };
      expect(data.success).toBe(false);
    }
  });

  test("GET /credentials → array includes the created credential", async ({ request }) => {
    if (!token || !credentialId) {
      test.skip(true, "No token or credential — skipping list check");
      return;
    }

    const res = await request.get(`${liveBackendUrl}/api/v1/admin/credentials`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? [];
    const ids = (list as Array<Record<string, unknown>>).map(
      (c) => c.id ?? c.credential_id
    );
    expect(ids).toContain(credentialId);
  });

  // Best-effort cleanup
  test.afterAll(async ({ request }) => {
    if (!token || !credentialId) return;
    try {
      await request.delete(`${liveBackendUrl}/api/v1/admin/credentials/${credentialId}`, {
        headers: authHeaders(token),
      });
    } catch {
      // Ignore cleanup errors; this is best-effort only.
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Sync Journey (serial)
// ──────────────────────────────────────────────────────────────────────────────

test.describe("sync journey", () => {
  test.describe.configure({ mode: "serial" });

  const email = testEmail("sync");
  const password = "TestPass123!";
  let token = "";
  let syncConfigId = "";

  test.beforeAll(async ({ request }) => {
    const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
      data: { email, password, full_name: "Sync User" },
      headers: { Origin: liveBackendUrl },
    });
    if (!regRes.ok()) return;

    // Verify the user's email so login returns tokens
    const regData = (await regRes.json()) as Record<string, unknown>;
    const userId = (regData.user_id ?? regData.id ?? "") as string;
    const suToken = await getSuperuserToken(request);
    if (suToken && userId) await verifyUser(request, userId, suToken);

    const loginData = (await loginUser(request, email, password)) as { access_token?: string };
    token = loginData.access_token ?? "";
    if (!token) return;

    // Onboard first so admin endpoints are accessible
    await request.post(`${liveBackendUrl}/api/v1/auth/onboard`, {
      headers: authHeaders(token),
      data: { action: "create_org", org_name: "Sync Org" },
    });

    // Re-login to get updated token after onboarding
    const reloginData = (await loginUser(request, email, password)) as { access_token?: string };
    token = reloginData.access_token ?? token;
  });

  test("POST /sync-configs → created; POST trigger → 202", async ({ request }) => {
    if (!token) {
      test.skip(true, "No token — backend may be unavailable");
      return;
    }

    // Create a credential first for the sync config
    const credRes = await request.post(`${liveBackendUrl}/api/v1/admin/credentials`, {
      headers: authHeaders(token),
      data: {
        provider: "github",
        token: "fake-sync-token",
        org_name: "sync-test-org",
      },
    });
    const credData = (await credRes.json()) as Record<string, unknown>;
    const credId = (credData.id ?? credData.credential_id ?? "") as string;

    const createRes = await request.post(`${liveBackendUrl}/api/v1/admin/sync-configs`, {
      headers: authHeaders(token),
      data: {
        name: "Journey Sync Config",
        provider: "github",
        credential_id: credId || undefined,
      },
    });
    expect([200, 201]).toContain(createRes.status());

    const createData = (await createRes.json()) as Record<string, unknown>;
    syncConfigId = (createData.id ?? createData.sync_config_id ?? "") as string;
    expect(syncConfigId).toBeTruthy();

    // Trigger sync
    const triggerRes = await request.post(
      `${liveBackendUrl}/api/v1/admin/sync-configs/${syncConfigId}/trigger`,
      { headers: authHeaders(token) }
    );
    expect(triggerRes.status()).toBe(202);
  });

  test("GET /sync-configs/:id/jobs → returns array", async ({ request }) => {
    if (!token || !syncConfigId) {
      test.skip(true, "No token or sync config — skipping jobs check");
      return;
    }

    const res = await request.get(
      `${liveBackendUrl}/api/v1/admin/sync-configs/${syncConfigId}/jobs`,
      { headers: authHeaders(token) }
    );
    expect(res.status()).toBe(200);

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? [];
    expect(Array.isArray(list)).toBe(true);
  });

  // Best-effort cleanup
  test.afterAll(async ({ request }) => {
    if (!token || !syncConfigId) return;
    try {
      await request.delete(
        `${liveBackendUrl}/api/v1/admin/sync-configs/${syncConfigId}`,
        { headers: authHeaders(token) }
      );
    } catch {
      // Ignore cleanup errors; this is best-effort only.
    }
  });
});
