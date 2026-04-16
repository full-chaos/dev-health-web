import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock auth before importing the module under test
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { getSubscription, getSubscriptions, createRefund, getRefunds, getInvoices } from "../actions";
import { mockAuth } from "@/test/mocks/auth";

describe("getSubscription", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  it("returns subscription details when API succeeds", async () => {
    mockAuth();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sub-1",
          status: "active",
          stripe_subscription_id: "sub_stripe_123",
          stripe_customer_id: "cus_stripe_456",
          current_period_start: "2026-02-01T00:00:00Z",
          current_period_end: "2026-03-01T00:00:00Z",
          cancel_at_period_end: false,
          canceled_at: null,
          trial_start: null,
          trial_end: null,
        }),
        { status: 200 },
      ),
    );

    const result = await getSubscription();
    expect(result.data).toBeDefined();
    expect(result.data!.status).toBe("active");
    expect(result.data!.stripe_subscription_id).toBe("sub_stripe_123");
    expect(result.data!.current_period_end).toBe("2026-03-01T00:00:00Z");

    fetchSpy.mockRestore();
  });

  it("returns error when API returns non-ok", async () => {
    mockAuth();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not found" }), { status: 404 }),
    );

    const result = await getSubscription();
    expect(result.error).toBeDefined();
    expect(result.error).toBe("Not found");
    expect(result.data).toBeUndefined();

    fetchSpy.mockRestore();
  });

  it("returns error when not authenticated", async () => {
    mockAuth(null);

    const result = await getSubscription();
    expect(result.error).toBeDefined();
    expect(result.error).toBe("Unauthorized");
  });

  it("returns canceled subscription details", async () => {
    mockAuth();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sub-2",
          status: "canceled",
          stripe_subscription_id: "sub_stripe_789",
          stripe_customer_id: "cus_stripe_456",
          current_period_start: "2026-01-01T00:00:00Z",
          current_period_end: "2026-02-01T00:00:00Z",
          cancel_at_period_end: true,
          canceled_at: "2026-01-15T12:00:00Z",
          trial_start: null,
          trial_end: null,
        }),
        { status: 200 },
      ),
    );

    const result = await getSubscription();
    expect(result.data!.status).toBe("canceled");
    expect(result.data!.cancel_at_period_end).toBe(true);
    expect(result.data!.canceled_at).toBe("2026-01-15T12:00:00Z");

    fetchSpy.mockRestore();
  });

  it("handles fetch errors gracefully", async () => {
    mockAuth();

    const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(
      new Error("Network error"),
    );

    const result = await getSubscription();
    expect(result.error).toBeDefined();
    expect(result.error).toBe("Network error");

    fetchSpy.mockRestore();
  });

  it("passes org_id when provided", async () => {
    mockAuth({ user: { is_superuser: true } });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sub-2",
          org_id: "org-alt",
          status: "active",
          stripe_subscription_id: "sub_stripe_789",
          stripe_customer_id: "cus_stripe_456",
          current_period_start: "2026-01-01T00:00:00Z",
          current_period_end: "2026-02-01T00:00:00Z",
          cancel_at_period_end: false,
          canceled_at: null,
          trial_start: null,
          trial_end: null,
        }),
        { status: 200 },
      ),
    );

    await getSubscription("org-alt");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-ops:8000/api/v1/billing/subscriptions?org_id=org-alt",
      expect.any(Object),
    );

    fetchSpy.mockRestore();
  });

  it("loads subscription list with optional org filter", async () => {
    mockAuth({ user: { is_superuser: true } });

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

    await getSubscriptions(20, 0, "org-alt");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-ops:8000/api/v1/billing/subscriptions/list?limit=20&offset=0&org_id=org-alt",
      expect.any(Object),
    );

    fetchSpy.mockRestore();
  });
});

describe("org scoping authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  it("uses session org_id when no orgId is provided", async () => {
    mockAuth({ user: { org_id: "org-session" } });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sub-1",
          org_id: "org-session",
          status: "active",
          stripe_subscription_id: "sub_stripe_123",
          stripe_customer_id: "cus_stripe_456",
          current_period_start: "2026-02-01T00:00:00Z",
          current_period_end: "2026-03-01T00:00:00Z",
          cancel_at_period_end: false,
          canceled_at: null,
          trial_start: null,
          trial_end: null,
        }),
        { status: 200 },
      ),
    );

    await getSubscription();
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-ops:8000/api/v1/billing/subscriptions?org_id=org-session",
      expect.any(Object),
    );

    fetchSpy.mockRestore();
  });

  it("allows superuser access to another org", async () => {
    mockAuth({ user: { org_id: "org-session", is_superuser: true } });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sub-1",
          org_id: "org-alt",
          status: "active",
          stripe_subscription_id: "sub_stripe_123",
          stripe_customer_id: "cus_stripe_456",
          current_period_start: "2026-02-01T00:00:00Z",
          current_period_end: "2026-03-01T00:00:00Z",
          cancel_at_period_end: false,
          canceled_at: null,
          trial_start: null,
          trial_end: null,
        }),
        { status: 200 },
      ),
    );

    await getSubscription("org-alt");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-ops:8000/api/v1/billing/subscriptions?org_id=org-alt",
      expect.any(Object),
    );

    fetchSpy.mockRestore();
  });

  it("rejects non-superuser access to another org", async () => {
    mockAuth({ user: { org_id: "org-session", is_superuser: false } });

    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await getSubscription("org-alt");
    expect(result.error).toBe("Access denied: cannot access resources for another organization");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("allows non-superuser access to matching org", async () => {
    mockAuth({ user: { org_id: "org-session", is_superuser: false } });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sub-1",
          org_id: "org-session",
          status: "active",
          stripe_subscription_id: "sub_stripe_123",
          stripe_customer_id: "cus_stripe_456",
          current_period_start: "2026-02-01T00:00:00Z",
          current_period_end: "2026-03-01T00:00:00Z",
          cancel_at_period_end: false,
          canceled_at: null,
          trial_start: null,
          trial_end: null,
        }),
        { status: 200 },
      ),
    );

    await getSubscription("org-session");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-ops:8000/api/v1/billing/subscriptions?org_id=org-session",
      expect.any(Object),
    );

    fetchSpy.mockRestore();
  });
});

describe("refund actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
  });

  it("creates refund successfully", async () => {
    mockAuth();

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
    mockAuth();

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ detail: "Invoice not found" }), { status: 404 }));

    const result = await createRefund({ invoiceId: "invoice-missing" });

    expect(result.error).toBe("Invoice not found");
    fetchSpy.mockRestore();
  });

  it("loads refunds list", async () => {
    mockAuth();

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

  it("passes org_id to refunds and invoices queries for superadmin filtering", async () => {
    mockAuth({ user: { is_superuser: true } });

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

    await getRefunds({ limit: 20, offset: 0 }, "org-alt");
    await getInvoices(20, 0, "open", "org-alt");

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "http://test-ops:8000/api/v1/billing/refunds?limit=20&offset=0&org_id=org-alt",
      expect.any(Object),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "http://test-ops:8000/api/v1/billing/invoices?limit=20&offset=0&status=open&org_id=org-alt",
      expect.any(Object),
    );

    fetchSpy.mockRestore();
  });
});
