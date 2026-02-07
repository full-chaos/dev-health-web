import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

// Must mock auth before importing the module under test
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { getSubscriptionDetails } from "../actions";
import { auth } from "@/lib/auth";

function mockSession(overrides: Partial<Session> & { user?: Partial<Session["user"]> } = {}): Session {
  return {
    access_token: "test-token",
    user: {
      id: "user-1",
      org_id: "org-123",
      ...overrides.user,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  };
}

describe("getSubscriptionDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("LICENSE_SVC_URL", "http://test-license-svc:3100");
    vi.stubEnv("ADMIN_API_KEY", "test-admin-key");
  });

  it("returns subscription details when API succeeds", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession());

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          org_id: "org-123",
          tier: "team",
          features: { basic_analytics: true, team_dashboard: true },
          limits: { users: 25, repos: 20, api_rate: 300 },
          expires_at: "2027-01-01T00:00:00Z",
          is_active: true,
          is_grace_period: false,
        }),
        { status: 200 },
      ),
    );

    const result = await getSubscriptionDetails();
    expect(result.data).toBeDefined();
    expect(result.data!.tier).toBe("team");
    expect(result.data!.status).toBe("active");
    expect(result.data!.features).toEqual({ basic_analytics: true, team_dashboard: true });
    expect(result.data!.current_period_end).toBe("2027-01-01T00:00:00Z");

    fetchSpy.mockRestore();
  });

  it("returns community defaults when API returns non-ok", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession());

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("Not found", { status: 404 }),
    );

    const result = await getSubscriptionDetails();
    expect(result.data).toBeDefined();
    expect(result.data!.tier).toBe("community");
    expect(result.data!.status).toBe("active");
    expect(result.data!.features).toEqual({});
    expect(result.data!.limits).toEqual({});

    fetchSpy.mockRestore();
  });

  it("returns error when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const result = await getSubscriptionDetails();
    expect(result.error).toBeDefined();
    expect(result.error).toBe("Unauthorized");
  });

  it("maps grace period to past_due status", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession());

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tier: "team",
          is_active: true,
          is_grace_period: true,
          features: {},
          limits: {},
          expires_at: "2026-01-01T00:00:00Z",
        }),
        { status: 200 },
      ),
    );

    const result = await getSubscriptionDetails();
    expect(result.data!.status).toBe("past_due");

    fetchSpy.mockRestore();
  });

  it("returns error when no organization ID", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession({ user: { id: "user-1", org_id: undefined } }));

    const result = await getSubscriptionDetails();
    expect(result.error).toBeDefined();
    expect(result.error).toBe("No organization ID");
  });

  it("handles fetch errors gracefully", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession());

    const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(
      new Error("Network error"),
    );

    const result = await getSubscriptionDetails();
    expect(result.error).toBeDefined();
    expect(result.error).toBe("Network error");

    fetchSpy.mockRestore();
  });
});
