"use server";

import { auth } from "@/lib/auth";

export type ActionResult<T> = { data: T; error?: never } | { data?: never; error: string };

export type SubscriptionDetails = {
  id: string;
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

// Validates that an ID only contains safe characters (alphanumeric, hyphens, underscores)
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
function sanitizeId(id: string): string {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error("Invalid ID format");
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

function getBackendUrl(): string {
  return process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await auth();
  if (!session?.access_token) {
    throw new Error("Unauthorized");
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
  const headers = await getAuthHeaders();
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
    throw new Error(detail.detail || `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function getSubscription(): Promise<ActionResult<SubscriptionDetails>> {
  return withErrorHandling(async () => {
    return apiRequest<SubscriptionDetails>("/api/v1/billing/subscriptions");
  });
}

export async function getSubscriptionHistory(
  limit = 20,
  offset = 0,
): Promise<ActionResult<SubscriptionHistoryResponse>> {
  return withErrorHandling(async () => {
    return apiRequest<SubscriptionHistoryResponse>(
      `/api/v1/billing/subscriptions/history?limit=${limit}&offset=${offset}`,
    );
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
): Promise<ActionResult<InvoiceListResponse>> {
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

export async function getInvoice(invoiceId: string): Promise<ActionResult<InvoiceRecord>> {
  const headersResult = await getAuthHeaders();
  if (headersResult.error) {
    return headersResult;
  }

  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/billing/invoices/${sanitizeId(invoiceId)}`, {
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

export async function voidInvoice(invoiceId: string): Promise<ActionResult<InvoiceRecord>> {
  const headersResult = await getAuthHeaders();
  if (headersResult.error) {
    return headersResult;
  }

  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/billing/invoices/${sanitizeId(invoiceId)}/void`, {
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
