"use server";

import type { ActionResult } from "@/lib/result";
import { getAuthHeaders, getBackendUrl, resolveOrgId, sanitizeId } from "./_shared";

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

export async function getInvoice(
  invoiceId: string,
  orgId?: string,
): Promise<ActionResult<InvoiceRecord>> {
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
    const res = await fetch(
      `${getBackendUrl()}/api/v1/billing/invoices/${sanitizeId(invoiceId)}${query}`,
      {
        method: "GET",
        headers: headersResult.data,
        cache: "no-store",
      },
    );

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

export async function voidInvoice(
  invoiceId: string,
  orgId?: string,
): Promise<ActionResult<InvoiceRecord>> {
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
    const res = await fetch(
      `${getBackendUrl()}/api/v1/billing/invoices/${sanitizeId(invoiceId)}/void${query}`,
      {
        method: "POST",
        headers: headersResult.data,
      },
    );

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
