"use server";

import { auth } from "@/lib/auth";

// Types
type CheckoutResponse = { session_id: string; checkout_url: string };
type ActionResult<T> = { data: T; error?: never } | { data?: never; error: string };

function getLicenseSvcUrl(): string {
  return process.env.LICENSE_SVC_URL ?? "http://localhost:3100";
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
    const res = await fetch(`${getLicenseSvcUrl()}/api/checkout/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        org_id: orgId,
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
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// Server action: Create billing portal session (for subscription management)
// NOTE: license-svc #32 (portal API) is not yet built — this is a forward-compatible stub
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

    const res = await fetch(`${getLicenseSvcUrl()}/api/portal/billing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ org_id: orgId }),
    });

    if (!res.ok) {
      // Portal API may not exist yet (license-svc #32)
      if (res.status === 404) {
        return { error: "Billing portal is not yet available. Contact support for billing changes." };
      }
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Portal session failed (${res.status})` };
    }

    const data = await res.json();
    return { data };
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

    const res = await fetch(`${getLicenseSvcUrl()}/api/entitlements/${orgId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LICENSE_SVC_ADMIN_KEY ?? ""}`,
        },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) {
      return {
        data: {
          tier: "community",
          status: "active",
          current_period_end: null,
          cancel_at_period_end: false,
          features: {},
          limits: {},
        },
      };
    }

    const entitlements = await res.json();
    return {
      data: {
        tier: entitlements.tier ?? "community",
        status: entitlements.is_active
          ? entitlements.is_grace_period
            ? "past_due"
            : "active"
          : "canceled",
        current_period_end: entitlements.expires_at ?? null,
        cancel_at_period_end: false,
        features: entitlements.features ?? {},
        limits: entitlements.limits ?? {},
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
