"use server";

import { auth } from "@/lib/auth";

// Types
type CheckoutResponse = { session_id: string; checkout_url: string };
type ActionResult<T> = { data: T; error?: never } | { data?: never; error: string };

export type RefundStatus = "pending" | "succeeded" | "failed" | "canceled";

export type RefundRecord = {
  id: string;
  org_id: string;
  invoice_id: string | null;
  subscription_id: string | null;
  stripe_refund_id: string;
  stripe_charge_id: string;
  stripe_payment_intent_id: string | null;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  description: string | null;
  failure_reason: string | null;
  initiated_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

type RefundListResponse = {
  items: RefundRecord[];
  total: number;
  limit: number;
  offset: number;
};

function getBackendUrl(): string {
  return process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
}

// Server action: Create Stripe checkout session
export async function createCheckoutSession(
  tier: "team" | "enterprise"
): Promise<ActionResult<CheckoutResponse>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }
    const orgId = session.user?.org_id;
    if (!orgId) {
      return { error: "No organization ID" };
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const res = await fetch(`${getBackendUrl()}/api/v1/billing/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        tier,
        success_url: `${baseUrl}/admin/settings?billing=success`,
        cancel_url: `${baseUrl}/admin/settings?billing=cancelled`,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Checkout failed (${res.status})` };
    }

    const data = await res.json();
    return { data: { session_id: data.session_id, checkout_url: data.url } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// Server action: Create billing portal session (for subscription management)
export async function createPortalSession(): Promise<ActionResult<{ portal_url: string }>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }
    const orgId = session.user?.org_id;
    if (!orgId) {
      return { error: "No organization ID" };
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const returnUrl = encodeURIComponent(`${baseUrl}/admin/settings`);
    const res = await fetch(
      `${getBackendUrl()}/api/v1/billing/portal?return_url=${returnUrl}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );

    if (!res.ok) {
      if (res.status === 404) {
        return { error: "No billing account found for this organization." };
      }
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Portal session failed (${res.status})` };
    }

    const data = await res.json();
    return { data: { portal_url: data.url } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type SubscriptionDetails = {
  tier: string;
  status: "active" | "canceled" | "past_due" | "trialing" | "unknown";
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  features: Record<string, boolean>;
  limits: Record<string, number>;
};

export async function getSubscriptionDetails(): Promise<ActionResult<SubscriptionDetails>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }
    const orgId = session.user?.org_id;
    if (!orgId) {
      return { error: "No organization ID" };
    }

    const res = await fetch(
      `${getBackendUrl()}/api/v1/billing/entitlements/${orgId}`,
      { next: { revalidate: 60 } },
    );

    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: detail.detail || `Failed to load billing details (${res.status})` };
    }

    const entitlements = await res.json();
    const effectiveTier = entitlements.tier ?? "community";
    const isFreeTier = effectiveTier === "community" || effectiveTier === "free";
    return {
      data: {
        tier: effectiveTier,
        status: isFreeTier
          ? "active"
          : entitlements.is_licensed
            ? entitlements.in_grace_period
              ? "past_due"
              : "active"
            : "canceled",
        current_period_end: entitlements.current_period_end ?? null,
        cancel_at_period_end: entitlements.cancel_at_period_end ?? false,
        features: entitlements.features ?? {},
        limits: entitlements.limits ?? {},
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function createRefund(input: {
  invoiceId: string;
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  description?: string;
}): Promise<ActionResult<RefundRecord>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const payload: Record<string, unknown> = {
      invoice_id: input.invoiceId,
      reason: input.reason,
      description: input.description,
    };
    if (typeof input.amount === "number") {
      payload.amount = input.amount;
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/refunds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: detail.detail || `Refund failed (${res.status})` };
    }

    const data = (await res.json()) as RefundRecord;
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function getRefunds(input?: {
  limit?: number;
  offset?: number;
}): Promise<ActionResult<RefundListResponse>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const params = new URLSearchParams();
    if (typeof input?.limit === "number") {
      params.set("limit", String(input.limit));
    }
    if (typeof input?.offset === "number") {
      params.set("offset", String(input.offset));
    }

    const query = params.toString();
    const res = await fetch(
      `${getBackendUrl()}/api/v1/billing/refunds${query ? `?${query}` : ""}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: detail.detail || `Unable to load refunds (${res.status})` };
    }

    const data = (await res.json()) as RefundListResponse;
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
