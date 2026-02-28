"use server";

import { auth } from "@/lib/auth";
import { getBackendUrl } from "@/lib/origin";
import type { ActionResult } from "@/lib/result";
export type { ActionResult };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateId(id: string): string {
  if (!UUID_RE.test(id)) {
    throw new Error("Invalid audit entry ID");
  }
  return id;
}

export type BillingAuditEntry = {
  id: string;
  org_id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  description: string;
  stripe_event_id: string | null;
  local_state: Record<string, unknown> | null;
  stripe_state: Record<string, unknown> | null;
  reconciliation_status: string | null;
  created_at: string;
};

export type BillingAuditListResponse = {
  items: BillingAuditEntry[];
  total: number;
  limit: number;
  offset: number;
};

export type ReconciliationReport = {
  started_at: string;
  completed_at: string;
  subscriptions_checked: number;
  invoices_checked: number;
  refunds_checked: number;
  mismatches: Array<{
    resource_type: string;
    resource_id: string;
    stripe_id: string;
    field: string;
    local_value: unknown;
    stripe_value: unknown;
    severity: string;
  }>;
  missing_local: string[];
  missing_stripe: string[];
};

export type BillingAuditFilters = {
  org_id?: string;
  resource_type?: string;
  resource_id?: string;
  action?: string;
  reconciliation_status?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
};

async function withAuthHeaders(): Promise<HeadersInit | null> {
  const session = await auth();
  if (!session?.access_token) {
    return null;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function getAuditLog(
  filters: BillingAuditFilters = {}
): Promise<ActionResult<BillingAuditListResponse>> {
  try {
    const headers = await withAuthHeaders();
    if (!headers) {
      return { error: "Unauthorized" };
    }

    const session = await auth();
    const orgId = session?.user?.org_id;
    if (!orgId) {
      return { error: "No organization found" };
    }

    const params = new URLSearchParams();
    params.set("org_id", orgId);
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "" && key !== "org_id") {
        params.set(key, String(value));
      }
    });

    const url = `${getBackendUrl()}/api/v1/billing/audit${params.size > 0 ? `?${params.toString()}` : ""}`;
    const response = await fetch(url, { method: "GET", headers, cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      return { error: body.detail ?? `Failed to fetch audit log (${response.status})` };
    }

    return { data: (await response.json()) as BillingAuditListResponse };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getAuditEntry(id: string): Promise<ActionResult<BillingAuditEntry>> {
  try {
    const headers = await withAuthHeaders();
    if (!headers) {
      return { error: "Unauthorized" };
    }
    const safeId = validateId(id);
    const response = await fetch(`${getBackendUrl()}/api/v1/billing/audit/${safeId}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      return { error: body.detail ?? `Failed to fetch audit entry (${response.status})` };
    }
    return { data: (await response.json()) as BillingAuditEntry };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function resolveAuditMismatch(
  id: string,
  resolution: string
): Promise<ActionResult<BillingAuditEntry>> {
  try {
    const headers = await withAuthHeaders();
    if (!headers) {
      return { error: "Unauthorized" };
    }
    const safeId = validateId(id);
    const response = await fetch(`${getBackendUrl()}/api/v1/billing/audit/${safeId}/resolve`, {
      method: "POST",
      headers,
      body: JSON.stringify({ resolution }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      return { error: body.detail ?? `Failed to resolve mismatch (${response.status})` };
    }
    return { data: (await response.json()) as BillingAuditEntry };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function triggerReconciliation(
  orgId?: string
): Promise<ActionResult<ReconciliationReport>> {
  try {
    const headers = await withAuthHeaders();
    if (!headers) {
      return { error: "Unauthorized" };
    }

    const session = await auth();
    const resolvedOrgId = orgId ?? session?.user?.org_id;
    if (!resolvedOrgId) {
      return { error: "No organization found" };
    }

    const query = `?org_id=${encodeURIComponent(resolvedOrgId)}`;
    const response = await fetch(`${getBackendUrl()}/api/v1/billing/reconcile${query}`, {
      method: "POST",
      headers,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      return { error: body.detail ?? `Failed to run reconciliation (${response.status})` };
    }
    return { data: (await response.json()) as ReconciliationReport };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}
