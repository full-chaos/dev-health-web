"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getServerEnv } from "@/lib/config";
import { AuthErrors, ValidationErrors, requestFailedMessage } from "@/lib/constants/errors";
import type { ActionResult } from "@/lib/result";

export type SubscriptionDetails = {
  id: string;
  org_id?: string;
  status: "active" | "past_due" | "canceled" | "trialing" | "incomplete";
  stripe_subscription_id: string;
  stripe_customer_id: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  plan?: Record<string, unknown> | null;
  price?: Record<string, unknown> | null;
};

export type SubscriptionHistoryItem = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  previous_status: string | null;
  new_status: string;
  processed_at: string;
  payload: Record<string, unknown>;
};

type SubscriptionHistoryResponse = {
  items: SubscriptionHistoryItem[];
  total: number;
  limit: number;
  offset: number;
};

type CheckoutSessionResponse = {
  session_id: string;
  url: string;
};

export type SubscriptionRecord = SubscriptionDetails & {
  org_id: string;
};

export type SubscriptionListResponse = {
  items: SubscriptionRecord[];
  total: number;
  limit: number;
  offset: number;
};

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

export type InvoiceLineItem = {
  id: string;
  stripe_line_item_id: string | null;
  description: string | null;
  amount: number;
  quantity: number;
  period_start: string | null;
  period_end: string | null;
  stripe_price_id: string | null;
};

export type InvoiceRecord = {
  id: string;
  org_id: string;
  subscription_id: string | null;
  stripe_invoice_id: string;
  stripe_customer_id: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  hosted_invoice_url: string | null;
  pdf_url: string | null;
  payment_intent_id: string | null;
  finalized_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  attempt_count: number;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  line_items: InvoiceLineItem[];
};

export type InvoiceListResponse = {
  items: InvoiceRecord[];
  total: number;
  limit: number;
  offset: number;
};

export type BillingPriceInput = {
  interval: "monthly" | "yearly";
  amount: number;
  currency?: string;
  is_active?: boolean;
  stripe_price_id?: string | null;
};

export type BillingPlanRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tier: string;
  is_active: boolean;
  display_order: number;
  stripe_product_id: string | null;
  metadata: Record<string, unknown>;
  prices: Array<{
    id: string;
    plan_id: string;
    interval: string;
    amount: number;
    currency: string;
    is_active: boolean;
    stripe_price_id: string | null;
  }>;
  bundles: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    features: string[];
  }>;
};

export type BillingPlanUpsert = {
  key: string;
  name: string;
  description?: string | null;
  tier: string;
  is_active?: boolean;
  display_order?: number;
  metadata?: Record<string, unknown>;
  prices?: BillingPriceInput[];
  bundle_ids?: string[];
};

// Validates that an ID only contains safe characters (alphanumeric, hyphens, underscores)
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
function sanitizeId(id: string): string {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(ValidationErrors.InvalidIdFormat);
  }
  return id;
}

async function getAuthHeaders(): Promise<ActionResult<HeadersInit>> {
  const session = await auth();
  if (!session?.access_token) {
    return { error: "Unauthorized" };
  }

  return {
    data: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  };
}

async function resolveOrgId(orgId?: string): Promise<ActionResult<string | undefined>> {
  const session = await auth();
  if (!session?.access_token) {
    return { error: "Unauthorized" };
  }

  const sessionOrgId = session.user?.org_id;
  const isSuperuser = session.user?.is_superuser ?? false;

  if (!orgId) {
    return { data: sessionOrgId };
  }

  if (isSuperuser) {
    return { data: orgId };
  }

  if (orgId !== sessionOrgId) {
    return { error: "Access denied: cannot access resources for another organization" };
  }

  return { data: orgId };
}

function getBackendUrl(): string {
  return getServerEnv().BACKEND_URL ?? "http://127.0.0.1:8000";
}

async function getAuthHeadersOrThrow(): Promise<Record<string, string>> {
  const session = await auth();
  if (!session?.access_token) {
    throw new Error(AuthErrors.Unauthorized);
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function withErrorHandling<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { data: await fn() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeadersOrThrow();
  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(detail.detail || requestFailedMessage(response.status));
  }

  return (await response.json()) as T;
}

export async function getSubscription(orgId?: string): Promise<ActionResult<SubscriptionDetails>> {
  const orgResult = await resolveOrgId(orgId);
  if (orgResult.error) {
    return orgResult;
  }

  return withErrorHandling(async () => {
    const params = new URLSearchParams();
    if (orgResult.data) {
      params.set("org_id", orgResult.data);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return apiRequest<SubscriptionDetails>(`/api/v1/billing/subscriptions${query}`);
  });
}

export async function startTrialCheckout(): Promise<ActionResult<{ url: string }>> {
  const headersResult = await getAuthHeaders();
  if (headersResult.error) {
    return headersResult;
  }

  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/billing/checkout`, {
      method: "POST",
      headers: headersResult.data,
      body: JSON.stringify({
        tier: "team",
        success_url: "/dashboard?trial=started",
        cancel_url: "/dashboard?trial=setup_incomplete",
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: detail.detail || `Failed to create checkout session (${res.status})` };
    }

    const data = (await res.json()) as CheckoutSessionResponse;
    if (!data.url) {
      return { error: "Checkout session did not return a redirect URL" };
    }

    return { data: { url: data.url } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function getSubscriptions(
  limit = 20,
  offset = 0,
  orgId?: string,
): Promise<ActionResult<SubscriptionListResponse>> {
  const orgResult = await resolveOrgId(orgId);
  if (orgResult.error) {
    return orgResult;
  }

  return withErrorHandling(async () => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (orgResult.data) {
      params.set("org_id", orgResult.data);
    }
    return apiRequest<SubscriptionListResponse>(
      `/api/v1/billing/subscriptions/list?${params.toString()}`,
    );
  });
}

export async function getSubscriptionHistory(
  limit = 20,
  offset = 0,
  orgId?: string,
): Promise<ActionResult<SubscriptionHistoryResponse>> {
  const orgResult = await resolveOrgId(orgId);
  if (orgResult.error) {
    return orgResult;
  }

  return withErrorHandling(async () => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (orgResult.data) {
      params.set("org_id", orgResult.data);
    }
    return apiRequest<SubscriptionHistoryResponse>(`/api/v1/billing/subscriptions/history?${params.toString()}`);
  });
}

export async function changePlan(priceId: string): Promise<ActionResult<{ status: string }>> {
  return withErrorHandling(async () => {
    return apiRequest<{ status: string }>("/api/v1/billing/subscriptions/change-plan", {
      method: "POST",
      body: JSON.stringify({ price_id: priceId }),
    });
  });
}

export async function cancelSubscription(
  immediately: boolean,
): Promise<ActionResult<{ status: string }>> {
  return withErrorHandling(async () => {
    return apiRequest<{ status: string }>("/api/v1/billing/subscriptions/cancel", {
      method: "POST",
      body: JSON.stringify({ immediately }),
    });
  });
}

export async function reactivateSubscription(): Promise<ActionResult<{ status: string }>> {
  return withErrorHandling(async () => {
    return apiRequest<{ status: string }>("/api/v1/billing/subscriptions/reactivate", {
      method: "POST",
      body: JSON.stringify({}),
    });
  });
}

export async function getInvoices(
  limit = 20,
  offset = 0,
  status?: string,
  orgId?: string,
): Promise<ActionResult<InvoiceListResponse>> {
  const orgResult = await resolveOrgId(orgId);
  if (orgResult.error) {
    return orgResult;
  }

  const headersResult = await getAuthHeaders();
  if (headersResult.error) {
    return headersResult;
  }

  try {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (status) {
      params.set("status", status);
    }
    if (orgResult.data) {
      params.set("org_id", orgResult.data);
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/invoices?${params.toString()}`, {
      method: "GET",
      headers: headersResult.data,
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: detail.detail || `Failed to load invoices (${res.status})` };
    }

    const data = (await res.json()) as InvoiceListResponse;
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function getInvoice(invoiceId: string, orgId?: string): Promise<ActionResult<InvoiceRecord>> {
  const orgResult = await resolveOrgId(orgId);
  if (orgResult.error) {
    return orgResult;
  }

  const headersResult = await getAuthHeaders();
  if (headersResult.error) {
    return headersResult;
  }

  try {
    const params = new URLSearchParams();
    if (orgResult.data) {
      params.set("org_id", orgResult.data);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const res = await fetch(`${getBackendUrl()}/api/v1/billing/invoices/${sanitizeId(invoiceId)}${query}`, {
      method: "GET",
      headers: headersResult.data,
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: detail.detail || `Failed to load invoice (${res.status})` };
    }

    const data = (await res.json()) as InvoiceRecord;
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function voidInvoice(invoiceId: string, orgId?: string): Promise<ActionResult<InvoiceRecord>> {
  const orgResult = await resolveOrgId(orgId);
  if (orgResult.error) {
    return orgResult;
  }

  const headersResult = await getAuthHeaders();
  if (headersResult.error) {
    return headersResult;
  }

  try {
    const params = new URLSearchParams();
    if (orgResult.data) {
      params.set("org_id", orgResult.data);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const res = await fetch(`${getBackendUrl()}/api/v1/billing/invoices/${sanitizeId(invoiceId)}/void${query}`, {
      method: "POST",
      headers: headersResult.data,
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: detail.detail || `Failed to void invoice (${res.status})` };
    }

    const data = (await res.json()) as InvoiceRecord;
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function createRefund(input: {
  invoiceId: string;
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  description?: string;
}, orgId?: string): Promise<ActionResult<RefundRecord>> {
  const orgResult = await resolveOrgId(orgId);
  if (orgResult.error) {
    return orgResult;
  }

  const headersResult = await getAuthHeaders();
  if (headersResult.error) {
    return headersResult;
  }

  try {
    const payload: Record<string, unknown> = {
      invoice_id: input.invoiceId,
      reason: input.reason,
      description: input.description,
    };
    if (typeof input.amount === "number") {
      payload.amount = input.amount;
    }

    const params = new URLSearchParams();
    if (orgResult.data) {
      params.set("org_id", orgResult.data);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const res = await fetch(`${getBackendUrl()}/api/v1/billing/refunds${query}`, {
      method: "POST",
      headers: headersResult.data,
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
}, orgId?: string): Promise<ActionResult<RefundListResponse>> {
  const orgResult = await resolveOrgId(orgId);
  if (orgResult.error) {
    return orgResult;
  }

  const headersResult = await getAuthHeaders();
  if (headersResult.error) {
    return headersResult;
  }

  try {
    const params = new URLSearchParams();
    if (typeof input?.limit === "number") {
      params.set("limit", String(input.limit));
    }
    if (typeof input?.offset === "number") {
      params.set("offset", String(input.offset));
    }
    if (orgResult.data) {
      params.set("org_id", orgResult.data);
    }

    const query = params.toString();
    const res = await fetch(
      `${getBackendUrl()}/api/v1/billing/refunds${query ? `?${query}` : ""}`,
      {
        method: "GET",
        headers: headersResult.data,
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

export async function listBillingPlans(includeInactive = false): Promise<ActionResult<BillingPlanRecord[]>> {
  try {
    const session = await auth();
    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const url = `${getBackendUrl()}/api/v1/billing/plans${includeInactive ? "?include_inactive=true" : ""}`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to load plans (${res.status})` };
    }

    const data = (await res.json()) as BillingPlanRecord[];
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function createBillingPlan(data: BillingPlanUpsert): Promise<ActionResult<BillingPlanRecord>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to create plan (${res.status})` };
    }

    const plan = (await res.json()) as BillingPlanRecord;
    revalidatePath("/pricing");
    return { data: plan };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateBillingPlan(
  planId: string,
  data: Partial<BillingPlanUpsert>
): Promise<ActionResult<BillingPlanRecord>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/plans/${sanitizeId(planId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to update plan (${res.status})` };
    }

    const plan = (await res.json()) as BillingPlanRecord;
    revalidatePath("/pricing");
    return { data: plan };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function deleteBillingPlan(planId: string): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/plans/${sanitizeId(planId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to delete plan (${res.status})` };
    }

    const result = (await res.json()) as { deleted: boolean };
    revalidatePath("/pricing");
    return { data: result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function syncBillingPlanToStripe(planId: string): Promise<ActionResult<BillingPlanRecord>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/plans/${sanitizeId(planId)}/sync-stripe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to sync plan (${res.status})` };
    }

    const plan = (await res.json()) as BillingPlanRecord;
    revalidatePath("/pricing");
    return { data: plan };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type PullStripeResult = {
  created: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
};

export async function pullPlansFromStripe(): Promise<ActionResult<PullStripeResult>> {
  const result = await withErrorHandling(() =>
    apiRequest<PullStripeResult>("/api/v1/billing/plans/pull-stripe", { method: "POST" })
  );
  if (!result.error) {
    revalidatePath("/pricing");
  }
  return result;
}

export async function getBillingPortalUrl(orgId?: string): Promise<ActionResult<{ url: string }>> {
  const orgResult = await resolveOrgId(orgId);
  if (orgResult.error) {
    return orgResult;
  }

  return withErrorHandling(async () => {
    const params = new URLSearchParams();
    if (orgResult.data) {
      params.set("org_id", orgResult.data);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return apiRequest<{ url: string }>(`/api/v1/billing/portal${query}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  });
}
