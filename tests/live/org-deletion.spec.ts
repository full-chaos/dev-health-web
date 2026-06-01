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

/**
 * Live e2e for organization deletion / offboarding (CHAOS-2020).
 *
 * Verifies, against a real dev-health-ops backend, that:
 *  - dry-run returns a deletion plan WITHOUT deleting,
 *  - a real delete removes the organization,
 *  - the offboarded user's access to the org is invalidated afterwards.
 *
 * Runs in the live-e2e suite (real backend required); skips cleanly otherwise.
 */
test.describe("organization deletion / offboarding", () => {
  test.describe.configure({ mode: "serial" });

  const email = testEmail("offboard");
  const password = "TestPass123!";
  let userToken = "";
  let superToken = "";
  let orgId = "";

  test.beforeAll(async ({ request }) => {
    const regRes = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
      data: { email, password, full_name: "Offboard User" },
      headers: { Origin: liveBackendUrl },
    });
    if (!regRes.ok()) return;

    const regData = (await regRes.json()) as Record<string, unknown>;
    const userId = (regData.user_id ?? regData.id ?? "") as string;
    superToken = (await getSuperuserToken(request)) ?? "";
    if (superToken && userId) await verifyUser(request, userId, superToken);

    const login = (await loginUser(request, email, password)) as {
      access_token?: string;
    };
    userToken = login.access_token ?? "";

    if (userToken) {
      const onboard = await request.post(`${liveBackendUrl}/api/v1/auth/onboard`, {
        headers: authHeaders(userToken),
        data: { action: "create_org", org_name: "Offboard Corp" },
      });
      if (onboard.ok()) {
        const data = (await onboard.json()) as Record<string, unknown>;
        orgId = ((data.org_id ?? data.organization_id) as string) ?? "";
      }
    }
  });

  test("dry-run returns a deletion plan without deleting", async ({ request }) => {
    if (!superToken || !orgId) {
      test.skip(true, "Backend unavailable or org not provisioned");
      return;
    }

    const res = await request.delete(`${liveBackendUrl}/api/v1/admin/orgs/${orgId}?dry_run=true`, {
      headers: authHeaders(superToken),
    });
    expect(res.status()).toBe(200);

    const plan = (await res.json()) as {
      organization_id: string;
      dry_run: boolean;
      postgres: { total: number; tables: Record<string, number> };
      disabled_jobs: number;
    };
    expect(plan.organization_id).toBe(orgId);
    expect(plan.dry_run).toBe(true);
    expect(plan.postgres.tables.organizations).toBe(1);

    // Dry-run must NOT delete: a second dry-run still sees the organization.
    const again = await request.delete(
      `${liveBackendUrl}/api/v1/admin/orgs/${orgId}?dry_run=true`,
      { headers: authHeaders(superToken) },
    );
    const againPlan = (await again.json()) as {
      postgres: { tables: Record<string, number> };
    };
    expect(againPlan.postgres.tables.organizations).toBe(1);
  });

  test("real delete removes the organization", async ({ request }) => {
    if (!superToken || !orgId) {
      test.skip(true, "Backend unavailable or org not provisioned");
      return;
    }

    const res = await request.delete(`${liveBackendUrl}/api/v1/admin/orgs/${orgId}`, {
      headers: authHeaders(superToken),
    });
    expect(res.status()).toBe(200);
    const result = (await res.json()) as { dry_run: boolean };
    expect(result.dry_run).toBe(false);

    // The organization is gone from active systems.
    const after = await request.delete(
      `${liveBackendUrl}/api/v1/admin/orgs/${orgId}?dry_run=true`,
      { headers: authHeaders(superToken) },
    );
    const afterPlan = (await after.json()) as {
      postgres: { tables: Record<string, number> };
    };
    expect(afterPlan.postgres.tables.organizations).toBe(0);
  });

  test("offboarded user's org access is invalidated", async ({ request }) => {
    if (!userToken || !orgId) {
      test.skip(true, "Backend unavailable or org not provisioned");
      return;
    }

    // The user's membership was removed; org-scoped access must no longer resolve.
    const me = await request.get(`${liveBackendUrl}/api/v1/orgs/me`, {
      headers: { ...authHeaders(userToken), "X-Org-Id": orgId },
    });
    expect(me.ok()).toBe(false);

    // Re-login: the user no longer belongs to any org → needs onboarding again.
    const relogin = (await loginUser(request, email, password)) as {
      needs_onboarding?: boolean;
    };
    expect(relogin.needs_onboarding).toBe(true);
  });
});
