"use server";

import type { ActionResult } from "@/lib/result";
import { getAuthHeaders, getBackendUrl, resolveOrgId } from "./_shared";

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
