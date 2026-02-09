"use server";

import { auth } from "@/lib/auth";

// Types
type CheckoutResponse = { session_id: string; checkout_url: string };
type ActionResult<T> = { data: T; error?: never } | { data?: never; error: string };

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
