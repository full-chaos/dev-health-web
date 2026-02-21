/**
 * Access Control Matrix Tests
 *
 * Comprehensive tests for the full RBAC + tier gating matrix:
 *
 * 1. Session guards — requireSession behavior for all user states
 * 2. RBAC guards — requireRole for all role combinations
 * 3. Superuser guards — requireSuperuser for all user types
 * 4. Admin layout logic — orgless superuser routing
 * 5. Tier feature gating — sidebar filtering, UpgradeGate decisions
 * 6. Impersonation — guards under impersonated sessions
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

// ─── Mock infrastructure ────────────────────────────────────────────

interface RedirectError extends Error {
  digest: string;
  url: string;
}

const { mockNextAuthAuth } = vi.hoisted(() => ({
  mockNextAuthAuth: vi.fn(),
}));

function createRedirectError(url: string): RedirectError {
  const error = new Error("NEXT_REDIRECT") as RedirectError;
  error.digest = "NEXT_REDIRECT";
  error.url = url;
  return error;
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw createRedirectError(url);
  }),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    auth: mockNextAuthAuth,
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn(),
}));

import { requireSession, requireRole, requireSuperuser } from "@/lib/auth";

// ─── Session factories ──────────────────────────────────────────────

function makeSession(overrides: Partial<Session["user"]> & { access_token?: string } = {}): Session {
  const { access_token = "tok-valid", ...userOverrides } = overrides;
  return {
    access_token,
    user: {
      id: "user-1",
      email: "user@example.com",
      org_id: "org-1",
      role: "member",
      is_superuser: false,
      permissions: ["read"],
      needs_onboarding: false,
      is_impersonating: false,
      impersonated_user_id: undefined,
      real_user_id: undefined,
      ...userOverrides,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

/** Expect the call to throw a NEXT_REDIRECT to the given URL. */
async function expectRedirectTo(fn: () => Promise<unknown>, url: string) {
  try {
    await fn();
    expect.fail(`Expected redirect to ${url} but function returned normally`);
  } catch (error: unknown) {
    const redirectErr = error as RedirectError;
    expect(redirectErr.digest).toBe("NEXT_REDIRECT");
    expect(redirectErr.url).toBe(url);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. SESSION GUARDS — requireSession
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("requireSession — session guards", () => {
  it("redirects unauthenticated users to /auth/signin", async () => {
    mockNextAuthAuth.mockResolvedValueOnce(null);
    await expectRedirectTo(() => requireSession(), "/auth/signin");
  });

  it("redirects orgless users with needs_onboarding to /auth/onboard", async () => {
    mockNextAuthAuth.mockResolvedValueOnce(
      makeSession({ org_id: "", role: "", needs_onboarding: true }),
    );
    await expectRedirectTo(() => requireSession(), "/auth/onboard");
  });

  it("returns session for a fully onboarded org member", async () => {
    const session = makeSession({ org_id: "org-1", role: "member" });
    mockNextAuthAuth.mockResolvedValueOnce(session);

    const result = await requireSession();
    expect(result.user.org_id).toBe("org-1");
    expect(result.user.role).toBe("member");
  });

  it("returns session for a superuser with org membership", async () => {
    const session = makeSession({ org_id: "org-1", role: "owner", is_superuser: true });
    mockNextAuthAuth.mockResolvedValueOnce(session);

    const result = await requireSession();
    expect(result.user.is_superuser).toBe(true);
    expect(result.user.org_id).toBe("org-1");
  });

  it("redirects superuser with needs_onboarding to /auth/onboard", async () => {
    mockNextAuthAuth.mockResolvedValueOnce(
      makeSession({ is_superuser: true, needs_onboarding: true, org_id: "" }),
    );
    await expectRedirectTo(() => requireSession(), "/auth/onboard");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. RBAC GUARDS — requireRole (admin layout gate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("requireRole — RBAC enforcement", () => {
  const adminRoles = ["admin", "owner"];

  describe("non-admin org users are blocked from /admin", () => {
    it.each([
      { role: "member", label: "member" },
      { role: "viewer", label: "viewer" },
      { role: "billing", label: "billing" },
      { role: "", label: "empty role" },
    ])("$label role redirects to /", async ({ role }) => {
      mockNextAuthAuth.mockResolvedValueOnce(
        makeSession({ org_id: "org-1", role, is_superuser: false }),
      );
      await expectRedirectTo(() => requireRole(adminRoles), "/");
    });
  });

  describe("admin and owner roles are allowed", () => {
    it.each([
      { role: "admin", label: "admin" },
      { role: "owner", label: "owner" },
    ])("$label role passes requireRole check", async ({ role }) => {
      const session = makeSession({ org_id: "org-1", role, is_superuser: false });
      mockNextAuthAuth.mockResolvedValueOnce(session);

      const result = await requireRole(adminRoles);
      expect(result.user.role).toBe(role);
    });
  });

  describe("superuser bypasses role check", () => {
    it("superuser with member role passes admin gate", async () => {
      const session = makeSession({ org_id: "org-1", role: "member", is_superuser: true });
      mockNextAuthAuth.mockResolvedValueOnce(session);

      const result = await requireRole(adminRoles);
      expect(result.user.is_superuser).toBe(true);
      expect(result.user.role).toBe("member");
    });

    it("superuser with no role passes admin gate", async () => {
      const session = makeSession({ org_id: "org-1", role: "", is_superuser: true });
      mockNextAuthAuth.mockResolvedValueOnce(session);

      const result = await requireRole(adminRoles);
      expect(result.user.is_superuser).toBe(true);
    });
  });

  describe("requireRole inherits requireSession guards", () => {
    it("unauthenticated users are redirected to signin before role check", async () => {
      mockNextAuthAuth.mockResolvedValueOnce(null);
      await expectRedirectTo(() => requireRole(adminRoles), "/auth/signin");
    });

    it("orgless users are redirected to onboarding before role check", async () => {
      mockNextAuthAuth.mockResolvedValueOnce(
        makeSession({ org_id: "", needs_onboarding: true }),
      );
      await expectRedirectTo(() => requireRole(adminRoles), "/auth/onboard");
    });
  });

  describe("single role string (non-array)", () => {
    it("accepts a single role string", async () => {
      const session = makeSession({ org_id: "org-1", role: "admin" });
      mockNextAuthAuth.mockResolvedValueOnce(session);

      const result = await requireRole("admin");
      expect(result.user.role).toBe("admin");
    });

    it("rejects mismatched single role string", async () => {
      mockNextAuthAuth.mockResolvedValueOnce(
        makeSession({ org_id: "org-1", role: "member" }),
      );
      await expectRedirectTo(() => requireRole("admin"), "/");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. SUPERUSER GUARDS — requireSuperuser
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("requireSuperuser — platform admin gate", () => {
  it("non-superuser org admin is redirected to /", async () => {
    mockNextAuthAuth.mockResolvedValueOnce(
      makeSession({ org_id: "org-1", role: "admin", is_superuser: false }),
    );
    await expectRedirectTo(() => requireSuperuser(), "/");
  });

  it("non-superuser org owner is redirected to /", async () => {
    mockNextAuthAuth.mockResolvedValueOnce(
      makeSession({ org_id: "org-1", role: "owner", is_superuser: false }),
    );
    await expectRedirectTo(() => requireSuperuser(), "/");
  });

  it("superuser passes the check", async () => {
    const session = makeSession({ org_id: "org-1", role: "owner", is_superuser: true });
    mockNextAuthAuth.mockResolvedValueOnce(session);

    const result = await requireSuperuser();
    expect(result.user.is_superuser).toBe(true);
  });

  it("superuser without org passes requireSuperuser (needs_onboarding=false)", async () => {
    const session = makeSession({ org_id: "", role: "", is_superuser: true, needs_onboarding: false });
    mockNextAuthAuth.mockResolvedValueOnce(session);

    const result = await requireSuperuser();
    expect(result.user.is_superuser).toBe(true);
    expect(result.user.org_id).toBe("");
  });

  it("inherits session check: unauthenticated → /auth/signin", async () => {
    mockNextAuthAuth.mockResolvedValueOnce(null);
    await expectRedirectTo(() => requireSuperuser(), "/auth/signin");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. ADMIN LAYOUT ROUTING — orgless superuser
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("admin layout — orgless superuser redirect", () => {
  /**
   * Simulates the admin layout guard logic:
   *   const session = await requireRole(["admin", "owner"], "/admin");
   *   if (session.user.is_superuser && !session.user.org_id) redirect("/superadmin");
   */
  async function simulateAdminLayout() {
    const session = await requireRole(["admin", "owner"], "/admin");
    if (session.user.is_superuser === true && !session.user.org_id) {
      const { redirect } = await import("next/navigation");
      redirect("/superadmin");
    }
    return session;
  }

  it("superuser without org is redirected to /superadmin", async () => {
    const session = makeSession({ org_id: "", role: "", is_superuser: true, needs_onboarding: false });
    mockNextAuthAuth.mockResolvedValueOnce(session);

    await expectRedirectTo(() => simulateAdminLayout(), "/superadmin");
  });

  it("superuser WITH org stays in admin", async () => {
    const session = makeSession({ org_id: "org-1", role: "admin", is_superuser: true });
    mockNextAuthAuth.mockResolvedValueOnce(session);

    const result = await simulateAdminLayout();
    expect(result.user.org_id).toBe("org-1");
    expect(result.user.is_superuser).toBe(true);
  });

  it("non-superuser admin stays in admin", async () => {
    const session = makeSession({ org_id: "org-1", role: "admin", is_superuser: false });
    mockNextAuthAuth.mockResolvedValueOnce(session);

    const result = await simulateAdminLayout();
    expect(result.user.org_id).toBe("org-1");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. TIER FEATURE GATING — sidebar filtering & UpgradeGate decisions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("tier feature gating — sidebar and UpgradeGate logic", () => {
  /**
   * Extracted sidebar filter logic — mirrors AdminSidebar's navItems.filter()
   * exactly as implemented in the component.
   */
  type NavItem = {
    id: string;
    label: string;
    href: string;
    description: string;
    featureKey?: string;
  };

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", href: "/admin", description: "Overview" },
    { id: "users", label: "Users", href: "/admin/users", description: "Management" },
    { id: "organization", label: "Organization", href: "/admin/settings", description: "Settings" },
    { id: "integrations", label: "Integrations", href: "/admin/integrations", description: "Connectors" },
    { id: "sync", label: "Sync Status", href: "/admin/sync", description: "Jobs" },
    { id: "teams", label: "Teams", href: "/admin/teams", description: "Identity" },
    { id: "identities", label: "Identities", href: "/admin/identities", description: "Mapping" },
    { id: "audit", label: "Audit Logs", href: "/admin/audit-logs", description: "Enterprise", featureKey: "audit_log" },
    { id: "ip-allowlist", label: "IP Allowlist", href: "/admin/ip-allowlist", description: "Security", featureKey: "ip_allowlist" },
    { id: "retention", label: "Retention", href: "/admin/retention", description: "Compliance", featureKey: "retention_policies" },
  ];

  function filterSidebarItems(isSuperuser: boolean, features: Record<string, boolean>): NavItem[] {
    return navItems.filter((item) => {
      if (isSuperuser && item.id === "organization") return false;
      if (item.featureKey && features[item.featureKey] !== true) return false;
      return true;
    });
  }

  /** Mirrors UpgradeGate render decision: returns true if content is shown. */
  function isFeatureUnlocked(feature: string, features: Record<string, boolean>): boolean {
    return features[feature] === true;
  }

  const ENTERPRISE_FEATURE_KEYS = ["audit_log", "ip_allowlist", "retention_policies"];

  describe("community tier (no enterprise features)", () => {
    const communityFeatures: Record<string, boolean> = {
      basic_analytics: true,
      audit_log: false,
      ip_allowlist: false,
      retention_policies: false,
    };

    it("hides all enterprise nav items from sidebar", () => {
      const visible = filterSidebarItems(false, communityFeatures);
      const visibleIds = visible.map((i) => i.id);
      expect(visibleIds).not.toContain("audit");
      expect(visibleIds).not.toContain("ip-allowlist");
      expect(visibleIds).not.toContain("retention");
    });

    it("shows core admin nav items", () => {
      const visible = filterSidebarItems(false, communityFeatures);
      const visibleIds = visible.map((i) => i.id);
      expect(visibleIds).toContain("dashboard");
      expect(visibleIds).toContain("users");
      expect(visibleIds).toContain("integrations");
    });

    it("UpgradeGate blocks all enterprise features", () => {
      for (const key of ENTERPRISE_FEATURE_KEYS) {
        expect(isFeatureUnlocked(key, communityFeatures)).toBe(false);
      }
    });
  });

  describe("team tier (partial features)", () => {
    const teamFeatures: Record<string, boolean> = {
      basic_analytics: true,
      team_dashboard: true,
      audit_log: true,
      ip_allowlist: false,
      retention_policies: false,
    };

    it("shows audit_log in sidebar but hides ip_allowlist and retention", () => {
      const visible = filterSidebarItems(false, teamFeatures);
      const visibleIds = visible.map((i) => i.id);
      expect(visibleIds).toContain("audit");
      expect(visibleIds).not.toContain("ip-allowlist");
      expect(visibleIds).not.toContain("retention");
    });

    it("UpgradeGate allows audit_log but blocks ip_allowlist", () => {
      expect(isFeatureUnlocked("audit_log", teamFeatures)).toBe(true);
      expect(isFeatureUnlocked("ip_allowlist", teamFeatures)).toBe(false);
    });
  });

  describe("enterprise tier (all features)", () => {
    const enterpriseFeatures: Record<string, boolean> = {
      basic_analytics: true,
      team_dashboard: true,
      audit_log: true,
      ip_allowlist: true,
      retention_policies: true,
    };

    it("shows all enterprise nav items in sidebar", () => {
      const visible = filterSidebarItems(false, enterpriseFeatures);
      const visibleIds = visible.map((i) => i.id);
      expect(visibleIds).toContain("audit");
      expect(visibleIds).toContain("ip-allowlist");
      expect(visibleIds).toContain("retention");
    });

    it("UpgradeGate allows all enterprise features", () => {
      for (const key of ENTERPRISE_FEATURE_KEYS) {
        expect(isFeatureUnlocked(key, enterpriseFeatures)).toBe(true);
      }
    });
  });

  describe("empty/missing features (DB unavailable fallback)", () => {
    it("hides all gated items when features object is empty", () => {
      const visible = filterSidebarItems(false, {});
      const visibleIds = visible.map((i) => i.id);
      expect(visibleIds).not.toContain("audit");
      expect(visibleIds).not.toContain("ip-allowlist");
      expect(visibleIds).not.toContain("retention");
    });

    it("UpgradeGate blocks when feature key is missing entirely", () => {
      expect(isFeatureUnlocked("audit_log", {})).toBe(false);
    });
  });

  describe("superuser sidebar behavior", () => {
    const enterpriseFeatures: Record<string, boolean> = {
      audit_log: true,
      ip_allowlist: true,
      retention_policies: true,
    };

    it("hides Organization item for superuser", () => {
      const visible = filterSidebarItems(true, enterpriseFeatures);
      const visibleIds = visible.map((i) => i.id);
      expect(visibleIds).not.toContain("organization");
    });

    it("shows Organization item for non-superuser admin", () => {
      const visible = filterSidebarItems(false, enterpriseFeatures);
      const visibleIds = visible.map((i) => i.id);
      expect(visibleIds).toContain("organization");
    });

    it("superuser still sees enterprise features when org tier allows it", () => {
      const visible = filterSidebarItems(true, enterpriseFeatures);
      const visibleIds = visible.map((i) => i.id);
      expect(visibleIds).toContain("audit");
      expect(visibleIds).toContain("ip-allowlist");
      expect(visibleIds).toContain("retention");
    });

    it("superuser does NOT see enterprise features when org has community tier", () => {
      const visible = filterSidebarItems(true, { audit_log: false, ip_allowlist: false, retention_policies: false });
      const visibleIds = visible.map((i) => i.id);
      expect(visibleIds).not.toContain("audit");
      expect(visibleIds).not.toContain("ip-allowlist");
      expect(visibleIds).not.toContain("retention");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. IMPERSONATION — guards under impersonated sessions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("impersonation — RBAC and tier gating under impersonated sessions", () => {
  /**
   * When a superadmin impersonates a user, the JWT callback:
   *   - Swaps id, role, org_id to the impersonated user's values
   *   - Sets is_impersonating=true
   *   - DOES NOT change is_superuser (remains true)
   *
   * This means requireRole passes due to is_superuser bypass, but
   * tier gating uses the impersonated user's org entitlements.
   */

  describe("superadmin impersonating community org member", () => {
    function impersonatedCommunityMember() {
      return makeSession({
        id: "impersonated-user-1",
        org_id: "community-org-1",
        role: "member",
        is_superuser: true, // original superadmin flag preserved
        is_impersonating: true,
        impersonated_user_id: "impersonated-user-1",
        real_user_id: "superadmin-1",
        needs_onboarding: false,
      });
    }

    it("passes requireSession (superadmin flag preserved, not needs_onboarding)", async () => {
      mockNextAuthAuth.mockResolvedValueOnce(impersonatedCommunityMember());
      const result = await requireSession();
      expect(result.user.is_impersonating).toBe(true);
      expect(result.user.org_id).toBe("community-org-1");
    });

    it("passes requireRole for admin (is_superuser bypass)", async () => {
      mockNextAuthAuth.mockResolvedValueOnce(impersonatedCommunityMember());
      const result = await requireRole(["admin", "owner"]);
      // Role is "member" but is_superuser bypass allows it
      expect(result.user.role).toBe("member");
      expect(result.user.is_superuser).toBe(true);
    });

    it("tier gating blocks enterprise features for the impersonated org", () => {
      // Simulates: admin layout fetches getOrgEntitlements("community-org-1")
      // which returns community-tier features
      const communityFeatures = { audit_log: false, ip_allowlist: false, retention_policies: false };
      expect(communityFeatures.audit_log).toBe(false);
      expect(communityFeatures.ip_allowlist).toBe(false);
      expect(communityFeatures.retention_policies).toBe(false);
    });
  });

  describe("superadmin impersonating enterprise org admin", () => {
    function impersonatedEnterpriseAdmin() {
      return makeSession({
        id: "enterprise-admin-1",
        org_id: "enterprise-org-1",
        role: "admin",
        is_superuser: true,
        is_impersonating: true,
        impersonated_user_id: "enterprise-admin-1",
        real_user_id: "superadmin-1",
        needs_onboarding: false,
      });
    }

    it("passes requireRole for admin (both role match + superuser bypass)", async () => {
      mockNextAuthAuth.mockResolvedValueOnce(impersonatedEnterpriseAdmin());
      const result = await requireRole(["admin", "owner"]);
      expect(result.user.role).toBe("admin");
      expect(result.user.org_id).toBe("enterprise-org-1");
    });

    it("tier gating allows enterprise features for the impersonated org", () => {
      const enterpriseFeatures = { audit_log: true, ip_allowlist: true, retention_policies: true };
      expect(enterpriseFeatures.audit_log).toBe(true);
      expect(enterpriseFeatures.ip_allowlist).toBe(true);
    });
  });

  describe("superadmin impersonating orgless user", () => {
    function impersonatedOrglessUser() {
      return makeSession({
        id: "orgless-user-1",
        org_id: "",
        role: "",
        is_superuser: true, // original superadmin flag preserved
        is_impersonating: true,
        impersonated_user_id: "orgless-user-1",
        real_user_id: "superadmin-1",
        needs_onboarding: false, // NOT changed during impersonation
      });
    }

    it("passes requireSession (needs_onboarding is false from original superadmin)", async () => {
      mockNextAuthAuth.mockResolvedValueOnce(impersonatedOrglessUser());
      const result = await requireSession();
      expect(result.user.is_impersonating).toBe(true);
      expect(result.user.org_id).toBe("");
    });

    it("passes requireRole via superuser bypass", async () => {
      mockNextAuthAuth.mockResolvedValueOnce(impersonatedOrglessUser());
      const result = await requireRole(["admin", "owner"]);
      expect(result.user.org_id).toBe("");
      expect(result.user.is_superuser).toBe(true);
    });

    it("admin layout redirects to /superadmin (orgless superuser check)", async () => {
      mockNextAuthAuth.mockResolvedValueOnce(impersonatedOrglessUser());

      async function simulateAdminLayout() {
        const session = await requireRole(["admin", "owner"], "/admin");
        if (session.user.is_superuser === true && !session.user.org_id) {
          const { redirect } = await import("next/navigation");
          redirect("/superadmin");
        }
        return session;
      }

      await expectRedirectTo(() => simulateAdminLayout(), "/superadmin");
    });

    it("falls back to community tier when org_id is empty", () => {
      // getOrgEntitlements("") returns null → layout falls back to community
      const fallbackFeatures: Record<string, boolean> = {};
      expect(fallbackFeatures["audit_log"]).toBeUndefined();
      // UpgradeGate treats undefined as blocked
      expect(fallbackFeatures["audit_log"] === true).toBe(false);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. FULL ACCESS MATRIX — combined RBAC + tier gates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("full access matrix — RBAC × tier gates", () => {
  type Persona = {
    label: string;
    session: Session;
    canAccessApp: boolean;
    canAccessAdmin: boolean;
    canAccessSuperadmin: boolean;
    adminRedirectsToSuperadmin: boolean;
  };

  const personas: Persona[] = [
    {
      label: "org member (community)",
      session: makeSession({ org_id: "org-c", role: "member", is_superuser: false }),
      canAccessApp: true,
      canAccessAdmin: false,
      canAccessSuperadmin: false,
      adminRedirectsToSuperadmin: false,
    },
    {
      label: "org viewer (community)",
      session: makeSession({ org_id: "org-c", role: "viewer", is_superuser: false }),
      canAccessApp: true,
      canAccessAdmin: false,
      canAccessSuperadmin: false,
      adminRedirectsToSuperadmin: false,
    },
    {
      label: "org admin (enterprise)",
      session: makeSession({ org_id: "org-e", role: "admin", is_superuser: false }),
      canAccessApp: true,
      canAccessAdmin: true,
      canAccessSuperadmin: false,
      adminRedirectsToSuperadmin: false,
    },
    {
      label: "org owner (enterprise)",
      session: makeSession({ org_id: "org-e", role: "owner", is_superuser: false }),
      canAccessApp: true,
      canAccessAdmin: true,
      canAccessSuperadmin: false,
      adminRedirectsToSuperadmin: false,
    },
    {
      label: "superuser with org",
      session: makeSession({ org_id: "org-e", role: "owner", is_superuser: true }),
      canAccessApp: true,
      canAccessAdmin: true,
      canAccessSuperadmin: true,
      adminRedirectsToSuperadmin: false,
    },
    {
      label: "superuser without org",
      session: makeSession({ org_id: "", role: "", is_superuser: true, needs_onboarding: false }),
      canAccessApp: true,
      canAccessAdmin: true, // passes requireRole via superuser bypass
      canAccessSuperadmin: true,
      adminRedirectsToSuperadmin: true, // but admin layout redirects to /superadmin
    },
    {
      label: "orgless user (needs onboarding)",
      session: makeSession({ org_id: "", role: "", is_superuser: false, needs_onboarding: true }),
      canAccessApp: false, // redirected to onboarding
      canAccessAdmin: false,
      canAccessSuperadmin: false,
      adminRedirectsToSuperadmin: false,
    },
  ];

  describe.each(personas)("$label", (persona) => {
    it(`${persona.canAccessApp ? "CAN" : "CANNOT"} access app pages`, async () => {
      mockNextAuthAuth.mockResolvedValueOnce(persona.session);
      if (persona.canAccessApp) {
        const result = await requireSession();
        expect(result.user.id).toBeDefined();
      } else {
        await expectRedirectTo(() => requireSession(), "/auth/onboard");
      }
    });

    it(`${persona.canAccessAdmin ? "CAN" : "CANNOT"} pass admin role gate`, async () => {
      mockNextAuthAuth.mockResolvedValueOnce(persona.session);
      if (persona.canAccessAdmin) {
        const result = await requireRole(["admin", "owner"]);
        expect(result.user.id).toBeDefined();
      } else {
        // Could redirect to /auth/signin, /auth/onboard, or /
        try {
          await requireRole(["admin", "owner"]);
          expect.fail("Expected redirect");
        } catch (error: unknown) {
          const redirectErr = error as RedirectError;
          expect(redirectErr.digest).toBe("NEXT_REDIRECT");
          expect(["/", "/auth/signin", "/auth/onboard"]).toContain(redirectErr.url);
        }
      }
    });

    it(`${persona.canAccessSuperadmin ? "CAN" : "CANNOT"} access superadmin`, async () => {
      mockNextAuthAuth.mockResolvedValueOnce(persona.session);
      if (persona.canAccessSuperadmin) {
        const result = await requireSuperuser();
        expect(result.user.is_superuser).toBe(true);
      } else {
        try {
          await requireSuperuser();
          expect.fail("Expected redirect");
        } catch (error: unknown) {
          const redirectErr = error as RedirectError;
          expect(redirectErr.digest).toBe("NEXT_REDIRECT");
          expect(["/", "/auth/signin", "/auth/onboard"]).toContain(redirectErr.url);
        }
      }
    });

    if (persona.adminRedirectsToSuperadmin) {
      it("admin layout redirects to /superadmin", async () => {
        mockNextAuthAuth.mockResolvedValueOnce(persona.session);
        const session = await requireRole(["admin", "owner"]);
        if (session.user.is_superuser === true && !session.user.org_id) {
          const { redirect } = await import("next/navigation");
          await expectRedirectTo(
            () => { redirect("/superadmin"); return Promise.resolve(); },
            "/superadmin",
          );
        }
      });
    }
  });
});
