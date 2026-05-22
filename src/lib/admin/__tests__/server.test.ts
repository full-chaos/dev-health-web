import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies BEFORE importing the module under test
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { mockAuth } from "@/test/mocks/auth";
import {
  listUsers,
  listPlatformUsers,
  createCredential,
  deleteCredential,
  listCredentials,
  testConnection,
  listAuditLogs,
  getAuditLog,
  listAuditActions,
  listIPAllowlistEntries,
  createIPAllowlistEntry,
  updateIPAllowlistEntry,
  deleteIPAllowlistEntry,
  checkIPAllowed,
  listRetentionPolicies,
  createRetentionPolicy,
  updateRetentionPolicy,
  deleteRetentionPolicy,
  executeRetentionPolicy,
  listRetentionResourceTypes,
} from "../server";

function mockSession() {
  mockAuth({ user: { id: "u-1", org_id: "org-1" } });
}

describe("admin/server credential actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  describe("listCredentials", () => {
    it("returns credentials on success", async () => {
      mockSession();
      const creds = [
        {
          id: "1",
          provider: "github",
          name: "default",
          is_active: true,
          config: {},
          last_test_at: null,
          last_test_success: null,
          last_test_error: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
      ];
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(creds), { status: 200 }));

      const result = await listCredentials();
      expect(result.data).toBeDefined();
      expect(result.error).toBeUndefined();
      fetchSpy.mockRestore();
    });

    it("returns error when not authenticated", async () => {
      mockAuth(null);
      const result = await listCredentials();
      expect(result.error).toBeDefined();
    });
  });

  describe("createCredential", () => {
    it("calls revalidatePath after successful creation", async () => {
      mockSession();
      const cred = {
        id: "1",
        provider: "github",
        name: "default",
        is_active: true,
        config: {},
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(cred), { status: 200 }));

      const result = await createCredential({ provider: "github", credentials: { token: "tok" } });
      expect(result.data).toBeDefined();
      expect(revalidatePath).toHaveBeenCalledWith("/admin/integrations", "page");
      fetchSpy.mockRestore();
    });
  });

  describe("testConnection", () => {
    it("calls revalidatePath after successful test", async () => {
      mockSession();
      const resp = { success: true, error: null, details: { user: "test" } };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

      const result = await testConnection("github", {
        name: "default",
        credentials: { token: "tok" },
      });
      expect(result.data?.success).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith("/admin/integrations", "page");
      fetchSpy.mockRestore();
    });
  });

  describe("deleteCredential", () => {
    it("calls revalidatePath after successful deletion", async () => {
      mockSession();
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }));

      const result = await deleteCredential("github", "default");
      expect(result.error).toBeUndefined();
      expect(revalidatePath).toHaveBeenCalledWith("/admin/integrations", "page");
      fetchSpy.mockRestore();
    });
  });
});

describe("admin/server user list actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  it("listUsers includes org header and q query", async () => {
    mockSession();
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    const result = await listUsers("alice");

    expect(result.error).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain("/api/v1/admin/users?q=alice");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "X-Org-Id": "org-1",
    });
    fetchSpy.mockRestore();
  });

  it("listPlatformUsers omits org header and supports q query", async () => {
    mockSession();
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    const result = await listPlatformUsers("bob");

    expect(result.error).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain("/api/v1/admin/users?q=bob");
    const headers = options?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["X-Org-Id"]).toBeUndefined();
    fetchSpy.mockRestore();
  });
});

describe("admin/server audit log actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  describe("listAuditLogs", () => {
    it("returns audit logs on success", async () => {
      mockSession();
      const resp = {
        items: [
          {
            id: "al-1",
            org_id: "org-1",
            user_id: "u-1",
            action: "user.login",
            resource_type: "user",
            resource_id: "u-1",
            description: null,
            changes: null,
            request_metadata: null,
            status: "success",
            error_message: null,
            created_at: "2025-01-01T00:00:00Z",
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

      const result = await listAuditLogs();
      expect(result.data).toBeDefined();
      expect(result.data?.items).toHaveLength(1);
      expect(result.error).toBeUndefined();
      fetchSpy.mockRestore();
    });

    it("returns error when not authenticated", async () => {
      mockAuth(null);
      const result = await listAuditLogs();
      expect(result.error).toBeDefined();
    });
  });

  describe("getAuditLog", () => {
    it("returns a single audit log on success", async () => {
      mockSession();
      const log = {
        id: "al-1",
        org_id: "org-1",
        user_id: "u-1",
        action: "user.login",
        resource_type: "user",
        resource_id: "u-1",
        description: null,
        changes: null,
        request_metadata: null,
        status: "success",
        error_message: null,
        created_at: "2025-01-01T00:00:00Z",
      };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(log), { status: 200 }));

      const result = await getAuditLog("al-1");
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe("al-1");
      fetchSpy.mockRestore();
    });
  });

  describe("listAuditActions", () => {
    it("returns available actions on success", async () => {
      mockSession();
      const actions = ["user.login", "user.logout", "credential.create"];
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(actions), { status: 200 }));

      const result = await listAuditActions();
      expect(result.data).toBeDefined();
      expect(result.data).toHaveLength(3);
      fetchSpy.mockRestore();
    });
  });
});

const mockIPEntry = {
  id: "ip-1",
  org_id: "org-1",
  ip_range: "10.0.0.0/8",
  description: "Office network",
  is_active: true,
  created_by_id: "u-1",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  expires_at: null,
};

describe("admin/server IP allowlist actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  describe("listIPAllowlistEntries", () => {
    it("returns entries on success", async () => {
      mockSession();
      const resp = { items: [mockIPEntry], total: 1, limit: 50, offset: 0 };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

      const result = await listIPAllowlistEntries();
      expect(result.data).toBeDefined();
      expect(result.data?.items).toHaveLength(1);
      expect(result.error).toBeUndefined();
      fetchSpy.mockRestore();
    });

    it("returns error when not authenticated", async () => {
      mockAuth(null);
      const result = await listIPAllowlistEntries();
      expect(result.error).toBeDefined();
    });

    it("returns human-readable error when backend returns feature gate detail", async () => {
      mockSession();
      const featureGateBody = {
        detail: {
          error: "feature_not_licensed",
          feature: "ip_allowlist",
          required_tier: "enterprise",
          current_tier: "free",
        },
      };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(featureGateBody), { status: 402 }));

      const result = await listIPAllowlistEntries();
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
      expect(result.error).toContain("enterprise");
      expect(result.error).toContain("free");
      expect(result.error).not.toContain("{");
      fetchSpy.mockRestore();
    });
  });

  describe("createIPAllowlistEntry", () => {
    it("calls revalidatePath after successful creation", async () => {
      mockSession();
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(mockIPEntry), { status: 200 }));

      const result = await createIPAllowlistEntry({
        ip_range: "10.0.0.0/8",
        description: "Office",
      });
      expect(result.data).toBeDefined();
      expect(revalidatePath).toHaveBeenCalledWith("/admin/ip-allowlist");
      fetchSpy.mockRestore();
    });
  });

  describe("updateIPAllowlistEntry", () => {
    it("calls revalidatePath after successful update", async () => {
      mockSession();
      const updated = { ...mockIPEntry, is_active: false };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }));

      const result = await updateIPAllowlistEntry("ip-1", { is_active: false });
      expect(result.data).toBeDefined();
      expect(revalidatePath).toHaveBeenCalledWith("/admin/ip-allowlist");
      fetchSpy.mockRestore();
    });
  });

  describe("deleteIPAllowlistEntry", () => {
    it("calls revalidatePath after successful deletion", async () => {
      mockSession();
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }));

      const result = await deleteIPAllowlistEntry("ip-1");
      expect(result.error).toBeUndefined();
      expect(revalidatePath).toHaveBeenCalledWith("/admin/ip-allowlist");
      fetchSpy.mockRestore();
    });
  });

  describe("checkIPAllowed", () => {
    it("returns check result on success", async () => {
      mockSession();
      const resp = { allowed: true, ip_address: "10.0.0.1" };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

      const result = await checkIPAllowed("10.0.0.1");
      expect(result.data).toBeDefined();
      expect(result.data?.allowed).toBe(true);
      fetchSpy.mockRestore();
    });
  });
});

const mockRetentionPolicy = {
  id: "rp-1",
  org_id: "org-1",
  resource_type: "audit_logs",
  retention_days: 90,
  description: "Keep audit logs for 90 days",
  is_active: true,
  last_run_at: null,
  last_run_deleted_count: null,
  next_run_at: null,
  created_by_id: "u-1",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

describe("admin/server retention policy actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  describe("listRetentionPolicies", () => {
    it("returns policies on success", async () => {
      mockSession();
      const resp = { items: [mockRetentionPolicy], total: 1, limit: 50, offset: 0 };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

      const result = await listRetentionPolicies();
      expect(result.data).toBeDefined();
      expect(result.data?.items).toHaveLength(1);
      expect(result.error).toBeUndefined();
      fetchSpy.mockRestore();
    });

    it("returns error when not authenticated", async () => {
      mockAuth(null);
      const result = await listRetentionPolicies();
      expect(result.error).toBeDefined();
    });
  });

  describe("createRetentionPolicy", () => {
    it("calls revalidatePath after successful creation", async () => {
      mockSession();
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(mockRetentionPolicy), { status: 200 }));

      const result = await createRetentionPolicy({
        resource_type: "audit_logs",
        retention_days: 90,
      });
      expect(result.data).toBeDefined();
      expect(revalidatePath).toHaveBeenCalledWith("/admin/retention");
      fetchSpy.mockRestore();
    });
  });

  describe("updateRetentionPolicy", () => {
    it("calls revalidatePath after successful update", async () => {
      mockSession();
      const updated = { ...mockRetentionPolicy, retention_days: 180 };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }));

      const result = await updateRetentionPolicy("rp-1", { retention_days: 180 });
      expect(result.data).toBeDefined();
      expect(revalidatePath).toHaveBeenCalledWith("/admin/retention");
      fetchSpy.mockRestore();
    });
  });

  describe("deleteRetentionPolicy", () => {
    it("calls revalidatePath after successful deletion", async () => {
      mockSession();
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }));

      const result = await deleteRetentionPolicy("rp-1");
      expect(result.error).toBeUndefined();
      expect(revalidatePath).toHaveBeenCalledWith("/admin/retention");
      fetchSpy.mockRestore();
    });
  });

  describe("executeRetentionPolicy", () => {
    it("returns execution result on success", async () => {
      mockSession();
      const resp = { deleted_count: 42, error: null };
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));

      const result = await executeRetentionPolicy("rp-1", true);
      expect(result.data).toBeDefined();
      expect(result.data?.deleted_count).toBe(42);
      fetchSpy.mockRestore();
    });
  });

  describe("listRetentionResourceTypes", () => {
    it("returns resource types on success", async () => {
      mockSession();
      const types = ["audit_logs", "metrics", "work_items"];
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(types), { status: 200 }));

      const result = await listRetentionResourceTypes();
      expect(result.data).toBeDefined();
      expect(result.data).toHaveLength(3);
      fetchSpy.mockRestore();
    });
  });
});
