import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

// Mock dependencies BEFORE importing the module under test
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
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
} from "../server";

// Helper to mock auth session
function mockSession() {
  vi.mocked(auth).mockResolvedValue({
    access_token: "test-token",
    user: { id: "u-1", org_id: "org-1" },
    expires: "",
  } satisfies Session);
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
      vi.mocked(auth).mockResolvedValue(null);
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

      const result = await testConnection("github", "default", { token: "tok" });
      expect(result.data?.success).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith("/admin/integrations", "page");
      fetchSpy.mockRestore();
    });
  });

  describe("deleteCredential", () => {
    it("calls revalidatePath after successful deletion", async () => {
      mockSession();
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

      const result = await deleteCredential("github", "default");
      expect(result.error).toBeUndefined();
      expect(revalidatePath).toHaveBeenCalledWith("/admin/integrations", "page");
      fetchSpy.mockRestore();
    });
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
      vi.mocked(auth).mockResolvedValue(null);
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
      vi.mocked(auth).mockResolvedValue(null);
      const result = await listIPAllowlistEntries();
      expect(result.error).toBeDefined();
    });
  });

  describe("createIPAllowlistEntry", () => {
    it("calls revalidatePath after successful creation", async () => {
      mockSession();
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(mockIPEntry), { status: 200 }));

      const result = await createIPAllowlistEntry({ ip_range: "10.0.0.0/8", description: "Office" });
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
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

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
