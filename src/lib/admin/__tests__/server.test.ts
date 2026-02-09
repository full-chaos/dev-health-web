import { beforeEach, describe, expect, it, vi } from "vitest";

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
} from "../server";

// Helper to mock auth session
function mockSession() {
  vi.mocked(auth).mockResolvedValue({
    access_token: "test-token",
    user: { org_id: "org-1" },
  } as any);
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
      vi.mocked(auth).mockResolvedValue(null as any);
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
