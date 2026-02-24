import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

// Must mock auth before importing the module under test
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { createRefund, getRefunds, getSubscriptionDetails } from "../actions";
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
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  it("returns subscription details when API succeeds", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession());

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tier: "team",
          features: { basic_analytics: true, team_dashboard: true },
          limits: { users: 25, repos: 20, api_rate: 300 },
          is_licensed: true,
          in_grace_period: false,
        }),
        { status: 200 },
      ),
    );

    const result = await getSubscriptionDetails();
    expect(result.data).toBeDefined();
    expect(result.data!.tier).toBe("team");
    expect(result.data!.status).toBe("active");
    expect(result.data!.features).toEqual({ basic_analytics: true, team_dashboard: true });
    expect(result.data!.current_period_end).toBeNull();

    fetchSpy.mockRestore();
  });

  it("returns error when API returns non-ok", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession());

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not found" }), { status: 404 }),
    );

    const result = await getSubscriptionDetails();
    expect(result.error).toBeDefined();
    expect(result.error).toBe("Not found");
    expect(result.data).toBeUndefined();

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
          is_licensed: true,
          in_grace_period: true,
          features: {},
          limits: {},
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

describe("refund actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  it("creates refund successfully", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession());

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "refund-1",
          org_id: "org-123",
          invoice_id: "invoice-1",
          subscription_id: null,
          stripe_refund_id: "re_123",
          stripe_charge_id: "ch_123",
          stripe_payment_intent_id: "pi_123",
          amount: 500,
          currency: "usd",
          status: "pending",
          reason: "requested_by_customer",
          description: "Customer asked",
          failure_reason: null,
          initiated_by: null,
          metadata: {},
          created_at: null,
          updated_at: null,
        }),
        { status: 200 },
      ),
    );

    const result = await createRefund({
      invoiceId: "invoice-1",
      amount: 500,
      reason: "requested_by_customer",
    });

    expect(result.data?.stripe_refund_id).toBe("re_123");
    fetchSpy.mockRestore();
  });

  it("returns refund creation error", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession());

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ detail: "Invoice not found" }), { status: 404 }));

    const result = await createRefund({ invoiceId: "invoice-missing" });

    expect(result.error).toBe("Invoice not found");
    fetchSpy.mockRestore();
  });

  it("loads refunds list", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession());

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          total: 0,
          limit: 20,
          offset: 0,
        }),
        { status: 200 },
      ),
    );

    const result = await getRefunds({ limit: 20, offset: 0 });

    expect(result.data?.total).toBe(0);
    fetchSpy.mockRestore();
  });
});
